import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { parseJson } from '../db/database.js';
import { authMiddleware, AuthRequest, createNotification } from '../middleware/auth.js';
import { paramId } from '../lib/params.js';

const router = Router();

/**
 * `participant_ids` guarda um array JSON em TEXT. O operador `@>` do jsonb
 * filtra as conversas do usuário no banco, em vez de carregar a tabela toda.
 * (Evitamos o operador `?` do jsonb porque ele colidiria com os placeholders.)
 */
const PARTICIPANT_FILTER = `participant_ids::jsonb @> to_jsonb(?::text)`;

type ConversationRow = {
  participant_ids: string;
  last_message: string | null;
  unread_count: string;
  type: string;
};

function formatConversation(c: ConversationRow) {
  return {
    ...c,
    participant_ids: parseJson(c.participant_ids, [] as string[]),
    last_message: parseJson(c.last_message, null),
    unread_count: parseJson(c.unread_count, {}),
  };
}

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const mine = await db.all<ConversationRow>(
    `SELECT * FROM conversations WHERE ${PARTICIPANT_FILTER} ORDER BY updated_at DESC`,
    [req.user!.id]
  );
  res.json(mine.map(formatConversation));
});

router.get('/unread-count', authMiddleware, async (req: AuthRequest, res) => {
  const conversations = await db.all<{ unread_count: string }>(
    `SELECT unread_count FROM conversations WHERE ${PARTICIPANT_FILTER}`,
    [req.user!.id]
  );
  let total = 0;
  for (const c of conversations) {
    const unread = parseJson(c.unread_count, {} as Record<string, number>);
    total += unread[req.user!.id] || 0;
  }
  res.json({ count: total });
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const { participant_ids, type = 'user_user', business_id } = req.body;
  if (!participant_ids?.length) return res.status(400).json({ error: 'Participantes obrigatórios' });

  const allParticipants = [...new Set([req.user!.id, ...participant_ids])];

  const candidates = await db.all<ConversationRow>(
    `SELECT * FROM conversations WHERE ${PARTICIPANT_FILTER}`,
    [req.user!.id]
  );
  const target = JSON.stringify([...allParticipants].sort());
  const existing = candidates.find(
    (c) =>
      JSON.stringify(parseJson(c.participant_ids, [] as string[]).sort()) === target &&
      c.type === type
  );

  if (existing) {
    return res.json(formatConversation(existing));
  }

  const id = uuid();
  const unread: Record<string, number> = {};
  for (const p of allParticipants) unread[p] = 0;

  await db.run(
    'INSERT INTO conversations (id, type, business_id, participant_ids, unread_count) VALUES (?, ?, ?, ?, ?)',
    [id, type, business_id || null, JSON.stringify(allParticipants), JSON.stringify(unread)]
  );

  const conversation = await db.get<Record<string, unknown>>(
    'SELECT * FROM conversations WHERE id = ?',
    [id]
  );
  res.status(201).json({
    ...conversation,
    participant_ids: allParticipants,
    last_message: null,
    unread_count: unread,
  });
});

router.get('/:id/messages', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const conversation = await db.get<{ participant_ids: string; unread_count: string }>(
    'SELECT * FROM conversations WHERE id = ?',
    [id]
  );
  if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });

  const participants = parseJson(conversation.participant_ids, [] as string[]);
  if (!participants.includes(req.user!.id)) return res.status(403).json({ error: 'Sem permissão' });

  const messages = await db.all<{ is_read: number }>(
    'SELECT * FROM messages WHERE conversation_id = ? AND is_deleted = 0 ORDER BY created_at ASC',
    [id]
  );

  const unread = parseJson(conversation.unread_count, {} as Record<string, number>);
  unread[req.user!.id] = 0;
  await db.run('UPDATE conversations SET unread_count = ? WHERE id = ?', [
    JSON.stringify(unread),
    id,
  ]);

  await db.run('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?', [
    id,
    req.user!.id,
  ]);

  res.json(messages.map((m) => ({ ...m, is_read: !!m.is_read })));
});

router.post('/:id/messages', authMiddleware, async (req: AuthRequest, res) => {
  const conversationId = paramId(req.params.id);
  const { content, attachment_url } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Mensagem vazia' });

  const conversation = await db.get<{ participant_ids: string; unread_count: string }>(
    'SELECT * FROM conversations WHERE id = ?',
    [conversationId]
  );
  if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });

  const participants = parseJson(conversation.participant_ids, [] as string[]);
  if (!participants.includes(req.user!.id)) return res.status(403).json({ error: 'Sem permissão' });

  const id = uuid();
  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO messages (id, conversation_id, sender_id, content, attachment_url) VALUES (?, ?, ?, ?, ?)',
    [id, conversationId, req.user!.id, content.trim(), attachment_url || null]
  );

  const lastMessage = { id, content: content.trim(), sender_id: req.user!.id, created_at: now };
  const unread = parseJson(conversation.unread_count, {} as Record<string, number>);
  for (const p of participants) {
    if (p !== req.user!.id) unread[p] = (unread[p] || 0) + 1;
  }

  await db.run(
    'UPDATE conversations SET last_message = ?, unread_count = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(lastMessage), JSON.stringify(unread), now, conversationId]
  );

  const message = await db.get<Record<string, unknown>>(
    'SELECT * FROM messages WHERE id = ?',
    [id]
  );
  for (const p of participants) {
    if (p !== req.user!.id) {
      await createNotification(p, req.user!.id, 'message', 'conversation', conversationId);
    }
  }

  res.status(201).json({ ...message, is_read: false });
});

export default router;
