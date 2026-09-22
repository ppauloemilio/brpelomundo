import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { adminMiddleware } from '../middleware/admin.js';
import { getMonetizationSettings, setMonetizationSettings } from '../lib/settings.js';
import { ADMIN_EMAIL, createPasswordInvite } from '../lib/adminUser.js';
import { applyMonetizationExamples } from '../lib/seedMonetizationExamples.js';
import { sendPasswordInviteEmail } from '../lib/email.js';
import { paramId } from '../lib/params.js';
import { revenueSummary, adMetricsSummary, listAllPlans, updatePlan, listPromotions, createPromotion, updatePromotion, deletePromotion, grantComplimentary } from '../lib/billing.js';

const router = Router();

router.use(authMiddleware, adminMiddleware);

router.get('/stats', async (_req, res) => {
  const [users, activeUsers, posts, businesses, admins, ads, rev] = await Promise.all([
    db.get<{ c: number }>('SELECT COUNT(*) as c FROM users'),
    db.get<{ c: number }>('SELECT COUNT(*) as c FROM users WHERE COALESCE(is_active, 1) = 1'),
    db.get<{ c: number }>('SELECT COUNT(*) as c FROM posts WHERE is_active = 1'),
    db.get<{ c: number }>('SELECT COUNT(*) as c FROM businesses WHERE is_active = 1'),
    db.get<{ c: number }>('SELECT COUNT(*) as c FROM users WHERE is_admin = 1'),
    db.get<{ c: number }>('SELECT COUNT(*) as c FROM advertisements WHERE is_active = 1'),
    db.get<{ paid_orders: number; revenue_cents: number }>(
      `SELECT COUNT(*) AS paid_orders, COALESCE(SUM(amount_cents), 0) AS revenue_cents
       FROM billing_orders WHERE status = 'paid'`
    ),
  ]);
  res.json({
    users: users?.c ?? 0,
    active_users: activeUsers?.c ?? 0,
    posts: posts?.c ?? 0,
    businesses: businesses?.c ?? 0,
    admins: admins?.c ?? 0,
    ads: ads?.c ?? 0,
    paid_orders: rev?.paid_orders ?? 0,
    revenue_cents: rev?.revenue_cents ?? 0,
  });
});

router.get('/settings', async (_req, res) => {
  res.json(await getMonetizationSettings());
});

router.patch('/settings', async (req, res) => {
  const { ads_enabled, featured_business_enabled, paid_posts_enabled, premium_profile_enabled } = req.body;
  const next = await setMonetizationSettings({
    ...(ads_enabled !== undefined && { ads_enabled: !!ads_enabled }),
    ...(featured_business_enabled !== undefined && { featured_business_enabled: !!featured_business_enabled }),
    ...(paid_posts_enabled !== undefined && { paid_posts_enabled: !!paid_posts_enabled }),
    ...(premium_profile_enabled !== undefined && { premium_profile_enabled: !!premium_profile_enabled }),
  });
  res.json(next);
});

router.post('/monetization-examples', async (_req, res) => {
  await applyMonetizationExamples();
  res.json({ ok: true });
});

// --- Advertisements ---
router.get('/advertisements', async (_req, res) => {
  const ads = await db.all('SELECT * FROM advertisements ORDER BY order_num ASC, title ASC');
  res.json(ads);
});

router.post('/advertisements', async (req, res) => {
  const { title, image_url, link_url, description, is_active, order_num, start_date, end_date } = req.body;
  if (!title || !image_url) return res.status(400).json({ error: 'Título e imagem obrigatórios' });
  const id = uuid();
  await db.run(
    `INSERT INTO advertisements (
       id, title, image_url, link_url, description, creative_configured,
       is_active, order_num, start_date, end_date
     ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [
      id, title, image_url, link_url || null, description || null,
      is_active !== false ? 1 : 0, order_num ?? 0, start_date || null, end_date || null,
    ]
  );
  res.status(201).json({ id });
});

router.patch('/advertisements/:id', async (req, res) => {
  const id = paramId(req.params.id);
  const { title, image_url, link_url, description, is_active, order_num, start_date, end_date } = req.body;
  const ad = await db.get('SELECT id FROM advertisements WHERE id = ?', [id]);
  if (!ad) return res.status(404).json({ error: 'Anúncio não encontrado' });

  const fields: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, val: unknown) => { fields.push(`${col} = ?`); params.push(val); };

  if (title !== undefined) set('title', title);
  if (image_url !== undefined) set('image_url', image_url);
  if (link_url !== undefined) set('link_url', link_url);
  if (description !== undefined) set('description', description);
  if (is_active !== undefined) set('is_active', is_active ? 1 : 0);
  if (order_num !== undefined) set('order_num', order_num);
  if (start_date !== undefined) set('start_date', start_date);
  if (end_date !== undefined) set('end_date', end_date);

  if (fields.length) {
    await db.run(`UPDATE advertisements SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);
  }
  res.json({ ok: true });
});

