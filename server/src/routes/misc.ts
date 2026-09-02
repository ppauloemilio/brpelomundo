import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { getDb, parseJson } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { uploadsDir } from '../lib/uploads.js';
import { getMonetizationSettings, isPremiumProfile } from '../lib/settings.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

router.get('/settings/public', (_req, res) => {
  res.json(getMonetizationSettings());
});

router.get('/countries', (_req, res) => {
  const countries = getDb().prepare('SELECT * FROM countries WHERE is_active = 1 ORDER BY name').all();
  res.json(countries);
});

router.get('/skills', (_req, res) => {
  const skills = getDb().prepare('SELECT * FROM skills ORDER BY name').all();
  res.json(skills);
});

router.get('/advertisements', (_req, res) => {
  const settings = getMonetizationSettings();
  if (!settings.ads_enabled) return res.json([]);
  const ads = getDb().prepare(
    `SELECT * FROM advertisements WHERE is_active = 1
     AND (start_date IS NULL OR start_date <= date('now'))
     AND (end_date IS NULL OR end_date >= date('now'))
     ORDER BY order_num ASC`
  ).all();
  res.json(ads);
});

router.get('/explore', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const type = (req.query.type as string) || 'people';
  const q = (req.query.q as string)?.trim();
  const country = (req.query.country as string)?.trim();
  const state = (req.query.state as string)?.trim();
  const city = (req.query.city as string)?.trim();
  const area = (req.query.area as string)?.trim();

  if (type === 'businesses') {
    const conditions = ['b.is_active = 1', "UPPER(TRIM(b.country)) != 'BR'"];
    const params: string[] = [];

    if (country) {
      conditions.push('b.country = ?');
      params.push(country);
    }
    if (area) {
      conditions.push('(b.category LIKE ? OR b.skills LIKE ?)');
      params.push(`%${area}%`, `%${area}%`);
    }
    if (city) {
      conditions.push('(b.city = ? OR (TRIM(COALESCE(b.city, "")) = "" AND b.address LIKE ?))');
      params.push(city, `%${city}%`);
    }
    if (state) {
      conditions.push('(b.state = ? OR (TRIM(COALESCE(b.state, "")) = "" AND b.address LIKE ?))');
      params.push(state, `%${state}%`);
    }
    if (q) {
      conditions.push('(b.name LIKE ? OR b.category LIKE ? OR b.address LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const businesses = db.prepare(
      `SELECT b.*, u.full_name as owner_name, u.username as owner_username
       FROM businesses b
       JOIN users u ON u.id = b.owner_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.created_at DESC
       LIMIT 50`
    ).all(...params);

    return res.json({
      users: [],
      businesses: businesses.map((b) => ({
        ...b,
        skills: parseJson((b as { skills: string }).skills, []),
        photos: parseJson((b as { photos: string }).photos, []),
      })),
    });
  }

  const conditions = ["UPPER(TRIM(p.current_country)) != 'BR'"];
  const params: string[] = [];

  if (country) {
    conditions.push('p.current_country = ?');
    params.push(country);
  }
  if (state) {
    conditions.push('p.current_state = ?');
    params.push(state);
  }
  if (city) {
    conditions.push('p.current_city = ?');
    params.push(city);
  }
  if (area) {
    conditions.push('p.primary_skill = ?');
    params.push(area);
  }
  if (q) {
    conditions.push(
      `(u.full_name LIKE ? OR u.username LIKE ? OR p.bio LIKE ? OR p.primary_skill LIKE ?
        OR EXISTS (SELECT 1 FROM user_skills us WHERE us.user_id = u.id AND us.skill_name LIKE ?))`
    );
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const users = db.prepare(
    `SELECT u.id, u.username, u.full_name, u.avatar_url,
            p.bio, p.current_country, p.current_city, p.current_state,
            p.primary_skill, p.show_city_on_profile, p.is_premium, p.premium_until
     FROM users u
     JOIN public_profiles p ON p.user_id = u.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE WHEN p.is_premium = 1 AND (p.premium_until IS NULL OR p.premium_until >= datetime('now')) THEN 0 ELSE 1 END,
       u.full_name ASC
     LIMIT 50`
  ).all(...params);

  const mappedUsers = (users as Array<Record<string, unknown>>).map((u) => ({
    ...u,
    is_premium: isPremiumProfile(u as { is_premium?: number; premium_until?: string | null }),
  }));

  res.json({ users: mappedUsers, businesses: [] });
});

router.get('/search', authMiddleware, (req: AuthRequest, res) => {
  const q = (req.query.q as string)?.trim();
  if (!q) return res.json({ businesses: [], users: [], posts: [] });

  const db = getDb();
  const businesses = db.prepare(
    `SELECT id, name, category, address FROM businesses WHERE is_active = 1
     AND (name LIKE ? OR category LIKE ? OR address LIKE ?) LIMIT 10`
  ).all(`%${q}%`, `%${q}%`, `%${q}%`);

  const users = db.prepare(
    `SELECT u.id, u.full_name, u.username FROM users u
     WHERE u.full_name LIKE ? OR u.username LIKE ? LIMIT 10`
  ).all(`%${q}%`, `%${q}%`);

  const posts = db.prepare(
    `SELECT id, content FROM posts WHERE is_active = 1 AND content LIKE ? LIMIT 10`
  ).all(`%${q}%`);

  res.json({ businesses, users, posts });
});

router.get('/feed/sidebar', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const profile = db.prepare(
    'SELECT current_country, current_city FROM public_profiles WHERE user_id = ?'
  ).get(req.user!.id) as { current_country: string; current_city: string } | undefined;
  const country = profile?.current_country || 'BR';
  const city = (profile?.current_city || '').trim();

  const trending = db.prepare(
    `SELECT id, content, likes_count FROM posts WHERE is_active = 1 AND country = ?
     ORDER BY likes_count DESC LIMIT 5`
  ).all(country);

  let users;
  if (city) {
    users = db.prepare(
      `SELECT u.id, u.username, u.full_name, u.avatar_url, p.current_country, p.current_city,
              CASE WHEN LOWER(TRIM(p.current_city)) = LOWER(?) THEN 0 ELSE 1 END AS city_rank
       FROM users u
       JOIN public_profiles p ON p.user_id = u.id
       WHERE p.current_country = ? AND u.id != ?
       ORDER BY city_rank ASC, u.full_name ASC
       LIMIT 10`
    ).all(city, country, req.user!.id);
  } else {
    users = db.prepare(
      `SELECT u.id, u.username, u.full_name, u.avatar_url, p.current_country, p.current_city
       FROM users u
       JOIN public_profiles p ON p.user_id = u.id
       WHERE p.current_country = ? AND u.id != ?
       ORDER BY u.full_name ASC
       LIMIT 10`
    ).all(country, req.user!.id);
  }

  res.json({
    trending,
    users: (users as Array<Record<string, unknown>>).map((u) => ({
      id: u.id,
      username: u.username,
      full_name: u.full_name,
      avatar_url: u.avatar_url,
      current_country: u.current_country,
      address: u.current_city || '',
      current_city: u.current_city || '',
    })),
    country,
    city,
  });
});

router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

export default router;
