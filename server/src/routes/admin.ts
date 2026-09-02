import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { getMonetizationSettings, setMonetizationSettings } from '../lib/settings.js';
import { ADMIN_EMAIL, createPasswordInvite } from '../lib/adminUser.js';
import { applyMonetizationExamples } from '../lib/seedMonetizationExamples.js';
import { sendPasswordInviteEmail } from '../lib/email.js';
import { revenueSummary, adMetricsSummary, listAllPlans, updatePlan, listPromotions, createPromotion, updatePromotion, deletePromotion, grantComplimentary } from '../lib/billing.js';

const router = Router();

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

router.use(authMiddleware, adminMiddleware);

router.get('/stats', (_req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  const activeUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE COALESCE(is_active, 1) = 1').get() as { c: number };
  const posts = db.prepare('SELECT COUNT(*) as c FROM posts WHERE is_active = 1').get() as { c: number };
  const businesses = db.prepare('SELECT COUNT(*) as c FROM businesses WHERE is_active = 1').get() as { c: number };
  const admins = db.prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1').get() as { c: number };
  const ads = db.prepare('SELECT COUNT(*) as c FROM advertisements WHERE is_active = 1').get() as { c: number };
  res.json({
    users: users.c,
    active_users: activeUsers.c,
    posts: posts.c,
    businesses: businesses.c,
    admins: admins.c,
    ads: ads.c,
    ...(() => {
      const rev = db.prepare(
        `SELECT COUNT(*) AS paid_orders, COALESCE(SUM(amount_cents), 0) AS revenue_cents
         FROM billing_orders WHERE status = 'paid'`
      ).get() as { paid_orders: number; revenue_cents: number };
      return { paid_orders: rev.paid_orders, revenue_cents: rev.revenue_cents };
    })(),
  });
});

router.get('/settings', (_req, res) => {
  res.json(getMonetizationSettings());
});

router.patch('/settings', (req, res) => {
  const { ads_enabled, featured_business_enabled, paid_posts_enabled, premium_profile_enabled } = req.body;
  const next = setMonetizationSettings({
    ...(ads_enabled !== undefined && { ads_enabled: !!ads_enabled }),
    ...(featured_business_enabled !== undefined && { featured_business_enabled: !!featured_business_enabled }),
    ...(paid_posts_enabled !== undefined && { paid_posts_enabled: !!paid_posts_enabled }),
    ...(premium_profile_enabled !== undefined && { premium_profile_enabled: !!premium_profile_enabled }),
  });
  res.json(next);
});

router.post('/monetization-examples', (_req, res) => {
  applyMonetizationExamples(getDb());
  res.json({ ok: true });
});

// --- Advertisements ---
router.get('/advertisements', (_req, res) => {
  const ads = getDb().prepare('SELECT * FROM advertisements ORDER BY order_num ASC, title ASC').all();
  res.json(ads);
});

router.post('/advertisements', (req, res) => {
  const { title, image_url, link_url, description, is_active, order_num, start_date, end_date } = req.body;
  if (!title || !image_url) return res.status(400).json({ error: 'Título e imagem obrigatórios' });
  const id = uuid();
  getDb().prepare(
    `INSERT INTO advertisements (id, title, image_url, link_url, description, is_active, order_num, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, title, image_url, link_url || null, description || null,
    is_active !== false ? 1 : 0, order_num ?? 0, start_date || null, end_date || null
  );
  res.status(201).json({ id });
});

router.patch('/advertisements/:id', (req, res) => {
  const id = paramId(req.params.id);
  const { title, image_url, link_url, description, is_active, order_num, start_date, end_date } = req.body;
  const db = getDb();
  const ad = db.prepare('SELECT id FROM advertisements WHERE id = ?').get(id);
  if (!ad) return res.status(404).json({ error: 'Anúncio não encontrado' });

  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  const set = (col: string, val: unknown) => { fields.push(`${col} = ?`); params.push(val as string | number | null); };

  if (title !== undefined) set('title', title);
  if (image_url !== undefined) set('image_url', image_url);
  if (link_url !== undefined) set('link_url', link_url);
  if (description !== undefined) set('description', description);
  if (is_active !== undefined) set('is_active', is_active ? 1 : 0);
  if (order_num !== undefined) set('order_num', order_num);
  if (start_date !== undefined) set('start_date', start_date);
  if (end_date !== undefined) set('end_date', end_date);

  if (fields.length) {
    db.prepare(`UPDATE advertisements SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
  }
  res.json({ ok: true });
});

