import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb, parseJson } from '../db/database.js';
import { authMiddleware, AuthRequest, createNotification } from '../middleware/auth.js';
import type { Server as SocketServer } from 'socket.io';

let io: SocketServer | null = null;

export function setSocketIO(socketServer: SocketServer) {
  io = socketServer;
}

const router = Router();

router.get('/', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const conversations = db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all();
  const mine = conversations.filter((c) => {
    const participants = parseJson((c as { participant_ids: string }).participant_ids, [] as string[]);
    return participants.includes(req.user!.id);
  });

  res.json(
    mine.map((c) => ({
      ...c,
      participant_ids: parseJson((c as { participant_ids: string }).participant_ids, []),
      last_message: parseJson((c as { last_message: string | null }).last_message, null),
      unread_count: parseJson((c as { unread_count: string }).unread_count, {}),
    }))
  );
});

router.get('/unread-count', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const conversations = db.prepare('SELECT unread_count, participant_ids FROM conversations').all();
  let total = 0;
  for (const c of conversations) {
    const participants = parseJson((c as { participant_ids: string }).participant_ids, [] as string[]);
    if (!participants.includes(req.user!.id)) continue;
    const unread = parseJson((c as { unread_count: string }).unread_count, {} as Record<string, number>);
    total += unread[req.user!.id] || 0;
  }
  res.json({ count: total });
});

router.post('/', authMiddleware, (req: AuthRequest, res) => {
  const { participant_ids, type = 'user_user', business_id } = req.body;
  if (!participant_ids?.length) return res.status(400).json({ error: 'Participantes obrigatórios' });

  const allParticipants = [...new Set([req.user!.id, ...participant_ids])];
  const db = getDb();

  const existing = db.prepare('SELECT * FROM conversations').all().find((c) => {
    const p = parseJson((c as { participant_ids: string }).participant_ids, [] as string[]).sort();
    const target = [...allParticipants].sort();
    return JSON.stringify(p) === JSON.stringify(target) && (c as { type: string }).type === type;
  });

  if (existing) {
    return res.json({
      ...existing,
      participant_ids: parseJson((existing as { participant_ids: string }).participant_ids, []),
      last_message: parseJson((existing as { last_message: string | null }).last_message, null),
      unread_count: parseJson((existing as { unread_count: string }).unread_count, {}),
    });
  }

  const id = uuid();
  const unread: Record<string, number> = {};
  for (const p of allParticipants) unread[p] = 0;

  db.prepare(
    'INSERT INTO conversations (id, type, business_id, participant_ids, unread_count) VALUES (?, ?, ?, ?, ?)'
  ).run(id, type, business_id || null, JSON.stringify(allParticipants), JSON.stringify(unread));

  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  res.status(201).json({
    ...conversation,
    participant_ids: allParticipants,
    last_message: null,
    unread_count: unread,
  });
});

router.get('/:id/messages', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id) as
    | { participant_ids: string }
    | undefined;
  if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });

  const participants = parseJson(conversation.participant_ids, [] as string[]);
  if (!participants.includes(req.user!.id)) return res.status(403).json({ error: 'Sem permissão' });

  const messages = db.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? AND is_deleted = 0 ORDER BY created_at ASC'
  ).all(req.params.id);

  const unread = parseJson(
    (db.prepare('SELECT unread_count FROM conversations WHERE id = ?').get(req.params.id) as { unread_count: string }).unread_count,
    {} as Record<string, number>
  );
  unread[req.user!.id] = 0;
  db.prepare('UPDATE conversations SET unread_count = ? WHERE id = ?').run(JSON.stringify(unread), req.params.id);

  db.prepare(
    'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?'
  ).run(req.params.id, req.user!.id);

  res.json(messages.map((m) => ({ ...m, is_read: !!(m as { is_read: number }).is_read })));
});

router.post('/:id/messages', authMiddleware, (req: AuthRequest, res) => {
  const { content, attachment_url } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Mensagem vazia' });

  const db = getDb();
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id) as
    | { participant_ids: string; unread_count: string }
    | undefined;
  if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });

  const participants = parseJson(conversation.participant_ids, [] as string[]);
  if (!participants.includes(req.user!.id)) return res.status(403).json({ error: 'Sem permissão' });

  const id = uuid();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO messages (id, conversation_id, sender_id, content, attachment_url) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.params.id, req.user!.id, content.trim(), attachment_url || null);

  const lastMessage = { id, content: content.trim(), sender_id: req.user!.id, created_at: now };
  const unread = parseJson(conversation.unread_count, {} as Record<string, number>);
  for (const p of participants) {
    if (p !== req.user!.id) unread[p] = (unread[p] || 0) + 1;
  }

  db.prepare('UPDATE conversations SET last_message = ?, unread_count = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(lastMessage), JSON.stringify(unread), now, req.params.id
  );

  const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  for (const p of participants) {
    if (p !== req.user!.id) createNotification(p, req.user!.id, 'message', 'conversation', req.params.id);
  }

  io?.to(req.params.id).emit('new_message', message);
  res.status(201).json({ ...message, is_read: false });
});

export default router;
