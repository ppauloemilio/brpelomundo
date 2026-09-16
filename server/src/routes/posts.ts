import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { parseJson, userSnapshot, UserRow } from '../db/database.js';
import { authMiddleware, AuthRequest, createNotification } from '../middleware/auth.js';
import {
  getMonetizationSettings,
  isPremiumProfile,
  type MonetizationSettings,
} from '../lib/settings.js';
import { paramId } from '../lib/params.js';

const router = Router();

async function authorPremiumMap(settings: MonetizationSettings, authorIds: string[]) {
  const unique = [...new Set(authorIds)];
  const map = new Map<string, boolean>();
  if (!unique.length) return map;
  const placeholders = unique.map(() => '?').join(',');
  const rows = await db.all<{ user_id: string; is_premium: number; premium_until: string | null }>(
    `SELECT user_id, is_premium, premium_until FROM public_profiles WHERE user_id IN (${placeholders})`,
    unique
  );
  for (const row of rows) {
    map.set(row.user_id, isPremiumProfile(settings, row));
  }
  return map;
}

function formatPost(
  settings: MonetizationSettings,
  row: Record<string, unknown>,
  likedByMe = false,
  authorIsPremium = false
) {
  const promotedInDb = !!(row.is_promoted && (
    !row.promoted_until || new Date(row.promoted_until as string) >= new Date()
  ));
  const snapshot = parseJson(row.author_snapshot as string, {}) as Record<string, unknown>;
  return {
    id: row.id,
    content: row.content,
    type: row.type,
    images: parseJson(row.images as string, []),
    author_id: row.author_id,
    business_id: row.business_id,
    country: row.country,
    likes_count: row.likes_count,
    comments_count: row.comments_count,
    is_active: row.is_active,
    is_promoted: settings.paid_posts_enabled && promotedInDb,
    author_is_premium: authorIsPremium,
    author_snapshot: { ...snapshot, is_premium: authorIsPremium },
    created_at: row.created_at,
    liked_by_me: likedByMe,
  };
}

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const scope = ((req.query.scope as string) || 'city').toLowerCase();
  const [profile, settings] = await Promise.all([
    db.get<{ current_country: string; current_city: string }>(
      'SELECT current_country, current_city FROM public_profiles WHERE user_id = ?',
      [req.user!.id]
    ),
    getMonetizationSettings(),
  ]);

  const country = (profile?.current_country || 'BR').trim();
  const city = (profile?.current_city || '').trim();

  const orderSql = `
    ORDER BY
      CASE WHEN is_promoted = 1 AND (promoted_until IS NULL OR promoted_until >= utc_now()) THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 50`;

  let posts: Array<{ id: string; author_id: string }>;

  if (scope === 'abroad') {
    posts = await db.all(
      `SELECT * FROM posts WHERE is_active = 1 AND UPPER(TRIM(country)) != 'BR' ${orderSql}`
    );
  } else if (scope === 'country' || !city) {
    posts = await db.all(`SELECT * FROM posts WHERE is_active = 1 AND country = ? ${orderSql}`, [
      country,
    ]);
  } else {
    // city: posts of same city first logic via filter; if none, still return city-filtered set
    posts = await db.all(
      `SELECT * FROM posts
       WHERE is_active = 1 AND country = ?
         AND LOWER(TRIM(COALESCE(city, ''))) = LOWER(?)
       ${orderSql}`,
      [country, city]
    );

    // Fallback: if no city posts yet, show country so feed is not empty for newcomers
    if (posts.length === 0) {
      posts = await db.all(`SELECT * FROM posts WHERE is_active = 1 AND country = ? ${orderSql}`, [
        country,
      ]);
    }
  }

  const likes = await db.all<{ post_id: string }>('SELECT post_id FROM likes WHERE user_id = ?', [
    req.user!.id,
  ]);
  const likedSet = new Set(likes.map((l) => l.post_id));

  const premiumByAuthor = await authorPremiumMap(settings, posts.map((p) => p.author_id));

  res.json(
    posts.map((p) => formatPost(
      settings,
      p as Record<string, unknown>,
      likedSet.has(p.id),
      premiumByAuthor.get(p.author_id) ?? false
    ))
  );
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const { content, type = 'text', images = [], business_id } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Conteúdo obrigatório' });

  const [user, profile, settings] = await Promise.all([
    db.get<UserRow>('SELECT * FROM users WHERE id = ?', [req.user!.id]),
    db.get<{ current_country: string; current_city: string }>(
      'SELECT current_country, current_city FROM public_profiles WHERE user_id = ?',
      [req.user!.id]
    ),
    getMonetizationSettings(),
  ]);

  const id = uuid();
  await db.run(
    `INSERT INTO posts (id, content, type, images, author_id, business_id, country, city, author_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      content.trim(),
      type,
      JSON.stringify(images),
      user!.id,
      business_id || null,
      profile?.current_country || 'BR',
      profile?.current_city || '',
      userSnapshot({
        ...user!,
        city: profile?.current_city,
        country: profile?.current_country,
      }),
    ]
  );

  const post = await db.get('SELECT * FROM posts WHERE id = ?', [id]);
  const premium = (await authorPremiumMap(settings, [user!.id])).get(user!.id) ?? false;
  res.status(201).json(formatPost(settings, post as Record<string, unknown>, false, premium));
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const post = await db.get<{ author_id: string }>('SELECT * FROM posts WHERE id = ?', [id]);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  if (post.author_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });
  await db.run('UPDATE posts SET is_active = 0 WHERE id = ?', [id]);
  res.json({ ok: true });
});

router.post('/:id/like', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const post = await db.get<{ id: string; author_id: string; likes_count: number }>(
    'SELECT * FROM posts WHERE id = ? AND is_active = 1',
    [id]
  );
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  const existing = await db.get('SELECT id FROM likes WHERE post_id = ? AND user_id = ?', [
    post.id,
    req.user!.id,
  ]);
  if (existing) return res.status(409).json({ error: 'Já curtido' });

  const user = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [req.user!.id]);
  await db.run('INSERT INTO likes (id, post_id, user_id, user_snapshot) VALUES (?, ?, ?, ?)', [
    uuid(),
    post.id,
    user!.id,
    userSnapshot(user!),
  ]);
  await db.run('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?', [post.id]);
  await createNotification(post.author_id, user!.id, 'like', 'post', post.id);
  res.json({ ok: true, likes_count: post.likes_count + 1 });
});

router.delete('/:id/like', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const post = await db.get<{ likes_count: number }>('SELECT * FROM posts WHERE id = ?', [id]);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  const result = await db.run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [
    id,
    req.user!.id,
  ]);
  if (result.changes > 0) {
    await db.run(
      'UPDATE posts SET likes_count = CASE WHEN likes_count > 0 THEN likes_count - 1 ELSE 0 END WHERE id = ?',
      [id]
    );
  }
  const updated = await db.get<{ likes_count: number }>(
    'SELECT likes_count FROM posts WHERE id = ?',
    [id]
  );
  res.json({ ok: true, likes_count: updated!.likes_count });
});

router.get('/:id/comments', authMiddleware, async (req, res) => {
  const id = paramId(req.params.id);
  const comments = await db.all<{ author_snapshot: string }>(
    'SELECT * FROM comments WHERE post_id = ? AND is_active = 1 ORDER BY created_at ASC',
    [id]
  );
  res.json(
    comments.map((c) => ({
      ...c,
      author_snapshot: parseJson(c.author_snapshot, {}),
    }))
  );
});

router.post('/:id/comments', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Comentário vazio' });

  const post = await db.get<{ id: string; author_id: string }>(
    'SELECT * FROM posts WHERE id = ? AND is_active = 1',
    [id]
  );
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  const user = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [req.user!.id]);
  const commentId = uuid();
  await db.run(
    'INSERT INTO comments (id, post_id, author_id, content, author_snapshot) VALUES (?, ?, ?, ?, ?)',
    [commentId, post.id, user!.id, content.trim(), userSnapshot(user!)]
  );
  await db.run('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?', [post.id]);
  await createNotification(post.author_id, user!.id, 'comment', 'post', post.id);

  const comment = await db.get<{ author_snapshot: string }>(
    'SELECT * FROM comments WHERE id = ?',
    [commentId]
  );
  res.status(201).json({
    ...comment,
    author_snapshot: parseJson(comment!.author_snapshot, {}),
  });
});

router.post('/:id/share', authMiddleware, async (req: AuthRequest, res) => {
  const postId = paramId(req.params.id);
  const post = await db.get<{ author_id: string }>('SELECT * FROM posts WHERE id = ?', [postId]);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  await db.run('INSERT INTO shares (id, post_id, user_id, post_snapshot) VALUES (?, ?, ?, ?)', [
    uuid(),
    postId,
    req.user!.id,
    JSON.stringify(post),
  ]);
  await createNotification(post.author_id, req.user!.id, 'share', 'post', postId);
  res.status(201).json({ ok: true });
});

export default router;
