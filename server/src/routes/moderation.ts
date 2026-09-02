import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const REPORT_REASONS = ['spam', 'scam', 'offensive', 'fake_profile', 'fraud', 'other'] as const;
const TARGET_TYPES = ['user', 'post', 'business', 'classified', 'group', 'event', 'review'] as const;

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

router.post('/reports', authMiddleware, (req: AuthRequest, res) => {
  const { target_type, target_id, reason, details } = req.body;
  if (!TARGET_TYPES.includes(target_type) || !target_id?.trim()) {
    return res.status(400).json({ error: 'Alvo inválido' });
  }
  if (!REPORT_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'Motivo inválido' });
  }

  const db = getDb();
  const recent = db.prepare(
    `SELECT id FROM reports
     WHERE reporter_id = ? AND target_type = ? AND target_id = ?
       AND created_at >= datetime('now', '-1 day')`
  ).get(req.user!.id, target_type, target_id);
  if (recent) {
    return res.status(429).json({ error: 'Você já denunciou este conteúdo recentemente' });
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, req.user!.id, target_type, target_id.trim(), reason, details?.trim() || '');

  res.status(201).json({ ok: true, id });
});

router.post('/blocks', authMiddleware, (req: AuthRequest, res) => {
  const blockedId = (req.body.user_id as string)?.trim();
  if (!blockedId) return res.status(400).json({ error: 'user_id obrigatório' });
  if (blockedId === req.user!.id) return res.status(400).json({ error: 'Não é possível bloquear a si mesmo' });

  const db = getDb();
  const target = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(blockedId);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

  const existing = db.prepare(
    'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?'
  ).get(req.user!.id, blockedId);
  if (!existing) {
    db.prepare(
      'INSERT INTO user_blocks (id, blocker_id, blocked_id) VALUES (?, ?, ?)'
    ).run(uuid(), req.user!.id, blockedId);
  }

  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user!.id, blockedId);
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(blockedId, req.user!.id);

  res.json({ ok: true, blocked: true });
});

router.delete('/blocks/:userId', authMiddleware, (req: AuthRequest, res) => {
  const blockedId = paramId(req.params.userId);
  getDb().prepare(
    'DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?'
  ).run(req.user!.id, blockedId);
  res.json({ ok: true, blocked: false });
});

router.get('/blocks', authMiddleware, (req: AuthRequest, res) => {
  const rows = getDb().prepare(
    `SELECT ub.blocked_id AS id, u.full_name, u.username, u.avatar_url, ub.created_at
     FROM user_blocks ub
     JOIN users u ON u.id = ub.blocked_id
     WHERE ub.blocker_id = ?
     ORDER BY ub.created_at DESC`
  ).all(req.user!.id);
  res.json(rows);
});

router.get('/blocks/check/:userId', authMiddleware, (req: AuthRequest, res) => {
  const otherId = paramId(req.params.userId);
  const db = getDb();
  const blocked = db.prepare(
    'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?'
  ).get(req.user!.id, otherId);
  const blockedBy = db.prepare(
    'SELECT id FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?'
  ).get(otherId, req.user!.id);
  res.json({ blocked: !!blocked, blocked_by: !!blockedBy });
});

export default router;
