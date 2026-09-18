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
 */
const PARTICIPANT_FILTER = `participant_ids::jsonb @> to_jsonb(?::text)`;

type ConversationRow = {
  id: string;
  participant_ids: string;
  last_message: string | null;
  unread_count: string;
  type: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachment_url: string | null;
  attachment_type: string | null;
  is_read: number;
  is_deleted: number;
  edited_at: string | null;
  forwarded_from: string | null;
  created_at: string;
};

function formatConversation(c: ConversationRow) {
  return {
    ...c,
    participant_ids: parseJson(c.participant_ids, [] as string[]),
    last_message: parseJson(c.last_message, null),
    unread_count: parseJson(c.unread_count, {} as Record<string, number>),
  };
}

function formatMessage(m: MessageRow) {
  return {
    ...m,
    is_read: !!m.is_read,
    is_deleted: !!m.is_deleted,
    forwarded_from: parseJson(m.forwarded_from, null),
  };
}

function attachmentPreview(type: string | null | undefined, fallback: string) {
  if (type === 'video') return '🎬 Vídeo';
  if (type === 'image') return '📷 Foto';
  return fallback;
}

function deletedPreview() {
  return '🚫 Mensagem apagada';
}

async function refreshLastMessage(conversationId: string) {
  const last = await db.get<MessageRow>(
    `SELECT id, content, sender_id, created_at, attachment_url, attachment_type, is_deleted FROM messages
     WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`,
    [conversationId]
  );
  const preview = last
    ? {
        id: last.id,
        content: last.is_deleted
          ? deletedPreview()
          : attachmentPreview(last.attachment_type, last.content),
        sender_id: last.sender_id,
        created_at: last.created_at,
      }
    : null;
  await db.run('UPDATE conversations SET last_message = ? WHERE id = ?', [
    preview ? JSON.stringify(preview) : null,
    conversationId,
  ]);
}

async function assertParticipant(conversationId: string, userId: string) {
  const conversation = await db.get<{ participant_ids: string }>(
    'SELECT participant_ids FROM conversations WHERE id = ?',
    [conversationId]
  );
  if (!conversation) return { error: 'Conversa não encontrada', status: 404 as const };
  const participants = parseJson(conversation.participant_ids, [] as string[]);
  if (!participants.includes(userId)) return { error: 'Sem permissão', status: 403 as const };
  return { participants, conversation };
}

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const mine = await db.all<ConversationRow>(
    `SELECT * FROM conversations WHERE ${PARTICIPANT_FILTER} ORDER BY updated_at DESC`,
    [req.user!.id]
  );

  const enriched = await Promise.all(
    mine.map(async (c) => {
      const formatted = formatConversation(c);
      const otherId = formatted.participant_ids.find((p) => p !== req.user!.id);
      const other_user = otherId
        ? await db.get<{ id: string; full_name: string; username: string; avatar_url: string | null }>(
            'SELECT id, full_name, username, avatar_url FROM users WHERE id = ?',
            [otherId]
          )
        : null;
      return { ...formatted, other_user };
    })
  );

  res.json(enriched);
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
    const formatted = formatConversation(existing);
    const otherId = formatted.participant_ids.find((p) => p !== req.user!.id);
    const other_user = otherId
      ? await db.get('SELECT id, full_name, username, avatar_url FROM users WHERE id = ?', [otherId])
      : null;
    return res.json({ ...formatted, other_user });
  }

  const id = uuid();
  const unread: Record<string, number> = {};
  for (const p of allParticipants) unread[p] = 0;

  await db.run(
    'INSERT INTO conversations (id, type, business_id, participant_ids, unread_count) VALUES (?, ?, ?, ?, ?)',
    [id, type, business_id || null, JSON.stringify(allParticipants), JSON.stringify(unread)]
  );

  const otherId = allParticipants.find((p) => p !== req.user!.id);
  const other_user = otherId
    ? await db.get('SELECT id, full_name, username, avatar_url FROM users WHERE id = ?', [otherId])
    : null;

  res.status(201).json({
    id,
    type,
    business_id: business_id || null,
    participant_ids: allParticipants,
    last_message: null,
    unread_count: unread,
    other_user,
  });
});

