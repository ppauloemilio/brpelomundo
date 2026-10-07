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
    comments_enabled: row.comments_enabled !== 0,
    author_is_premium: authorIsPremium,
    author_snapshot: { ...snapshot, is_premium: authorIsPremium },
    created_at: row.created_at,
    liked_by_me: likedByMe,
  };
}

async function softDeleteCommentTree(commentId: string): Promise<number> {
  const children = await db.all<{ id: string }>(
    'SELECT id FROM comments WHERE parent_id = ? AND is_active = 1',
    [commentId]
  );
  let removed = 1;
  for (const child of children) {
    removed += await softDeleteCommentTree(child.id);
  }
  await db.run('UPDATE comments SET is_active = 0 WHERE id = ?', [commentId]);
  return removed;
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
  let effectiveScope = scope;
  let cityFallback = false;

  if (scope === 'abroad') {
    posts = await db.all(
      `SELECT * FROM posts WHERE is_active = 1 AND UPPER(TRIM(country)) != 'BR' ${orderSql}`
    );
  } else if (scope === 'country' || !city) {
    effectiveScope = 'country';
    posts = await db.all(`SELECT * FROM posts WHERE is_active = 1 AND country = ? ${orderSql}`, [
      country,
    ]);
  } else {
    posts = await db.all(
      `SELECT * FROM posts
       WHERE is_active = 1 AND country = ?
         AND LOWER(TRIM(COALESCE(city, ''))) = LOWER(?)
       ${orderSql}`,
      [country, city]
    );

    if (posts.length === 0) {
      cityFallback = true;
      effectiveScope = 'country';
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

  res.json({
    posts: posts.map((p) =>
      formatPost(
        settings,
        p as Record<string, unknown>,
        likedSet.has(p.id),
        premiumByAuthor.get(p.author_id) ?? false
      )
    ),
    meta: {
      scope,
      effective_scope: effectiveScope,
      city_fallback: cityFallback,
      city: city || null,
      country,
    },
  });
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

router.patch('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const { comments_enabled, content } = req.body as {
    comments_enabled?: boolean;
    content?: string;
  };
  const post = await db.get<{ author_id: string }>(
    'SELECT * FROM posts WHERE id = ? AND is_active = 1',
    [id]
  );
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  if (post.author_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });
  if (comments_enabled === undefined && content === undefined) {
    return res.status(400).json({ error: 'Nada para atualizar' });
  }
  if (content !== undefined) {
    const trimmed = typeof content === 'string' ? content.trim() : '';
    if (!trimmed) return res.status(400).json({ error: 'Conteúdo vazio' });
    await db.run('UPDATE posts SET content = ? WHERE id = ?', [trimmed, id]);
  }
  if (comments_enabled !== undefined) {
    await db.run('UPDATE posts SET comments_enabled = ? WHERE id = ?', [
      comments_enabled ? 1 : 0,
      id,
    ]);
  }
  const [updated, settings] = await Promise.all([
    db.get('SELECT * FROM posts WHERE id = ?', [id]),
    getMonetizationSettings(),
  ]);
  const premium =
    (await authorPremiumMap(settings, [post.author_id])).get(post.author_id) ?? false;
  res.json(formatPost(settings, updated as Record<string, unknown>, false, premium));
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

router.get('/:id/likes', authMiddleware, async (req, res) => {
  const id = paramId(req.params.id);
  const post = await db.get('SELECT id FROM posts WHERE id = ? AND is_active = 1', [id]);
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  const rows = await db.all<{ user_id: string; user_snapshot: string; created_at: string }>(
    'SELECT user_id, user_snapshot, created_at FROM likes WHERE post_id = ? ORDER BY created_at DESC',
    [id]
  );
  res.json(
    rows.map((r) => ({
      user_id: r.user_id,
      user_snapshot: parseJson(r.user_snapshot, {}),
      created_at: r.created_at,
    }))
  );
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
  const { content, parent_id: parentId } = req.body as { content?: string; parent_id?: string };
  if (!content?.trim()) return res.status(400).json({ error: 'Comentário vazio' });

  const post = await db.get<{ id: string; author_id: string; comments_enabled: number }>(
    'SELECT * FROM posts WHERE id = ? AND is_active = 1',
    [id]
  );
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });
  if (post.comments_enabled === 0) {
    return res.status(403).json({ error: 'Comentários desabilitados neste post' });
  }

  if (parentId) {
    const parent = await db.get<{ post_id: string }>(
      'SELECT post_id FROM comments WHERE id = ? AND is_active = 1',
      [parentId]
    );
    if (!parent || parent.post_id !== post.id) {
      return res.status(400).json({ error: 'Comentário pai inválido' });
    }
  }

  const user = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [req.user!.id]);
  const commentId = uuid();
  await db.run(
    'INSERT INTO comments (id, post_id, author_id, parent_id, content, author_snapshot) VALUES (?, ?, ?, ?, ?, ?)',
    [commentId, post.id, user!.id, parentId || null, content.trim(), userSnapshot(user!)]
  );
  await db.run('UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?', [post.id]);

  const notifyUserId = parentId
    ? (
        await db.get<{ author_id: string }>('SELECT author_id FROM comments WHERE id = ?', [
          parentId,
        ])
      )?.author_id
    : post.author_id;
  if (notifyUserId && notifyUserId !== user!.id) {
    await createNotification(notifyUserId, user!.id, 'comment', 'post', post.id);
  }

  const comment = await db.get<{ author_snapshot: string }>(
    'SELECT * FROM comments WHERE id = ?',
    [commentId]
  );
  res.status(201).json({
    ...comment,
    author_snapshot: parseJson(comment!.author_snapshot, {}),
  });
});

