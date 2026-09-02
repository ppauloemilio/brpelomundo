import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb, parseJson, userSnapshot, UserRow } from '../db/database.js';
import { authMiddleware, AuthRequest, createNotification } from '../middleware/auth.js';

const router = Router();

router.post('/follow/:userId', authMiddleware, (req: AuthRequest, res) => {
  if (req.params.userId === req.user!.id) return res.status(400).json({ error: 'Não pode seguir a si mesmo' });
  const db = getDb();
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as UserRow;
  try {
    db.prepare('INSERT INTO follows (id, follower_id, following_id, follower_snapshot) VALUES (?, ?, ?, ?)').run(
      uuid(), user.id, req.params.userId, userSnapshot(user)
    );
    createNotification(req.params.userId, user.id, 'follow', 'user', user.id);
  } catch {
    return res.status(409).json({ error: 'Já segue este usuário' });
  }
  res.status(201).json({ ok: true });
});

router.delete('/follow/:userId', authMiddleware, (req: AuthRequest, res) => {
  getDb().prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user!.id, req.params.userId);
  res.json({ ok: true });
});

router.post('/friendships', authMiddleware, (req: AuthRequest, res) => {
  const { receiver_id } = req.body;
  if (!receiver_id || receiver_id === req.user!.id) return res.status(400).json({ error: 'Destinatário inválido' });

  const db = getDb();
  const existing = db.prepare(
    `SELECT * FROM friendships WHERE
     (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)`
  ).get(req.user!.id, receiver_id, receiver_id, req.user!.id);
  if (existing) return res.status(409).json({ error: 'Solicitação já existe' });

  const id = uuid();
  db.prepare('INSERT INTO friendships (id, requester_id, receiver_id, status) VALUES (?, ?, ?, ?)').run(
    id, req.user!.id, receiver_id, 'pending'
  );
  createNotification(receiver_id, req.user!.id, 'friendship_request', 'user', req.user!.id);
  res.status(201).json({ id, status: 'pending' });
});

router.patch('/friendships/:id', authMiddleware, (req: AuthRequest, res) => {
  const { status } = req.body;
  if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const db = getDb();
  const friendship = db.prepare('SELECT * FROM friendships WHERE id = ?').get(req.params.id) as
    | { receiver_id: string; requester_id: string }
    | undefined;
  if (!friendship) return res.status(404).json({ error: 'Solicitação não encontrada' });
  if (friendship.receiver_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });

  db.prepare('UPDATE friendships SET status = ? WHERE id = ?').run(status, req.params.id);
  if (status === 'accepted') {
    createNotification(friendship.requester_id, req.user!.id, 'friendship_accepted', 'user', req.user!.id);
  }
  res.json({ ok: true, status });
});

router.get('/friendships', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const friendships = db.prepare(
    `SELECT f.*, u.username, u.full_name, u.avatar_url FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END
     WHERE (f.requester_id = ? OR f.receiver_id = ?) AND f.status = 'accepted'`
  ).all(req.user!.id, req.user!.id, req.user!.id);
  res.json(friendships);
});

router.get('/notifications', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const notifications = db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.user!.id);
  res.json(
    notifications.map((n) => ({
      ...n,
      actor_snapshot: parseJson((n as { actor_snapshot: string }).actor_snapshot, {}),
      is_read: !!(n as { is_read: number }).is_read,
    }))
  );
});

router.get('/notifications/unread-count', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const result = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user!.id) as { c: number };
  res.json({ count: result.c });
});

router.patch('/notifications/:id/read', authMiddleware, (req: AuthRequest, res) => {
  getDb().prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

router.patch('/notifications/read-all', authMiddleware, (req: AuthRequest, res) => {
  getDb().prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

export default router;