router.delete('/advertisements/:id', async (req, res) => {
  await db.run('DELETE FROM advertisements WHERE id = ?', [paramId(req.params.id)]);
  res.json({ ok: true });
});

// --- Businesses management ---
router.get('/businesses', async (req, res) => {
  const q = (req.query.q as string)?.trim();
  const status = (req.query.status as string)?.trim();
  const conditions: string[] = ['1=1'];
  const params: string[] = [];
  if (q) {
    conditions.push('(b.name ILIKE ? OR b.category ILIKE ? OR u.full_name ILIKE ? OR u.email ILIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status === 'active') conditions.push('b.is_active = 1');
  if (status === 'inactive') conditions.push('b.is_active = 0');

  const businesses = await db.all(
    `SELECT b.*, u.full_name AS owner_name, u.email AS owner_email FROM businesses b
     JOIN users u ON u.id = b.owner_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY b.is_featured DESC, b.created_at DESC LIMIT 100`,
    params
  );
  res.json(businesses);
});

router.patch('/businesses/:id', async (req, res) => {
  const id = paramId(req.params.id);
  const { is_active, is_featured, featured_until, featured_order, is_verified } = req.body;
  const biz = await db.get('SELECT id FROM businesses WHERE id = ?', [id]);
  if (!biz) return res.status(404).json({ error: 'Negócio não encontrado' });

  const fields: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, val: unknown) => { fields.push(`${col} = ?`); params.push(val); };
  if (is_active !== undefined) set('is_active', is_active ? 1 : 0);
  if (is_featured !== undefined) set('is_featured', is_featured ? 1 : 0);
  if (featured_until !== undefined) set('featured_until', featured_until);
  if (featured_order !== undefined) set('featured_order', featured_order);
  if (is_verified !== undefined) set('is_verified', is_verified ? 1 : 0);
  if (fields.length) {
    await db.run(`UPDATE businesses SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);
  }
  res.json({ ok: true });
});

router.patch('/businesses/:id/featured', async (req, res) => {
  const id = paramId(req.params.id);
  const { is_featured, featured_until, featured_order } = req.body;
  const biz = await db.get('SELECT id FROM businesses WHERE id = ?', [id]);
  if (!biz) return res.status(404).json({ error: 'Negócio não encontrado' });

  await db.run(
    `UPDATE businesses SET is_featured = ?, featured_until = ?, featured_order = ? WHERE id = ?`,
    [is_featured ? 1 : 0, featured_until || null, featured_order ?? 0, id]
  );
  res.json({ ok: true });
});

// --- Posts management ---
router.get('/posts', async (req, res) => {
  const q = (req.query.q as string)?.trim();
  const type = (req.query.type as string)?.trim();
  const status = (req.query.status as string)?.trim();
  const conditions: string[] = ['1=1'];
  const params: string[] = [];
  if (q) {
    conditions.push('(p.content ILIKE ? OR u.full_name ILIKE ? OR u.username ILIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (type) {
    conditions.push('p.type = ?');
    params.push(type);
  }
  if (status === 'active') conditions.push('p.is_active = 1');
  if (status === 'inactive') conditions.push('p.is_active = 0');

  const posts = await db.all(
    `SELECT p.id, p.content, p.type, p.country, p.likes_count, p.comments_count,
            p.is_active, p.is_promoted, p.promoted_until, p.created_at,
            u.full_name, u.username, u.id AS author_id
     FROM posts p JOIN users u ON u.id = p.author_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.created_at DESC LIMIT 100`,
    params
  );
  res.json(posts);
});

router.get('/posts/promotions', async (_req, res) => {
  const posts = await db.all(
    `SELECT p.*, u.full_name, u.username FROM posts p
     JOIN users u ON u.id = p.author_id
     WHERE p.type IN ('job', 'event') AND p.is_active = 1
     ORDER BY p.is_promoted DESC, p.created_at DESC LIMIT 50`
  );
  res.json(posts);
});

router.patch('/posts/:id', async (req, res) => {
  const id = paramId(req.params.id);
  const { is_active, is_promoted, promoted_until } = req.body;
  const post = await db.get('SELECT id FROM posts WHERE id = ?', [id]);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  const fields: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, val: unknown) => { fields.push(`${col} = ?`); params.push(val); };
  if (is_active !== undefined) set('is_active', is_active ? 1 : 0);
  if (is_promoted !== undefined) set('is_promoted', is_promoted ? 1 : 0);
  if (promoted_until !== undefined) set('promoted_until', promoted_until);
  if (fields.length) {
    await db.run(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);
  }
  res.json({ ok: true });
});

router.patch('/posts/:id/promotion', async (req, res) => {
  const id = paramId(req.params.id);
  const { is_promoted, promoted_until } = req.body;
  const post = await db.get('SELECT id FROM posts WHERE id = ?', [id]);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  await db.run('UPDATE posts SET is_promoted = ?, promoted_until = ? WHERE id = ?', [
    is_promoted ? 1 : 0,
    promoted_until || null,
    id,
  ]);
  res.json({ ok: true });
});

// --- Users management ---
router.get('/users', async (req, res) => {
  const q = (req.query.q as string)?.trim();
  const status = (req.query.status as string)?.trim();
  const conditions: string[] = ['1=1'];
  const params: string[] = [];
  if (q) {
    conditions.push('(u.full_name ILIKE ? OR u.email ILIKE ? OR u.username ILIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status === 'active') conditions.push('COALESCE(u.is_active, 1) = 1');
  if (status === 'inactive') conditions.push('COALESCE(u.is_active, 1) = 0');
  if (status === 'admin') conditions.push('u.is_admin = 1');

  const users = await db.all(
    `SELECT u.id, u.email, u.username, u.full_name, u.is_admin, u.is_active, u.is_verified, u.email_verified, u.created_at,
            p.is_premium, p.premium_until, p.current_country,
            (SELECT COUNT(*) FROM posts WHERE author_id = u.id AND is_active = 1) AS posts_count,
            (SELECT COUNT(*) FROM businesses WHERE owner_id = u.id AND is_active = 1) AS businesses_count
     FROM users u LEFT JOIN public_profiles p ON p.user_id = u.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY u.created_at DESC LIMIT 100`,
    params
  );
  res.json(users);
});

router.patch('/users/:id', async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const { is_admin, is_premium, premium_until, is_active, is_verified, email_verified } = req.body;
  const user = await db.get<{ id: string; is_admin: number }>(
    'SELECT id, is_admin FROM users WHERE id = ?',
    [id]
  );
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  if (is_admin !== undefined) {
    if (id === req.user!.id && !is_admin) {
      return res.status(400).json({ error: 'Você não pode remover seu próprio acesso de admin' });
    }
    await db.run('UPDATE users SET is_admin = ? WHERE id = ?', [is_admin ? 1 : 0, id]);
  }
  if (is_active !== undefined) {
    if (id === req.user!.id && !is_active) {
      return res.status(400).json({ error: 'Você não pode desativar sua própria conta' });
    }
    await db.run('UPDATE users SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
  }
  if (is_verified !== undefined) {
    await db.run('UPDATE users SET is_verified = ? WHERE id = ?', [is_verified ? 1 : 0, id]);
  }
  if (email_verified !== undefined) {
    await db.run('UPDATE users SET email_verified = ? WHERE id = ?', [email_verified ? 1 : 0, id]);
  }
  if (is_premium !== undefined || premium_until !== undefined) {
    await db.run(
      'INSERT INTO public_profiles (user_id, current_country) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING',
      [id, 'BR']
    );
    if (is_premium !== undefined) {
      await db.run('UPDATE public_profiles SET is_premium = ? WHERE user_id = ?', [
        is_premium ? 1 : 0,
        id,
      ]);
    }
    if (premium_until !== undefined) {
      await db.run('UPDATE public_profiles SET premium_until = ? WHERE user_id = ?', [
        premium_until,
        id,
      ]);
    }
  }
  res.json({ ok: true });
});

router.patch('/users/:id/premium', async (req, res) => {
  const id = paramId(req.params.id);
  const { is_premium, premium_until } = req.body;
  const user = await db.get('SELECT id FROM users WHERE id = ?', [id]);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  await db.run(
    'INSERT INTO public_profiles (user_id, current_country) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING',
    [id, 'BR']
  );

  await db.run('UPDATE public_profiles SET is_premium = ?, premium_until = ? WHERE user_id = ?', [
    is_premium ? 1 : 0,
    premium_until || null,
    id,
  ]);
  res.json({ ok: true });
});

// --- Resend admin invite ---
router.post('/resend-invite', async (req, res) => {
  const email = (req.body.email as string) || ADMIN_EMAIL;
  const user = await db.get<{ id: string; full_name: string }>(
    'SELECT id, full_name FROM users WHERE email = ?',
    [email]
  );
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const token = await createPasswordInvite(user.id, email);
  const result = await sendPasswordInviteEmail(email, token, user.full_name);
  res.json({ ok: true, sent: result.sent, setupUrl: result.sent ? undefined : result.setupUrl });
});

router.get('/billing/revenue', async (_req, res) => {
  res.json(await revenueSummary());
});

router.get('/billing/plans', async (_req, res) => {
  res.json(await listAllPlans());
});

router.patch('/billing/plans/:id', async (req, res) => {
  try {
    const plan = await updatePlan(paramId(req.params.id), req.body);
    res.json(plan);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/billing/promotions', async (_req, res) => {
  res.json(await listPromotions());
});

router.post('/billing/promotions', async (req, res) => {
  try {
    const promo = await createPromotion(req.body);
    res.status(201).json(promo);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.patch('/billing/promotions/:id', async (req, res) => {
  try {
    const promo = await updatePromotion(paramId(req.params.id), req.body);
    res.json(promo);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/billing/promotions/:id', async (req, res) => {
  await deletePromotion(paramId(req.params.id));
  res.json({ ok: true });
});

router.post('/billing/grant', async (req: AuthRequest, res) => {
  const { user_id, email, plan_code, target_id, duration_days, note } = req.body;
  if (!plan_code?.trim()) return res.status(400).json({ error: 'plan_code é obrigatório' });

  let userId = user_id as string | undefined;
  if (!userId && email) {
    const user = await db.get<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
      [String(email).trim()]
    );
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    userId = user.id;
  }
  if (!userId) return res.status(400).json({ error: 'Informe user_id ou email' });

  try {
    const result = await grantComplimentary({
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

router.get('/ads/metrics', async (_req, res) => {
  res.json(await adMetricsSummary());
});

// --- Reports moderation ---
router.get('/reports', async (req, res) => {
  const status = ((req.query.status as string) || 'open').trim();
  const conditions = ['1=1'];
  const params: string[] = [];
  if (status && status !== 'all') {
    conditions.push('r.status = ?');
    params.push(status);
  }
  const reports = await db.all(
    `SELECT r.*,
            u.full_name AS reporter_name, u.username AS reporter_username, u.email AS reporter_email
     FROM reports r
     JOIN users u ON u.id = r.reporter_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END,
       r.created_at DESC
     LIMIT 100`,
    params
  );
  res.json(reports);
});

router.patch('/reports/:id', async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const { status, admin_notes } = req.body;
  if (status && !['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  const report = await db.get('SELECT id FROM reports WHERE id = ?', [id]);
  if (!report) return res.status(404).json({ error: 'Denúncia não encontrada' });

  await db.run(
    `UPDATE reports SET
       status = COALESCE(?, status),
       admin_notes = COALESCE(?, admin_notes),
       resolved_by = CASE WHEN ? IN ('resolved', 'dismissed') THEN ? ELSE resolved_by END,
       resolved_at = CASE WHEN ? IN ('resolved', 'dismissed') THEN utc_now() ELSE resolved_at END
     WHERE id = ?`,
    [
      status ?? null,
      admin_notes !== undefined ? (admin_notes || '') : null,
      status ?? '',
      req.user!.id,
      status ?? '',
      id,
    ]
  );
  res.json({ ok: true });
});

export default router;
