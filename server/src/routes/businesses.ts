import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb, parseJson, userSnapshot, UserRow } from '../db/database.js';
import { authMiddleware, AuthRequest, createNotification } from '../middleware/auth.js';
import { paramId } from '../lib/params.js';

const router = Router();

function mapBusinessRow(b: Record<string, unknown>) {
  const row = b as {
    is_featured?: number; featured_until?: string | null; is_verified?: number;
    skills: string; photos: string; social_links: string;
    rating_avg?: number; rating_count?: number;
  };
  return {
    ...b,
    is_featured: !!row.is_featured && (!row.featured_until || new Date(row.featured_until) >= new Date()),
    is_verified: !!row.is_verified,
    skills: parseJson(row.skills, []),
    photos: parseJson(row.photos, []),
    social_links: parseJson(row.social_links, {}),
    rating_avg: Number(row.rating_avg || 0),
    rating_count: Number(row.rating_count || 0),
  };
}

router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const country = (req.query.country as string)?.trim();
  const category = (req.query.category as string)?.trim();
  const state = (req.query.state as string)?.trim();
  const city = (req.query.city as string)?.trim();
  const q = (req.query.q as string)?.trim();

  const conditions = ['is_active = 1', "UPPER(TRIM(country)) != 'BR'"];
  const params: string[] = [];

  if (country) {
    conditions.push('country = ?');
    params.push(country);
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (state) {
    conditions.push('(state = ? OR (TRIM(COALESCE(state, "")) = "" AND address LIKE ?))');
    params.push(state, `%${state}%`);
  }
  if (city) {
    conditions.push('(city = ? OR (TRIM(COALESCE(city, "")) = "" AND address LIKE ?))');
    params.push(city, `%${city}%`);
  }
  if (q) {
    conditions.push('(name LIKE ? OR category LIKE ? OR address LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const businesses = db.prepare(
    `SELECT b.*,
       (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.target_type = 'business' AND r.target_id = b.id AND r.is_active = 1) AS rating_avg,
       (SELECT COUNT(*) FROM reviews r WHERE r.target_type = 'business' AND r.target_id = b.id AND r.is_active = 1) AS rating_count
     FROM businesses b WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE WHEN is_featured = 1 AND (featured_until IS NULL OR featured_until >= datetime('now')) THEN 0 ELSE 1 END,
       featured_order ASC,
       created_at DESC
     LIMIT 100`
  ).all(...params);

  res.json(businesses.map((b) => mapBusinessRow(b as Record<string, unknown>)));
});

router.get('/mine', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const businesses = db.prepare('SELECT * FROM businesses WHERE owner_id = ? ORDER BY created_at DESC').all(req.user!.id);
  res.json(
    businesses.map((b) => ({
      ...b,
      skills: parseJson((b as { skills: string }).skills, []),
      photos: parseJson((b as { photos: string }).photos, []),
      social_links: parseJson((b as { social_links: string }).social_links, {}),
    }))
  );
});

router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const id = paramId(req.params.id);
  const row = db.prepare(
    `SELECT b.*, u.full_name AS owner_name, u.username AS owner_username, u.avatar_url AS owner_avatar_url,
            (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.target_type = 'business' AND r.target_id = b.id AND r.is_active = 1) AS rating_avg,
            (SELECT COUNT(*) FROM reviews r WHERE r.target_type = 'business' AND r.target_id = b.id AND r.is_active = 1) AS rating_count
     FROM businesses b
     JOIN users u ON u.id = b.owner_id
     WHERE b.id = ? AND b.is_active = 1`
  ).get(id);
  if (!row) return res.status(404).json({ error: 'Negócio não encontrado' });
  res.json(mapBusinessRow(row as Record<string, unknown>));
});

router.post('/', authMiddleware, (req: AuthRequest, res) => {
  const { name, category, country, latitude, longitude, address, state, city, tagline, description, skills = [], photos = [], social_links = {} } = req.body;
  if (!name || !category || !country) return res.status(400).json({ error: 'Campos obrigatórios faltando' });

  const id = uuid();
  const db = getDb();
  db.prepare(
    `INSERT INTO businesses (id, name, category, country, owner_id, latitude, longitude, address, state, city, tagline, description, skills, photos, social_links)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, name, category, country, req.user!.id,
    latitude ?? null, longitude ?? null, address || '', state || '', city || '',
    tagline || '', description || '',
    JSON.stringify(skills), JSON.stringify(photos), JSON.stringify(social_links)
  );

  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id);
  res.status(201).json({
    ...business,
    skills: parseJson((business as { skills: string }).skills, []),
    photos: parseJson((business as { photos: string }).photos, []),
    social_links: parseJson((business as { social_links: string }).social_links, {}),
  });
});

router.patch('/:id', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id) as { owner_id: string } | undefined;
  if (!business) return res.status(404).json({ error: 'Negócio não encontrado' });
  if (business.owner_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });

  const { name, category, country, latitude, longitude, address, state, city, tagline, description, skills, photos, social_links, is_active } = req.body;
  db.prepare(
    `UPDATE businesses SET
     name = COALESCE(?, name),
     category = COALESCE(?, category),
     country = COALESCE(?, country),
     latitude = COALESCE(?, latitude),
     longitude = COALESCE(?, longitude),
     address = COALESCE(?, address),
     state = COALESCE(?, state),
     city = COALESCE(?, city),
     tagline = COALESCE(?, tagline),
     description = COALESCE(?, description),
     skills = COALESCE(?, skills),
     photos = COALESCE(?, photos),
     social_links = COALESCE(?, social_links),
     is_active = COALESCE(?, is_active)
     WHERE id = ?`
  ).run(
    name ?? null, category ?? null, country ?? null,
    latitude ?? null, longitude ?? null, address ?? null,
    state ?? null, city ?? null, tagline ?? null, description ?? null,
    skills ? JSON.stringify(skills) : null,
    photos ? JSON.stringify(photos) : null,
    social_links ? JSON.stringify(social_links) : null,
    is_active ?? null,
    id
  );

  const updated = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id);
  res.json({
    ...updated,
    skills: parseJson((updated as { skills: string }).skills, []),
    photos: parseJson((updated as { photos: string }).photos, []),
    social_links: parseJson((updated as { social_links: string }).social_links, {}),
  });
});

router.delete('/:id', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(id) as { owner_id: string } | undefined;
  if (!business) return res.status(404).json({ error: 'Negócio não encontrado' });
  if (business.owner_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });
  db.prepare('UPDATE businesses SET is_active = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
