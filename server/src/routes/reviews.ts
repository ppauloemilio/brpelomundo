import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database.js';
import { authMiddleware, AuthRequest, createNotification } from '../middleware/auth.js';

const router = Router();
const TARGET_TYPES = ['business', 'user', 'classified'] as const;

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

function ownerOfTarget(db: ReturnType<typeof getDb>, targetType: string, targetId: string): string | null {
  if (targetType === 'business') {
    const row = db.prepare('SELECT owner_id FROM businesses WHERE id = ? AND is_active = 1').get(targetId) as
      | { owner_id: string }
      | undefined;
    return row?.owner_id ?? null;
  }
  if (targetType === 'classified') {
    const row = db.prepare('SELECT seller_id FROM classifieds WHERE id = ? AND is_active = 1').get(targetId) as
      | { seller_id: string }
      | undefined;
    return row?.seller_id ?? null;
  }
  if (targetType === 'user') {
    const row = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(targetId) as
      | { id: string }
      | undefined;
    return row?.id ?? null;
  }
  return null;
}

router.get('/', authMiddleware, (req, res) => {
  const targetType = (req.query.target_type as string)?.trim();
  const targetId = (req.query.target_id as string)?.trim();
  if (!targetType || !targetId || !TARGET_TYPES.includes(targetType as typeof TARGET_TYPES[number])) {
    return res.status(400).json({ error: 'target_type e target_id são obrigatórios' });
  }

  const db = getDb();
  const reviews = db.prepare(
    `SELECT r.*, u.full_name AS author_name, u.username AS author_username, u.avatar_url AS author_avatar,
            u.is_verified AS author_verified
     FROM reviews r
     JOIN users u ON u.id = r.author_id
     WHERE r.target_type = ? AND r.target_id = ? AND r.is_active = 1
     ORDER BY r.created_at DESC
     LIMIT 50`
  ).all(targetType, targetId);

  const stats = db.prepare(
    `SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS count
     FROM reviews WHERE target_type = ? AND target_id = ? AND is_active = 1`
  ).get(targetType, targetId) as { avg_rating: number | null; count: number };

  res.json({
    avg_rating: Number(stats.avg_rating || 0),
    count: stats.count || 0,
    reviews,
  });
});

router.post('/', authMiddleware, (req: AuthRequest, res) => {
  const { target_type, target_id, rating, comment } = req.body;
  if (!TARGET_TYPES.includes(target_type) || !target_id) {
    return res.status(400).json({ error: 'Alvo inválido' });
  }
  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'Avaliação deve ser de 1 a 5 estrelas' });
  }

  const db = getDb();
  const ownerId = ownerOfTarget(db, target_type, target_id);
  if (!ownerId) return res.status(404).json({ error: 'Alvo não encontrado' });
  if (ownerId === req.user!.id) {
    return res.status(400).json({ error: 'Você não pode avaliar a si mesmo' });
  }

  const existing = db.prepare(
    'SELECT id FROM reviews WHERE target_type = ? AND target_id = ? AND author_id = ?'
  ).get(target_type, target_id, req.user!.id) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE reviews SET rating = ?, comment = ?, is_active = 1, created_at = datetime('now') WHERE id = ?`
    ).run(stars, comment?.trim() || '', existing.id);
  } else {
    const id = uuid();
    db.prepare(
      `INSERT INTO reviews (id, target_type, target_id, author_id, rating, comment)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, target_type, target_id, req.user!.id, stars, comment?.trim() || '');
  }

  createNotification(ownerId, req.user!.id, 'review', target_type, target_id);

  const payload = db.prepare(
    `SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS count
     FROM reviews WHERE target_type = ? AND target_id = ? AND is_active = 1`
  ).get(target_type, target_id);

  res.status(201).json({ ok: true, ...payload });
});

router.post('/:id/reply', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const { reply } = req.body;
  const db = getDb();
  const review = db.prepare('SELECT * FROM reviews WHERE id = ? AND is_active = 1').get(id) as
    | { id: string; target_type: string; target_id: string; author_id: string }
    | undefined;
  if (!review) return res.status(404).json({ error: 'Avaliação não encontrada' });

  const ownerId = ownerOfTarget(db, review.target_type, review.target_id);
  if (ownerId !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });

  db.prepare('UPDATE reviews SET owner_reply = ? WHERE id = ?').run(reply?.trim() || '', id);
  if (reply?.trim()) {
    createNotification(review.author_id, req.user!.id, 'review_reply', 'review', id);
  }
  res.json({ ok: true });
});

export default router;
