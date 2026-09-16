import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const REPORT_REASONS = ['spam', 'scam', 'offensive', 'fake_profile', 'fraud', 'other'] as const;
const TARGET_TYPES = ['user', 'post', 'business', 'classified', 'group', 'event', 'review'] as const;

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

router.post('/reports', authMiddleware, async (req: AuthRequest, res) => {
  const { target_type, target_id, reason, details } = req.body;
  if (!TARGET_TYPES.includes(target_type) || !target_id?.trim()) {
    return res.status(400).json({ error: 'Alvo inválido' });
  }
  if (!REPORT_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'Motivo inválido' });
  }

  const recent = await db.get<{ id: string }>(
    `SELECT id FROM reports
     WHERE reporter_id = ? AND target_type = ? AND target_id = ?
       AND created_at >= utc_now(interval '-1 day')`,
    [req.user!.id, target_type, target_id]
  );
  if (recent) {
    return res.status(429).json({ error: 'Você já denunciou este conteúdo recentemente' });
  }

  const id = uuid();
  await db.run(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, req.user!.id, target_type, target_id.trim(), reason, details?.trim() || '']
  );

  res.status(201).json({ ok: true, id });
});

router.post('/blocks', authMiddleware, async (req: AuthRequest, res) => {
  const blockedId = (req.body.user_id as string)?.trim();
  if (!blockedId) return res.status(400).json({ error: 'user_id obrigatório' });
  if (blockedId === req.user!.id) return res.status(400).json({ error: 'Não é possível bloquear a si mesmo' });

  const target = await db.get<{ id: string }>('SELECT id FROM users WHERE id = ? AND is_active = 1', [blockedId]);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

  const existing = await db.get<{ id: string }>(
    'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?',
    [req.user!.id, blockedId]
  );
  if (!existing) {
    await db.run(
      'INSERT INTO user_blocks (id, blocker_id, blocked_id) VALUES (?, ?, ?)',
      [uuid(), req.user!.id, blockedId]
    );
  }

  await db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [req.user!.id, blockedId]);
  await db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [blockedId, req.user!.id]);

  res.json({ ok: true, blocked: true });
});

router.delete('/blocks/:userId', authMiddleware, async (req: AuthRequest, res) => {
  const blockedId = paramId(req.params.userId);
  await db.run(
    'DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?',
    [req.user!.id, blockedId]
  );
  res.json({ ok: true, blocked: false });
});

router.get('/blocks', authMiddleware, async (req: AuthRequest, res) => {
  const rows = await db.all(
    `SELECT ub.blocked_id AS id, u.full_name, u.username, u.avatar_url, ub.created_at
     FROM user_blocks ub
     JOIN users u ON u.id = ub.blocked_id
     WHERE ub.blocker_id = ?
     ORDER BY ub.created_at DESC`,
    [req.user!.id]
  );
  res.json(rows);
});

router.get('/blocks/check/:userId', authMiddleware, async (req: AuthRequest, res) => {
  const otherId = paramId(req.params.userId);
  const [blocked, blockedBy] = await Promise.all([
    db.get<{ id: string }>(
      'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?',
      [req.user!.id, otherId]
    ),
    db.get<{ id: string }>(
      'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?',
      [otherId, req.user!.id]
    ),
  ]);
  res.json({ blocked: !!blocked, blocked_by: !!blockedBy });
});

export default router;
