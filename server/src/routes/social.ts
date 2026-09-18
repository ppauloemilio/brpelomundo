import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { parseJson, userSnapshot, UserRow } from '../db/database.js';
import { authMiddleware, AuthRequest, createNotification } from '../middleware/auth.js';
import { paramId } from '../lib/params.js';

const router = Router();

router.post('/follow/:userId', authMiddleware, async (req: AuthRequest, res) => {
  const userId = paramId(req.params.userId);
  if (userId === req.user!.id) return res.status(400).json({ error: 'Não pode seguir a si mesmo' });
  const [target, user] = await Promise.all([
    db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]),
    db.get<UserRow>('SELECT * FROM users WHERE id = ?', [req.user!.id]),
  ]);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

  try {
    await db.run('INSERT INTO follows (id, follower_id, following_id, follower_snapshot) VALUES (?, ?, ?, ?)', [
      uuid(), user!.id, userId, userSnapshot(user!),
    ]);
    await createNotification(userId, user!.id, 'follow', 'user', user!.id);
  } catch {
    return res.status(409).json({ error: 'Já segue este usuário' });
  }
  res.status(201).json({ ok: true });
});

router.delete('/follow/:userId', authMiddleware, async (req: AuthRequest, res) => {
  await db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [req.user!.id, paramId(req.params.userId)]);
  res.json({ ok: true });
});

router.post('/friendships', authMiddleware, async (req: AuthRequest, res) => {
  const { receiver_id } = req.body;
  if (!receiver_id || receiver_id === req.user!.id) return res.status(400).json({ error: 'Destinatário inválido' });

  const existing = await db.get<{ id: string }>(
    `SELECT * FROM friendships WHERE
     (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)`,
    [req.user!.id, receiver_id, receiver_id, req.user!.id]
  );
  if (existing) return res.status(409).json({ error: 'Solicitação já existe' });

  const id = uuid();
  await db.run('INSERT INTO friendships (id, requester_id, receiver_id, status) VALUES (?, ?, ?, ?)', [
    id, req.user!.id, receiver_id, 'pending',
  ]);
  await createNotification(receiver_id, req.user!.id, 'friendship_request', 'user', req.user!.id);
  res.status(201).json({ id, status: 'pending' });
});

router.get('/friendships/pending', authMiddleware, async (req: AuthRequest, res) => {
  const pending = await db.all(
    `SELECT f.*, u.id AS user_id, u.username, u.full_name, u.avatar_url
     FROM friendships f
     JOIN users u ON u.id = f.requester_id
     WHERE f.receiver_id = ? AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [req.user!.id]
  );
  res.json(pending);
});

router.get('/friendships/status/:userId', authMiddleware, async (req: AuthRequest, res) => {
  const userId = paramId(req.params.userId);
  if (userId === req.user!.id) return res.json({ status: 'self' });

  const row = await db.get<{ id: string; requester_id: string; receiver_id: string; status: string }>(
    `SELECT * FROM friendships WHERE
     (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)`,
    [req.user!.id, userId, userId, req.user!.id]
  );

  if (!row) return res.json({ status: 'none' });
  if (row.status === 'accepted') return res.json({ status: 'friends', friendship_id: row.id });
  if (row.status === 'pending' && row.requester_id === req.user!.id) {
    return res.json({ status: 'pending_sent', friendship_id: row.id });
  }
  if (row.status === 'pending' && row.receiver_id === req.user!.id) {
    return res.json({ status: 'pending_received', friendship_id: row.id });
  }
  return res.json({ status: 'none' });
});

router.post('/friendships/accept/:userId', authMiddleware, async (req: AuthRequest, res) => {
  const userId = paramId(req.params.userId);
  const friendship = await db.get<{ id: string; requester_id: string }>(
    `SELECT * FROM friendships WHERE requester_id = ? AND receiver_id = ? AND status = 'pending'`,
    [userId, req.user!.id]
  );
  if (!friendship) return res.status(404).json({ error: 'Solicitação não encontrada' });

  await db.run('UPDATE friendships SET status = ? WHERE id = ?', ['accepted', friendship.id]);
  await createNotification(friendship.requester_id, req.user!.id, 'friendship_accepted', 'user', req.user!.id);
  res.json({ ok: true, status: 'accepted' });
});

router.post('/friendships/reject/:userId', authMiddleware, async (req: AuthRequest, res) => {
  const userId = paramId(req.params.userId);
  await db.run(
    `DELETE FROM friendships WHERE requester_id = ? AND receiver_id = ? AND status = 'pending'`,
    [userId, req.user!.id]
  );
  res.json({ ok: true });
});

router.delete('/friendships/user/:userId', authMiddleware, async (req: AuthRequest, res) => {
  const userId = paramId(req.params.userId);
  await db.run(
    `DELETE FROM friendships WHERE
     (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)`,
    [req.user!.id, userId, userId, req.user!.id]
  );
  res.json({ ok: true });
});

router.get('/friendships/user/:userId', authMiddleware, async (req: AuthRequest, res) => {
  const userId = paramId(req.params.userId);
  const friendships = await db.all(
    `SELECT f.*, u.id AS friend_id, u.username, u.full_name, u.avatar_url FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END
     WHERE (f.requester_id = ? OR f.receiver_id = ?) AND f.status = 'accepted'
     ORDER BY u.full_name`,
    [userId, userId, userId]
  );
  res.json(friendships);
});

router.patch('/friendships/:id', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const { status } = req.body;
  if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const friendship = await db.get<{ receiver_id: string; requester_id: string }>(
    'SELECT * FROM friendships WHERE id = ?',
    [id]
  );
  if (!friendship) return res.status(404).json({ error: 'Solicitação não encontrada' });
  if (friendship.receiver_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });

  await db.run('UPDATE friendships SET status = ? WHERE id = ?', [status, id]);
  if (status === 'accepted') {
    await createNotification(friendship.requester_id, req.user!.id, 'friendship_accepted', 'user', req.user!.id);
  }
  res.json({ ok: true, status });
});

router.get('/friendships', authMiddleware, async (req: AuthRequest, res) => {
  const friendships = await db.all(
    `SELECT f.*, u.id AS friend_id, u.username, u.full_name, u.avatar_url FROM friendships f
     JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.receiver_id ELSE f.requester_id END
     WHERE (f.requester_id = ? OR f.receiver_id = ?) AND f.status = 'accepted'
     ORDER BY u.full_name`,
    [req.user!.id, req.user!.id, req.user!.id]
  );
  res.json(friendships);
});

router.get('/notifications', authMiddleware, async (req: AuthRequest, res) => {
  const notifications = await db.all<Record<string, unknown>>(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.user!.id]
  );
  res.json(
    notifications.map((n) => ({
      ...n,
      actor_snapshot: parseJson((n as { actor_snapshot: string }).actor_snapshot, {}),
      is_read: !!(n as { is_read: number }).is_read,
    }))
  );
});

router.get('/notifications/unread-count', authMiddleware, async (req: AuthRequest, res) => {
  const result = await db.get<{ c: number }>(
    'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0',
    [req.user!.id]
  );
  res.json({ count: result?.c ?? 0 });
});

router.patch('/notifications/:id/read', authMiddleware, async (req: AuthRequest, res) => {
  await db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [paramId(req.params.id), req.user!.id]);
  res.json({ ok: true });
});

router.patch('/notifications/read-all', authMiddleware, async (req: AuthRequest, res) => {
  await db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user!.id]);
  res.json({ ok: true });
});

export default router;
