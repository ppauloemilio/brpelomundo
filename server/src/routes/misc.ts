import { Router } from 'express';
import multer from 'multer';
import { db } from '../db/sql.js';
import { parseJson } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { saveUpload } from '../lib/uploads.js';
import { getMonetizationSettings, isPremiumProfile } from '../lib/settings.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.get('/settings/public', async (_req, res) => {
  res.json(await getMonetizationSettings());
});

router.get('/countries', async (_req, res) => {
  const countries = await db.all('SELECT * FROM countries WHERE is_active = 1 ORDER BY name');
  res.json(countries);
});

router.get('/skills', async (_req, res) => {
  const skills = await db.all('SELECT * FROM skills ORDER BY name');
  res.json(skills);
});

router.get('/advertisements', async (_req, res) => {
  const settings = await getMonetizationSettings();
  if (!settings.ads_enabled) return res.json([]);
  const ads = await db.all(
    `SELECT * FROM advertisements WHERE is_active = 1
     AND (start_date IS NULL OR start_date <= utc_day())
     AND (end_date IS NULL OR end_date >= utc_day())
     ORDER BY order_num ASC`
  );
  res.json(ads);
});

router.get('/explore', authMiddleware, async (req: AuthRequest, res) => {
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
      conditions.push('(b.category ILIKE ? OR b.skills ILIKE ?)');
      params.push(`%${area}%`, `%${area}%`);
    }
    if (city) {
      conditions.push(`(b.city = ? OR (TRIM(COALESCE(b.city, '')) = '' AND b.address ILIKE ?))`);
      params.push(city, `%${city}%`);
    }
    if (state) {
      conditions.push(`(b.state = ? OR (TRIM(COALESCE(b.state, '')) = '' AND b.address ILIKE ?))`);
      params.push(state, `%${state}%`);
    }
    if (q) {
      conditions.push('(b.name ILIKE ? OR b.category ILIKE ? OR b.address ILIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const businesses = await db.all<{ skills: string; photos: string }>(
      `SELECT b.*, u.full_name as owner_name, u.username as owner_username
       FROM businesses b
       JOIN users u ON u.id = b.owner_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.created_at DESC
       LIMIT 50`,
      params
    );

    return res.json({
      users: [],
      businesses: businesses.map((b) => ({
        ...b,
        skills: parseJson(b.skills, []),
        photos: parseJson(b.photos, []),
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
      `(u.full_name ILIKE ? OR u.username ILIKE ? OR p.bio ILIKE ? OR p.primary_skill ILIKE ?
        OR EXISTS (SELECT 1 FROM user_skills us WHERE us.user_id = u.id AND us.skill_name ILIKE ?))`
    );
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const [users, settings] = await Promise.all([
    db.all<Record<string, unknown>>(
      `SELECT u.id, u.username, u.full_name, u.avatar_url,
              p.bio, p.current_country, p.current_city, p.current_state,
              p.primary_skill, p.show_city_on_profile, p.is_premium, p.premium_until
       FROM users u
       JOIN public_profiles p ON p.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE WHEN p.is_premium = 1 AND (p.premium_until IS NULL OR p.premium_until >= utc_now()) THEN 0 ELSE 1 END,
         u.full_name ASC
       LIMIT 50`,
      params
    ),
    getMonetizationSettings(),
  ]);

  const mappedUsers = users.map((u) => ({
    ...u,
    is_premium: isPremiumProfile(settings, u as { is_premium?: number; premium_until?: string | null }),
  }));

  res.json({ users: mappedUsers, businesses: [] });
});

router.get('/search', authMiddleware, async (req: AuthRequest, res) => {
  const q = (req.query.q as string)?.trim();
  if (!q) return res.json({ businesses: [], users: [], posts: [] });

  const [businesses, users, posts] = await Promise.all([
    db.all(
      `SELECT id, name, category, address FROM businesses WHERE is_active = 1
       AND (name ILIKE ? OR category ILIKE ? OR address ILIKE ?) LIMIT 10`,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    ),
    db.all(
      `SELECT u.id, u.full_name, u.username FROM users u
       WHERE u.full_name ILIKE ? OR u.username ILIKE ? LIMIT 10`,
      [`%${q}%`, `%${q}%`]
    ),
    db.all(`SELECT id, content FROM posts WHERE is_active = 1 AND content ILIKE ? LIMIT 10`, [
      `%${q}%`,
    ]),
  ]);

  res.json({ businesses, users, posts });
});

router.get('/feed/sidebar', authMiddleware, async (req: AuthRequest, res) => {
  const profile = await db.get<{ current_country: string; current_city: string }>(
    'SELECT current_country, current_city FROM public_profiles WHERE user_id = ?',
    [req.user!.id]
  );
  const country = profile?.current_country || 'BR';
  const city = (profile?.current_city || '').trim();

  const [trending, users] = await Promise.all([
    db.all(
      `SELECT id, content, likes_count FROM posts WHERE is_active = 1 AND country = ?
       ORDER BY likes_count DESC LIMIT 5`,
      [country]
    ),
    city
      ? db.all<Record<string, unknown>>(
          `SELECT u.id, u.username, u.full_name, u.avatar_url, p.current_country, p.current_city,
                  CASE WHEN LOWER(TRIM(p.current_city)) = LOWER(?) THEN 0 ELSE 1 END AS city_rank
           FROM users u
           JOIN public_profiles p ON p.user_id = u.id
           WHERE p.current_country = ? AND u.id != ?
           ORDER BY city_rank ASC, u.full_name ASC
           LIMIT 10`,
          [city, country, req.user!.id]
        )
      : db.all<Record<string, unknown>>(
          `SELECT u.id, u.username, u.full_name, u.avatar_url, p.current_country, p.current_city
           FROM users u
           JOIN public_profiles p ON p.user_id = u.id
           WHERE p.current_country = ? AND u.id != ?
           ORDER BY u.full_name ASC
           LIMIT 10`,
          [country, req.user!.id]
        ),
  ]);

  res.json({
    trending,
    users: users.map((u) => ({
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

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
  const url = await saveUpload(req.file);
  res.json({ url });
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

export default router;
