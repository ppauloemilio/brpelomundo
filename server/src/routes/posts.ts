import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb, parseJson, userSnapshot, UserRow } from '../db/database.js';
import { authMiddleware, AuthRequest, createNotification } from '../middleware/auth.js';
import { getMonetizationSettings, isPremiumProfile } from '../lib/settings.js';
import { paramId } from '../lib/params.js';

const router = Router();

function authorPremiumMap(db: ReturnType<typeof getDb>, authorIds: string[]) {
  const unique = [...new Set(authorIds)];
  const map = new Map<string, boolean>();
  if (!unique.length) return map;
  const placeholders = unique.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT user_id, is_premium, premium_until FROM public_profiles WHERE user_id IN (${placeholders})`
  ).all(...unique) as Array<{ user_id: string; is_premium: number; premium_until: string | null }>;
  for (const row of rows) {
    map.set(row.user_id, isPremiumProfile(row));
  }
  return map;
}

function formatPost(row: Record<string, unknown>, likedByMe = false, authorIsPremium = false) {
  const settings = getMonetizationSettings();
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

router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const scope = ((req.query.scope as string) || 'city').toLowerCase();
  const profile = db.prepare(
    'SELECT current_country, current_city FROM public_profiles WHERE user_id = ?'
  ).get(req.user!.id) as { current_country: string; current_city: string } | undefined;

  const country = (profile?.current_country || 'BR').trim();
  const city = (profile?.current_city || '').trim();

  const orderSql = `
    ORDER BY
      CASE WHEN is_promoted = 1 AND (promoted_until IS NULL OR promoted_until >= datetime('now')) THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 50`;

  let posts: unknown[];

  if (scope === 'abroad') {
    posts = db.prepare(
      `SELECT * FROM posts WHERE is_active = 1 AND UPPER(TRIM(country)) != 'BR' ${orderSql}`
    ).all();
  } else if (scope === 'country' || !city) {
    posts = db.prepare(
      `SELECT * FROM posts WHERE is_active = 1 AND country = ? ${orderSql}`
    ).all(country);
  } else {
    // city: posts of same city first logic via filter; if none, still return city-filtered set
    posts = db.prepare(
      `SELECT * FROM posts
       WHERE is_active = 1 AND country = ?
         AND LOWER(TRIM(COALESCE(city, ''))) = LOWER(?)
       ${orderSql}`
    ).all(country, city);

    // Fallback: if no city posts yet, show country so feed is not empty for newcomers
    if (posts.length === 0) {
      posts = db.prepare(
        `SELECT * FROM posts WHERE is_active = 1 AND country = ? ${orderSql}`
      ).all(country);
    }
  }

  const likes = db.prepare('SELECT post_id FROM likes WHERE user_id = ?').all(req.user!.id) as { post_id: string }[];
  const likedSet = new Set(likes.map((l) => l.post_id));

  const premiumByAuthor = authorPremiumMap(
    db,
    (posts as Array<{ author_id: string }>).map((p) => p.author_id)
  );

  res.json(
    (posts as Array<{ id: string; author_id: string }>).map((p) => formatPost(
      p as Record<string, unknown>,
      likedSet.has(p.id),
      premiumByAuthor.get(p.author_id) ?? false
    ))
  );
});

router.post('/', authMiddleware, (req: AuthRequest, res) => {
  const { content, type = 'text', images = [], business_id } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Conteúdo obrigatório' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as UserRow;
  const profile = db.prepare('SELECT current_country, current_city FROM public_profiles WHERE user_id = ?').get(user.id) as
    | { current_country: string; current_city: string }
    | undefined;

  const id = uuid();
  db.prepare(
    `INSERT INTO posts (id, content, type, images, author_id, business_id, country, city, author_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    content.trim(),
    type,
    JSON.stringify(images),
    user.id,
    business_id || null,
    profile?.current_country || 'BR',
    profile?.current_city || '',
    userSnapshot({
      ...user,
      city: profile?.current_city,
      country: profile?.current_country,
    })
  );

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  const premium = authorPremiumMap(db, [user.id]).get(user.id) ?? false;
  res.status(201).json(formatPost(post as Record<string, unknown>, false, premium));
});

router.delete('/:id', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as { author_id: string } | undefined;
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  if (post.author_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });
  db.prepare('UPDATE posts SET is_active = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.post('/:id/like', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND is_active = 1').get(id) as
    | { id: string; author_id: string; likes_count: number }
    | undefined;
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  const existing = db.prepare('SELECT id FROM likes WHERE post_id = ? AND user_id = ?').get(post.id, req.user!.id);
  if (existing) return res.status(409).json({ error: 'Já curtido' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as UserRow;
  db.prepare('INSERT INTO likes (id, post_id, user_id, user_snapshot) VALUES (?, ?, ?, ?)').run(
    uuid(), post.id, user.id, userSnapshot(user)
  );
  db.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').run(post.id);
  createNotification(post.author_id, user.id, 'like', 'post', post.id);
  res.json({ ok: true, likes_count: post.likes_count + 1 });
});

router.delete('/:id/like', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as { likes_count: number } | undefined;
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  const result = db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(id, req.user!.id);
  if (result.changes > 0) {
    db.prepare('UPDATE posts SET likes_count = CASE WHEN likes_count > 0 THEN likes_count - 1 ELSE 0 END WHERE id = ?').run(id);
  }
  const updated = db.prepare('SELECT likes_count FROM posts WHERE id = ?').get(id) as { likes_count: number };
  res.json({ ok: true, likes_count: updated.likes_count });
});

router.get('/:id/comments', authMiddleware, (req, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const comments = db.prepare(
    'SELECT * FROM comments WHERE post_id = ? AND is_active = 1 ORDER BY created_at ASC'
  ).all(id);
  res.json(
    comments.map((c) => ({
      ...c,
      author_snapshot: parseJson((c as { author_snapshot: string }).author_snapshot, {}),
    }))
  );
});

router.post('/:id/comments', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Comentário vazio' });

  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ? AND is_active = 1').get(id) as
    | { id: string; author_id: string }
    | undefined;
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as UserRow;
  const commentId = uuid();
  db.prepare(
    'INSERT INTO comments (id, post_id, author_id, content, author_snapshot) VALUES (?, ?, ?, ?, ?)'
  ).run(commentId, post.id, user.id, content.trim(), userSnapshot(user));
  db.prepare('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?').run(post.id);
  createNotification(post.author_id, user.id, 'comment', 'post', post.id);

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId);
  res.status(201).json({
    ...comment,
    author_snapshot: parseJson((comment as { author_snapshot: string }).author_snapshot, {}),
  });
});

router.post('/:id/share', authMiddleware, (req: AuthRequest, res) => {
  const postId = paramId(req.params.id);
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  const id = uuid();
  db.prepare('INSERT INTO shares (id, post_id, user_id, post_snapshot) VALUES (?, ?, ?, ?)').run(
    id, postId, req.user!.id, JSON.stringify(post)
  );
  createNotification((post as { author_id: string }).author_id, req.user!.id, 'share', 'post', postId);
  res.status(201).json({ ok: true });
});

export default router;
