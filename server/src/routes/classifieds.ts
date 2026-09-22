import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { parseJson } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getMonetizationSettings, isFeaturedClassified } from '../lib/settings.js';
import { classifiedLimitMessage, getClassifiedQuota } from '../lib/classifiedsQuota.js';

const router = Router();

const CATEGORIES = [
  'furniture', 'electronics', 'cars', 'clothes', 'real_estate',
  'brazilian_products', 'services', 'baby', 'home', 'other',
] as const;

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

function mapListing(row: Record<string, unknown>, settings?: Awaited<ReturnType<typeof getMonetizationSettings>>) {
  const featured = settings
    ? isFeaturedClassified(settings, row as { is_featured?: number; featured_until?: string | null })
    : !!row.is_featured;
  return {
    ...row,
    photos: parseJson((row.photos as string) || '[]', [] as string[]),
    rating_avg: Number(row.rating_avg || 0),
    rating_count: Number(row.rating_count || 0),
    is_featured: featured,
  };
}

function ratingSubquery() {
  return `(SELECT ROUND(AVG(r.rating), 1) FROM reviews r
           WHERE r.target_type = 'classified' AND r.target_id = c.id AND r.is_active = 1) AS rating_avg,
          (SELECT COUNT(*) FROM reviews r
           WHERE r.target_type = 'classified' AND r.target_id = c.id AND r.is_active = 1) AS rating_count`;
}

router.get('/quota', authMiddleware, async (req: AuthRequest, res) => {
  res.json(await getClassifiedQuota(req.user!.id));
});

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const country = (req.query.country as string)?.trim();
  const city = (req.query.city as string)?.trim();
  const category = (req.query.category as string)?.trim();
  const status = ((req.query.status as string) || 'active').trim();
  const q = (req.query.q as string)?.trim();
  const mine = req.query.mine === '1';

  const profile = await db.get<{ current_country: string; current_city: string }>(
    'SELECT current_country, current_city FROM public_profiles WHERE user_id = ?',
    [req.user!.id]
  );

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
    conditions.push('(c.title ILIKE ? OR c.description ILIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const settings = await getMonetizationSettings();

  const listings = await db.all<Record<string, unknown>>(
    `SELECT c.*, u.full_name AS seller_name, u.username AS seller_username, u.avatar_url AS seller_avatar,
            u.is_verified AS seller_verified,
            ${ratingSubquery()}
     FROM classifieds c
     JOIN users u ON u.id = c.seller_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE WHEN c.is_featured = 1 AND (c.featured_until IS NULL OR c.featured_until >= utc_now()) THEN 0 ELSE 1 END,
       CASE WHEN LOWER(TRIM(c.city)) = LOWER(?) THEN 0 ELSE 1 END,
       CASE WHEN c.status = 'active' THEN 0 ELSE 1 END,
       c.created_at DESC
     LIMIT 60`,
    [...params, (profile?.current_city || '').trim()]
  );

  res.json(listings.map((row) => mapListing(row, settings)));
});

router.get('/categories', authMiddleware, (_req, res) => {
  res.json(CATEGORIES);
});

router.get('/:id', authMiddleware, async (req, res) => {
  const id = paramId(req.params.id);
  const row = await db.get<Record<string, unknown>>(
    `SELECT c.*, u.full_name AS seller_name, u.username AS seller_username, u.avatar_url AS seller_avatar,
            u.is_verified AS seller_verified, u.email_verified AS seller_email_verified,
            ${ratingSubquery()}
     FROM classifieds c
     JOIN users u ON u.id = c.seller_id
     WHERE c.id = ? AND c.is_active = 1`,
    [id]
  );
  if (!row) return res.status(404).json({ error: 'Anúncio não encontrado' });
  res.json(mapListing(row, await getMonetizationSettings()));
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
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

  const settings = await getMonetizationSettings();
  const quota = await getClassifiedQuota(req.user!.id);
  if (!quota.can_create) {
    return res.status(402).json({
      error: classifiedLimitMessage(settings, quota),
      code: 'classified_limit',
      quota,
    });
  }

  const id = uuid();
  await db.run(
    `INSERT INTO classifieds (
       id, title, description, category, price, currency, condition_label,
       city, country, photos, contact_whatsapp, seller_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      req.user!.id,
    ]
  );

  const row = await db.get<Record<string, unknown>>(
    `SELECT c.*, u.full_name AS seller_name, u.username AS seller_username, u.avatar_url AS seller_avatar,
            u.is_verified AS seller_verified, 0 AS rating_avg, 0 AS rating_count
     FROM classifieds c JOIN users u ON u.id = c.seller_id WHERE c.id = ?`,
    [id]
  );
  res.status(201).json(mapListing(row!, settings));
});

router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const existing = await db.get<{ seller_id: string }>(
    'SELECT * FROM classifieds WHERE id = ? AND is_active = 1',
    [id]
  );
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

  await db.run(
    `UPDATE classifieds SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       category = COALESCE(?, category),
       price = CASE WHEN ?::integer IS NOT NULL THEN ?::double precision ELSE price END,
       currency = COALESCE(?, currency),
       condition_label = COALESCE(?, condition_label),
       city = COALESCE(?, city),
       country = COALESCE(?, country),
       photos = COALESCE(?, photos),
       contact_whatsapp = COALESCE(?, contact_whatsapp),
       status = COALESCE(?, status)
     WHERE id = ?`,
    [
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
      id,
    ]
  );

  const row = await db.get<Record<string, unknown>>(
    `SELECT c.*, u.full_name AS seller_name, u.username AS seller_username, u.avatar_url AS seller_avatar,
            u.is_verified AS seller_verified, ${ratingSubquery()}
     FROM classifieds c JOIN users u ON u.id = c.seller_id WHERE c.id = ?`,
    [id]
  );
  res.json(mapListing(row!, await getMonetizationSettings()));
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const existing = await db.get<{ seller_id: string }>(
    'SELECT seller_id FROM classifieds WHERE id = ?',
    [id]
  );
  if (!existing) return res.status(404).json({ error: 'Anúncio não encontrado' });
  if (existing.seller_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });
  await db.run(`UPDATE classifieds SET is_active = 0, status = 'inactive' WHERE id = ?`, [id]);
  res.json({ ok: true });
});

export default router;