router.get('/:id/messages', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const access = await assertParticipant(id, req.user!.id);
  if ('error' in access) return res.status(access.status!).json({ error: access.error });

  const conversation = await db.get<{ unread_count: string }>(
    'SELECT unread_count FROM conversations WHERE id = ?',
    [id]
  );

  const messages = await db.all<MessageRow>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [id]
  );

  const unread = parseJson(conversation!.unread_count, {} as Record<string, number>);
  unread[req.user!.id] = 0;
  await db.run('UPDATE conversations SET unread_count = ? WHERE id = ?', [
    JSON.stringify(unread),
    id,
  ]);

  await db.run('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?', [
    id,
    req.user!.id,
  ]);

  res.json(messages.map(formatMessage));
});

router.post('/:id/messages', authMiddleware, async (req: AuthRequest, res) => {
  const conversationId = paramId(req.params.id);
  const { content, attachment_url, attachment_type } = req.body;
  if (!content?.trim() && !attachment_url) {
    return res.status(400).json({ error: 'Mensagem vazia' });
  }

  const access = await assertParticipant(conversationId, req.user!.id);
  if ('error' in access) return res.status(access.status!).json({ error: access.error });

  const conversation = await db.get<{ unread_count: string }>(
    'SELECT unread_count FROM conversations WHERE id = ?',
    [conversationId]
  );

  const id = uuid();
  const now = new Date().toISOString();
  const text = content?.trim() || '';
  await db.run(
    `INSERT INTO messages (id, conversation_id, sender_id, content, attachment_url, attachment_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, conversationId, req.user!.id, text, attachment_url || null, attachment_type || null]
  );

  const lastMessage = {
    id,
    content: attachment_url ? attachmentPreview(attachment_type, text) : text,
    sender_id: req.user!.id,
    created_at: now,
  };
  const unread = parseJson(conversation!.unread_count, {} as Record<string, number>);
  for (const p of access.participants) {
    if (p !== req.user!.id) unread[p] = (unread[p] || 0) + 1;
  }

  await db.run(
    'UPDATE conversations SET last_message = ?, unread_count = ?, updated_at = ? WHERE id = ?',
    [JSON.stringify(lastMessage), JSON.stringify(unread), now, conversationId]
  );

  const message = await db.get<MessageRow>('SELECT * FROM messages WHERE id = ?', [id]);
  for (const p of access.participants) {
    if (p !== req.user!.id) {
      await createNotification(p, req.user!.id, 'message', 'conversation', conversationId);
    }
  }

  res.status(201).json(formatMessage(message!));
});

router.patch('/:id/messages/:messageId', authMiddleware, async (req: AuthRequest, res) => {
  const conversationId = paramId(req.params.id);
  const messageId = paramId(req.params.messageId);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Mensagem vazia' });

  const access = await assertParticipant(conversationId, req.user!.id);
  if ('error' in access) return res.status(access.status!).json({ error: access.error });

  const message = await db.get<MessageRow>(
    'SELECT * FROM messages WHERE id = ? AND conversation_id = ? AND is_deleted = 0',
    [messageId, conversationId]
  );
  if (!message) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (message.sender_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });

  const now = new Date().toISOString();
  await db.run(
    'UPDATE messages SET content = ?, edited_at = ? WHERE id = ?',
    [content.trim(), now, messageId]
  );

  const convRow = await db.get<{ last_message: string | null }>(
    'SELECT last_message FROM conversations WHERE id = ?',
    [conversationId]
  );
  const last = parseJson(convRow?.last_message ?? null, null as { id: string } | null);
  if (last?.id === messageId) {
    await refreshLastMessage(conversationId);
  }

  const updated = await db.get<MessageRow>('SELECT * FROM messages WHERE id = ?', [messageId]);
  res.json(formatMessage(updated!));
});

router.delete('/:id/messages/:messageId', authMiddleware, async (req: AuthRequest, res) => {
  const conversationId = paramId(req.params.id);
  const messageId = paramId(req.params.messageId);

  const access = await assertParticipant(conversationId, req.user!.id);
  if ('error' in access) return res.status(access.status!).json({ error: access.error });

  const message = await db.get<MessageRow>(
    'SELECT * FROM messages WHERE id = ? AND conversation_id = ? AND is_deleted = 0',
    [messageId, conversationId]
  );
  if (!message) return res.status(404).json({ error: 'Mensagem não encontrada' });
  if (message.sender_id !== req.user!.id) return res.status(403).json({ error: 'Sem permissão' });

  await db.run(
    `UPDATE messages SET is_deleted = 1, content = '', attachment_url = NULL, attachment_type = NULL
     WHERE id = ?`,
    [messageId]
  );
  await refreshLastMessage(conversationId);
  const tombstone = await db.get<MessageRow>('SELECT * FROM messages WHERE id = ?', [messageId]);
  res.json(formatMessage(tombstone!));
});

router.post('/:id/messages/:messageId/forward', authMiddleware, async (req: AuthRequest, res) => {
  const conversationId = paramId(req.params.id);
  const messageId = paramId(req.params.messageId);
  const { target_conversation_id, recipient_id } = req.body;

  const access = await assertParticipant(conversationId, req.user!.id);
  if ('error' in access) return res.status(access.status!).json({ error: access.error });

  const message = await db.get<MessageRow>(
    'SELECT * FROM messages WHERE id = ? AND conversation_id = ? AND is_deleted = 0',
    [messageId, conversationId]
  );
  if (!message) return res.status(404).json({ error: 'Mensagem não encontrada' });

  let targetId = target_conversation_id as string | undefined;
  if (!targetId && recipient_id) {
    const allParticipants = [...new Set([req.user!.id, recipient_id])];
    const candidates = await db.all<ConversationRow>(
      `SELECT * FROM conversations WHERE ${PARTICIPANT_FILTER}`,
      [req.user!.id]
    );
    const target = JSON.stringify([...allParticipants].sort());
    const existing = candidates.find(
      (c) => JSON.stringify(parseJson(c.participant_ids, [] as string[]).sort()) === target
    );
    if (existing) {
      targetId = existing.id;
    } else {
      targetId = uuid();
      const unread: Record<string, number> = {};
      for (const p of allParticipants) unread[p] = 0;
      await db.run(
        'INSERT INTO conversations (id, type, participant_ids, unread_count) VALUES (?, ?, ?, ?)',
        [targetId, 'user_user', JSON.stringify(allParticipants), JSON.stringify(unread)]
      );
    }
  }

  if (!targetId) return res.status(400).json({ error: 'Destino obrigatório' });

  const targetAccess = await assertParticipant(targetId, req.user!.id);
  if ('error' in targetAccess) return res.status(targetAccess.status!).json({ error: targetAccess.error });

  const sender = await db.get<{ full_name: string }>('SELECT full_name FROM users WHERE id = ?', [
    message.sender_id,
  ]);

  const id = uuid();
  const now = new Date().toISOString();
  const forwardedFrom = JSON.stringify({
    message_id: message.id,
    sender_name: sender?.full_name || 'Usuário',
    original_conversation_id: conversationId,
  });

  await db.run(
    `INSERT INTO messages (id, conversation_id, sender_id, content, attachment_url, attachment_type, forwarded_from)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      targetId,
      req.user!.id,
      message.content,
      message.attachment_url,
      message.attachment_type,
      forwardedFrom,
    ]
  );

  const preview = message.attachment_url
    ? attachmentPreview(message.attachment_type, message.content)
    : message.content;
  const targetConv = await db.get<{ unread_count: string }>(
    'SELECT unread_count FROM conversations WHERE id = ?',
    [targetId]
  );
  const unread = parseJson(targetConv!.unread_count, {} as Record<string, number>);
  for (const p of targetAccess.participants) {
    if (p !== req.user!.id) unread[p] = (unread[p] || 0) + 1;
  }

  await db.run(
    'UPDATE conversations SET last_message = ?, unread_count = ?, updated_at = ? WHERE id = ?',
    [
      JSON.stringify({ id, content: preview, sender_id: req.user!.id, created_at: now }),
      JSON.stringify(unread),
      now,
      targetId,
    ]
  );

  for (const p of targetAccess.participants) {
    if (p !== req.user!.id) {
      await createNotification(p, req.user!.id, 'message', 'conversation', targetId);
    }
  }

  const created = await db.get<MessageRow>('SELECT * FROM messages WHERE id = ?', [id]);
  res.status(201).json({ message: formatMessage(created!), conversation_id: targetId });
});

export default router;