router.patch('/:postId/comments/:commentId', authMiddleware, async (req: AuthRequest, res) => {
  const postId = paramId(req.params.postId);
  const commentId = paramId(req.params.commentId);
  const { content } = req.body as { content?: string };
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) return res.status(400).json({ error: 'Comentário vazio' });

  const comment = await db.get<{ id: string; author_id: string; post_id: string }>(
    'SELECT * FROM comments WHERE id = ? AND is_active = 1',
    [commentId]
  );
  if (!comment || comment.post_id !== postId) {
    return res.status(404).json({ error: 'Comentário não encontrado' });
  }
  if (comment.author_id !== req.user!.id) {
    return res.status(403).json({ error: 'Sem permissão' });
  }

  await db.run('UPDATE comments SET content = ? WHERE id = ?', [trimmed, commentId]);
  const updated = await db.get<{ author_snapshot: string }>(
    'SELECT * FROM comments WHERE id = ?',
    [commentId]
  );
  res.json({
    ...updated,
    author_snapshot: parseJson(updated!.author_snapshot, {}),
  });
});

router.delete('/:postId/comments/:commentId', authMiddleware, async (req: AuthRequest, res) => {
  const postId = paramId(req.params.postId);
  const commentId = paramId(req.params.commentId);

  const post = await db.get<{ author_id: string; comments_count: number }>(
    'SELECT author_id, comments_count FROM posts WHERE id = ? AND is_active = 1',
    [postId]
  );
  if (!post) return res.status(404).json({ error: 'Post não encontrado' });

  const comment = await db.get<{ id: string; author_id: string; post_id: string }>(
    'SELECT * FROM comments WHERE id = ? AND is_active = 1',
    [commentId]
  );
  if (!comment || comment.post_id !== postId) {
    return res.status(404).json({ error: 'Comentário não encontrado' });
  }

  const isPostOwner = post.author_id === req.user!.id;
  const isCommentAuthor = comment.author_id === req.user!.id;
  if (!isPostOwner && !isCommentAuthor) {
    return res.status(403).json({ error: 'Sem permissão' });
  }

  const removed = await softDeleteCommentTree(commentId);
  const nextCount = Math.max(0, post.comments_count - removed);
  await db.run('UPDATE posts SET comments_count = ? WHERE id = ?', [nextCount, postId]);

  res.json({ ok: true, comments_count: nextCount, removed });
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
