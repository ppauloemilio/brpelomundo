import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb, parseJson } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const CATEGORIES = [
  'furniture', 'electronics', 'cars', 'clothes', 'real_estate',
  'brazilian_products', 'services', 'baby', 'home', 'other',
] as const;

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

function mapListing(row: Record<string, unknown>) {
  return {
    ...row,
    photos: parseJson((row.photos as string) || '[]', [] as string[]),
    rating_avg: Number(row.rating_avg || 0),
    rating_count: Number(row.rating_count || 0),
  };
}

function ratingSubquery() {
  return `(SELECT ROUND(AVG(r.rating), 1) FROM reviews r
           WHERE r.target_type = 'classified' AND r.target_id = c.id AND r.is_active = 1) AS rating_avg,
          (SELECT COUNT(*) FROM reviews r
           WHERE r.target_type = 'classified' AND r.target_id = c.id AND r.is_active = 1) AS rating_count`;
}

router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const country = (req.query.country as string)?.trim();
  const city = (req.query.city as string)?.trim();
  const category = (req.query.category as string)?.trim();
  const status = ((req.query.status as string) || 'active').trim();
  const q = (req.query.q as string)?.trim();
  const mine = req.query.mine === '1';

  const profile = db.prepare(
    'SELECT current_country, current_city FROM public_profiles WHERE user_id = ?'
  ).get(req.user!.id) as { current_country: string; current_city: string } | undefined;

  const conditions = ['c.is_active = 1', "UPPER(TRIM(c.country)) != 'BR'"];
  const params: string[] = [];

  if (mine) {
    conditions.push('c.seller_id = ?');
    params.push(req.user!.id);
  } else if (status && status !== 'all') {
    conditions.push('c.status = ?');
    params.push(status);
  }

  const filterCountry = country || (!mine ? profile?.current_country : '') || '';
  if (filterCountry && filterCountry.toUpperCase() !== 'BR') {
    conditions.push('c.country = ?');
    params.push(filterCountry);
  }
  if (city) {
    conditions.push('LOWER(TRIM(c.city)) = LOWER(?)');
    params.push(city);
  }
  if (category) {
    conditions.push('c.category = ?');
    params.push(category);
  }
  if (q) {
    conditions.push('(c.title LIKE ? OR c.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const listings = db.prepare(
    `SELECT c.*, u.full_name AS seller_name, u.username AS seller_username, u.avatar_url AS seller_avatar,
            u.is_verified AS seller_verified,
            ${ratingSubquery()}
     FROM classifieds c
     JOIN users u ON u.id = c.seller_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE WHEN LOWER(TRIM(c.city)) = LOWER(?) THEN 0 ELSE 1 END,
       CASE WHEN c.status = 'active' THEN 0 ELSE 1 END,
       c.created_at DESC
     LIMIT 60`
  ).all(...params, (profile?.current_city || '').trim());

  res.json(listings.map((row) => mapListing(row as Record<string, unknown>)));
});

router.get('/categories', authMiddleware, (_req, res) => {
  res.json(CATEGORIES);
});

router.get('/:id', authMiddleware, (req, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const row = db.prepare(
    `SELECT c.*, u.full_name AS seller_name, u.username AS seller_username, u.avatar_url AS seller_avatar,
            u.is_verified AS seller_verified, u.email_verified AS seller_email_verified,
            ${ratingSubquery()}
     FROM classifieds c
     JOIN users u ON u.id = c.seller_id
     WHERE c.id = ? AND c.is_active = 1`
  ).get(id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: 'Anúncio não encontrado' });
  res.json(mapListing(row));
});

router.post('/', authMiddleware, (req: AuthRequest, res) => {
  const {
    title, description, category, price, currency, condition_label,
    city, country, photos, contact_whatsapp,
  } = req.body;

  if (!title?.trim() || !category?.trim() || !city?.trim() || !country?.trim()) {
    return res.status(400).json({ error: 'Título, categoria, cidade e país são obrigatórios' });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Categoria inválida' });
  }

  const id = uuid();
  const db = getDb();
  db.prepare(
    `INSERT INTO classifieds (
       id, title, description, category, price, currency, condition_label,
       city, country, photos, contact_whatsapp, seller_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    title.trim(),
    description?.trim() || '',
    category,
    price != null && price !== '' ? Number(price) : null,
    currency || 'USD',
    condition_label || 'used',
    city.trim(),
    country.trim(),
    JSON.stringify(Array.isArray(photos) ? photos : []),
    contact_whatsapp?.trim() || '',
    req.user!.id
  );

  const row = db.prepare(
    `SELECT c.*, u.full_name AS seller_name, u.username AS seller_username, u.avatar_url AS seller_avatar,
            u.is_verified AS seller_verified, 0 AS rating_avg, 0 AS rating_count
     FROM classifieds c JOIN users u ON u.id = c.seller_id WHERE c.id = ?`
  ).get(id) as Record<string, unknown>;
  res.status(201).json(mapListing(row));
});

router.patch('/:id', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM classifieds WHERE id = ? AND is_active = 1').get(id) as
    | { seller_id: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Anúncio não encontrado' });
  if (existing.seller_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });

  const {
    title, description, category, price, currency, condition_label,
    city, country, photos, contact_whatsapp, status,
  } = req.body;

  if (status && !['active', 'sold', 'inactive'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Categoria inválida' });
  }

  db.prepare(
    `UPDATE classifieds SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       category = COALESCE(?, category),
       price = CASE WHEN ? IS NOT NULL THEN ? ELSE price END,
       currency = COALESCE(?, currency),
       condition_label = COALESCE(?, condition_label),
       city = COALESCE(?, city),
       country = COALESCE(?, country),
       photos = COALESCE(?, photos),
       contact_whatsapp = COALESCE(?, contact_whatsapp),
       status = COALESCE(?, status)
     WHERE id = ?`
  ).run(
    title?.trim() ?? null,
    description?.trim() ?? null,
    category ?? null,
    price !== undefined ? 1 : null,
    price !== undefined ? (price === '' || price == null ? null : Number(price)) : null,
    currency ?? null,
    condition_label ?? null,
    city?.trim() ?? null,
    country?.trim() ?? null,
    photos !== undefined ? JSON.stringify(photos) : null,
    contact_whatsapp !== undefined ? (contact_whatsapp?.trim() || '') : null,
    status ?? null,
    id
  );

  const row = db.prepare(
    `SELECT c.*, u.full_name AS seller_name, u.username AS seller_username, u.avatar_url AS seller_avatar,
            u.is_verified AS seller_verified, ${ratingSubquery()}
     FROM classifieds c JOIN users u ON u.id = c.seller_id WHERE c.id = ?`
  ).get(id) as Record<string, unknown>;
  res.json(mapListing(row));
});

router.delete('/:id', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const existing = db.prepare('SELECT seller_id FROM classifieds WHERE id = ?').get(id) as
    | { seller_id: string }
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Anúncio não encontrado' });
  if (existing.seller_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });
  db.prepare(`UPDATE classifieds SET is_active = 0, status = 'inactive' WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default router;