router.delete('/advertisements/:id', (req, res) => {
  getDb().prepare('DELETE FROM advertisements WHERE id = ?').run(paramId(req.params.id));
  res.json({ ok: true });
});

// --- Businesses management ---
router.get('/businesses', (req, res) => {
  const q = (req.query.q as string)?.trim();
  const status = (req.query.status as string)?.trim();
  const db = getDb();
  const conditions: string[] = ['1=1'];
  const params: string[] = [];
  if (q) {
    conditions.push('(b.name LIKE ? OR b.category LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status === 'active') conditions.push('b.is_active = 1');
  if (status === 'inactive') conditions.push('b.is_active = 0');

  const businesses = db.prepare(
    `SELECT b.*, u.full_name AS owner_name, u.email AS owner_email FROM businesses b
     JOIN users u ON u.id = b.owner_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.is_featured DESC, b.created_at DESC LIMIT 100`
  ).all(...params);
  res.json(businesses);
});

router.patch('/businesses/:id', (req, res) => {
  const id = paramId(req.params.id);
  const { is_active, is_featured, featured_until, featured_order, is_verified } = req.body;
  const db = getDb();
  const biz = db.prepare('SELECT id FROM businesses WHERE id = ?').get(id);
  if (!biz) return res.status(404).json({ error: 'Negócio não encontrado' });

  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  const set = (col: string, val: unknown) => { fields.push(`${col} = ?`); params.push(val as string | number | null); };
  if (is_active !== undefined) set('is_active', is_active ? 1 : 0);
  if (is_featured !== undefined) set('is_featured', is_featured ? 1 : 0);
  if (featured_until !== undefined) set('featured_until', featured_until);
  if (featured_order !== undefined) set('featured_order', featured_order);
  if (is_verified !== undefined) set('is_verified', is_verified ? 1 : 0);
  if (fields.length) {
    db.prepare(`UPDATE businesses SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
  }
  res.json({ ok: true });
});

router.patch('/businesses/:id/featured', (req, res) => {
  const id = paramId(req.params.id);
  const { is_featured, featured_until, featured_order } = req.body;
  const db = getDb();
  const biz = db.prepare('SELECT id FROM businesses WHERE id = ?').get(id);
  if (!biz) return res.status(404).json({ error: 'Negócio não encontrado' });

  db.prepare(
    `UPDATE businesses SET is_featured = ?, featured_until = ?, featured_order = ? WHERE id = ?`
  ).run(
    is_featured ? 1 : 0,
    featured_until || null,
    featured_order ?? 0,
    id
  );
  res.json({ ok: true });
});

// --- Posts management ---
router.get('/posts', (req, res) => {
  const q = (req.query.q as string)?.trim();
  const type = (req.query.type as string)?.trim();
  const status = (req.query.status as string)?.trim();
  const db = getDb();
  const conditions: string[] = ['1=1'];
  const params: string[] = [];
  if (q) {
    conditions.push('(p.content LIKE ? OR u.full_name LIKE ? OR u.username LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (type) {
    conditions.push('p.type = ?');
    params.push(type);
  }
  if (status === 'active') conditions.push('p.is_active = 1');
  if (status === 'inactive') conditions.push('p.is_active = 0');

  const posts = db.prepare(
    `SELECT p.id, p.content, p.type, p.country, p.likes_count, p.comments_count,
            p.is_active, p.is_promoted, p.promoted_until, p.created_at,
            u.full_name, u.username, u.id AS author_id
     FROM posts p JOIN users u ON u.id = p.author_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.created_at DESC LIMIT 100`
  ).all(...params);
  res.json(posts);
});

router.patch('/posts/:id', (req, res) => {
  const id = paramId(req.params.id);
  const { is_active, is_promoted, promoted_until } = req.body;
  const db = getDb();
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  const fields: string[] = [];
  const params: (string | number | null)[] = [];
  const set = (col: string, val: unknown) => { fields.push(`${col} = ?`); params.push(val as string | number | null); };
  if (is_active !== undefined) set('is_active', is_active ? 1 : 0);
  if (is_promoted !== undefined) set('is_promoted', is_promoted ? 1 : 0);
  if (promoted_until !== undefined) set('promoted_until', promoted_until);
  if (fields.length) {
    db.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
  }
  res.json({ ok: true });
});

router.get('/posts/promotions', (_req, res) => {
  const posts = getDb().prepare(
    `SELECT p.*, u.full_name, u.username FROM posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.type IN ('job', 'event') AND p.is_active = 1
     ORDER BY p.is_promoted DESC, p.created_at DESC LIMIT 50`
  ).all();
  res.json(posts);
});

router.patch('/posts/:id/promotion', (req, res) => {
  const id = paramId(req.params.id);
  const { is_promoted, promoted_until } = req.body;
  const db = getDb();
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  db.prepare('UPDATE posts SET is_promoted = ?, promoted_until = ? WHERE id = ?').run(
    is_promoted ? 1 : 0,
    promoted_until || null,
    id
  );
  res.json({ ok: true });
});

// --- Users management ---
router.get('/users', (req, res) => {
  const q = (req.query.q as string)?.trim();
  const status = (req.query.status as string)?.trim();
  const db = getDb();
  const conditions: string[] = ['1=1'];
  const params: string[] = [];
  if (q) {
    conditions.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.username LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status === 'active') conditions.push('COALESCE(u.is_active, 1) = 1');
  if (status === 'inactive') conditions.push('COALESCE(u.is_active, 1) = 0');
  if (status === 'admin') conditions.push('u.is_admin = 1');

  const users = db.prepare(
    `SELECT u.id, u.email, u.username, u.full_name, u.is_admin, u.is_active, u.is_verified, u.email_verified, u.created_at,
            p.is_premium, p.premium_until, p.current_country,
            (SELECT COUNT(*) FROM posts WHERE author_id = u.id AND is_active = 1) AS posts_count,
            (SELECT COUNT(*) FROM businesses WHERE owner_id = u.id AND is_active = 1) AS businesses_count
     FROM users u LEFT JOIN public_profiles p ON p.user_id = u.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.created_at DESC LIMIT 100`
  ).all(...params);
  res.json(users);
});

router.patch('/users/:id', (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const { is_admin, is_premium, premium_until, is_active, is_verified, email_verified } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(id) as
    | { id: string; is_admin: number }
    | undefined;
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  if (is_admin !== undefined) {
    if (id === req.user!.id && !is_admin) {
      return res.status(400).json({ error: 'Você não pode remover seu próprio acesso de admin' });
    }
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(is_admin ? 1 : 0, id);
  }
  if (is_active !== undefined) {
    if (id === req.user!.id && !is_active) {
      return res.status(400).json({ error: 'Você não pode desativar sua própria conta' });
    }
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(is_active ? 1 : 0, id);
  }
  if (is_verified !== undefined) {
    db.prepare('UPDATE users SET is_verified = ? WHERE id = ?').run(is_verified ? 1 : 0, id);
  }
  if (email_verified !== undefined) {
    db.prepare('UPDATE users SET email_verified = ? WHERE id = ?').run(email_verified ? 1 : 0, id);
  }
  if (is_premium !== undefined || premium_until !== undefined) {
    const profile = db.prepare('SELECT user_id FROM public_profiles WHERE user_id = ?').get(id);
    if (!profile) {
      db.prepare('INSERT INTO public_profiles (user_id, current_country) VALUES (?, ?)').run(id, 'BR');
    }
    if (is_premium !== undefined) {
      db.prepare('UPDATE public_profiles SET is_premium = ? WHERE user_id = ?').run(is_premium ? 1 : 0, id);
    }
    if (premium_until !== undefined) {
      db.prepare('UPDATE public_profiles SET premium_until = ? WHERE user_id = ?').run(premium_until, id);
    }
  }
  res.json({ ok: true });
});

router.patch('/users/:id/premium', (req, res) => {
  const id = paramId(req.params.id);
  const { is_premium, premium_until } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const profile = db.prepare('SELECT user_id FROM public_profiles WHERE user_id = ?').get(id);
  if (!profile) {
    db.prepare('INSERT INTO public_profiles (user_id, current_country) VALUES (?, ?)').run(id, 'BR');
  }

  db.prepare('UPDATE public_profiles SET is_premium = ?, premium_until = ? WHERE user_id = ?').run(
    is_premium ? 1 : 0,
    premium_until || null,
    id
  );
  res.json({ ok: true });
});

// --- Resend admin invite ---
router.post('/resend-invite', async (req, res) => {
  const email = (req.body.email as string) || ADMIN_EMAIL;
  const db = getDb();
  const user = db.prepare('SELECT id, full_name FROM users WHERE email = ?').get(email) as
    | { id: string; full_name: string }
    | undefined;
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const token = createPasswordInvite(db, user.id, email);
  const result = await sendPasswordInviteEmail(email, token, user.full_name);
  res.json({ ok: true, sent: result.sent, setupUrl: result.sent ? undefined : result.setupUrl });
});

router.get('/billing/revenue', (_req, res) => {
  res.json(revenueSummary());
});

router.get('/billing/plans', (_req, res) => {
  res.json(listAllPlans());
});

router.patch('/billing/plans/:id', (req, res) => {
  try {
    const plan = updatePlan(paramId(req.params.id), req.body);
    res.json(plan);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/billing/promotions', (_req, res) => {
  res.json(listPromotions());
});

router.post('/billing/promotions', (req, res) => {
  try {
    const promo = createPromotion(req.body);
    res.status(201).json(promo);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.patch('/billing/promotions/:id', (req, res) => {
  try {
    const promo = updatePromotion(paramId(req.params.id), req.body);
    res.json(promo);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/billing/promotions/:id', (req, res) => {
  deletePromotion(paramId(req.params.id));
  res.json({ ok: true });
});

router.post('/billing/grant', (req: AuthRequest, res) => {
  const { user_id, email, plan_code, target_id, duration_days, note } = req.body;
  if (!plan_code?.trim()) return res.status(400).json({ error: 'plan_code é obrigatório' });

  const db = getDb();
  let userId = user_id as string | undefined;
  if (!userId && email) {
    const user = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(String(email).trim()) as
      | { id: string }
      | undefined;
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    userId = user.id;
  }
  if (!userId) return res.status(400).json({ error: 'Informe user_id ou email' });

  try {
    const result = grantComplimentary({
      userId,
      planCode: plan_code.trim(),
      targetId: target_id || undefined,
      durationDays: duration_days ? Number(duration_days) : undefined,
      note: note || '',
      adminId: req.user!.id,
    });
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/ads/metrics', (_req, res) => {
  res.json(adMetricsSummary());
});

// --- Reports moderation ---
router.get('/reports', (req, res) => {
  const status = ((req.query.status as string) || 'open').trim();
  const db = getDb();
  const conditions = ['1=1'];
  const params: string[] = [];
  if (status && status !== 'all') {
    conditions.push('r.status = ?');
    params.push(status);
  }
  const reports = db.prepare(
    `SELECT r.*,
            u.full_name AS reporter_name, u.username AS reporter_username, u.email AS reporter_email
     FROM reports r
     JOIN users u ON u.id = r.reporter_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
       r.created_at DESC
     LIMIT 100`
  ).all(...params);
  res.json(reports);
});

router.patch('/reports/:id', (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const { status, admin_notes } = req.body;
  if (status && !['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  const db = getDb();
  const report = db.prepare('SELECT id FROM reports WHERE id = ?').get(id);
  if (!report) return res.status(404).json({ error: 'Denúncia não encontrada' });

  db.prepare(
    `UPDATE reports SET
       status = COALESCE(?, status),
       admin_notes = COALESCE(?, admin_notes),
       resolved_by = CASE WHEN ? IN ('resolved', 'dismissed') THEN ? ELSE resolved_by END,
       resolved_at = CASE WHEN ? IN ('resolved', 'dismissed') THEN datetime('now') ELSE resolved_at END
     WHERE id = ?`
  ).run(
    status ?? null,
    admin_notes !== undefined ? (admin_notes || '') : null,
    status ?? '',
    req.user!.id,
    status ?? '',
    id
  );
  res.json({ ok: true });
});

export default router;
