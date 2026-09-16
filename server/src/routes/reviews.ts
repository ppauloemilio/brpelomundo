import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { authMiddleware, AuthRequest, createNotification } from '../middleware/auth.js';

const router = Router();
const TARGET_TYPES = ['business', 'user', 'classified'] as const;

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

async function ownerOfTarget(targetType: string, targetId: string): Promise<string | null> {
  if (targetType === 'business') {
    const row = await db.get<{ owner_id: string }>(
      'SELECT owner_id FROM businesses WHERE id = ? AND is_active = 1',
      [targetId]
    );
    return row?.owner_id ?? null;
  }
  if (targetType === 'classified') {
    const row = await db.get<{ seller_id: string }>(
      'SELECT seller_id FROM classifieds WHERE id = ? AND is_active = 1',
      [targetId]
    );
    return row?.seller_id ?? null;
  }
  if (targetType === 'user') {
    const row = await db.get<{ id: string }>(
      'SELECT id FROM users WHERE id = ? AND is_active = 1',
      [targetId]
    );
    return row?.id ?? null;
  }
  return null;
}

router.get('/', authMiddleware, async (req, res) => {
  const targetType = (req.query.target_type as string)?.trim();
  const targetId = (req.query.target_id as string)?.trim();
  if (!targetType || !targetId || !TARGET_TYPES.includes(targetType as typeof TARGET_TYPES[number])) {
    return res.status(400).json({ error: 'target_type e target_id são obrigatórios' });
  }

  const [reviews, stats] = await Promise.all([
    db.all(
      `SELECT r.*, u.full_name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar,
              u.is_verified AS author_verified
       FROM reviews r
       JOIN users u ON u.id = r.author_id
       WHERE r.target_type = ? AND r.target_id = ? AND r.is_active = 1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [targetType, targetId]
    ),
    db.get<{ avg_rating: number | null; count: number }>(
      `SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS count
       FROM reviews WHERE target_type = ? AND target_id = ? AND is_active = 1`,
      [targetType, targetId]
    ),
  ]);

  res.json({
    avg_rating: Number(stats?.avg_rating || 0),
    count: stats?.count || 0,
    reviews,
  });
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const { target_type, target_id, rating, comment } = req.body;
  if (!TARGET_TYPES.includes(target_type) || !target_id) {
    return res.status(400).json({ error: 'Alvo inválido' });
  }
  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'Avaliação deve ser de 1 a 5 estrelas' });
  }

  const ownerId = await ownerOfTarget(target_type, target_id);
  if (!ownerId) return res.status(404).json({ error: 'Alvo não encontrado' });
  if (ownerId === req.user!.id) {
    return res.status(400).json({ error: 'Você não pode avaliar a si mesmo' });
  }

  const existing = await db.get<{ id: string }>(
    'SELECT id FROM reviews WHERE target_type = ? AND target_id = ? AND author_id = ?',
    [target_type, target_id, req.user!.id]
  );

  if (existing) {
    await db.run(
      `UPDATE reviews SET rating = ?, comment = ?, is_active = 1, created_at = utc_now() WHERE id = ?`,
      [stars, comment?.trim() || '', existing.id]
    );
  } else {
    const id = uuid();
    await db.run(
      `INSERT INTO reviews (id, target_type, target_id, author_id, rating, comment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, target_type, target_id, req.user!.id, stars, comment?.trim() || '']
    );
  }

  await createNotification(ownerId, req.user!.id, 'review', target_type, target_id);

  const payload = await db.get<{ avg_rating: number | null; count: number }>(
    `SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS count
     FROM reviews WHERE target_type = ? AND target_id = ? AND is_active = 1`,
    [target_type, target_id]
  );

  res.status(201).json({ ok: true, ...payload });
});

router.post('/:id/reply', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const { reply } = req.body;
  const review = await db.get<{ id: string; target_type: string; target_id: string; author_id: string }>(
    'SELECT * FROM reviews WHERE id = ? AND is_active = 1',
    [id]
  );
  if (!review) return res.status(404).json({ error: 'Avaliação não encontrada' });

  const ownerId = await ownerOfTarget(review.target_type, review.target_id);
  if (ownerId !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });

  await db.run('UPDATE reviews SET owner_reply = ? WHERE id = ?', [reply?.trim() || '', id]);
  if (reply?.trim()) {
    await createNotification(review.author_id, req.user!.id, 'review_reply', 'review', id);
  }
  res.json({ ok: true });
});

export default router;
