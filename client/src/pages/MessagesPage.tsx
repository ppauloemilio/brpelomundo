import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Plus, MoreVertical, Smile, Send, Pencil, Forward, Trash2, Check, ImagePlus,
} from 'lucide-react';
import { api, assetUrl, uploadFile } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { ForwardDialog } from '@/components/messages/ForwardDialog';
import { cn } from '@/lib/utils';

type OtherUser = { id: string; full_name: string; username: string; avatar_url: string | null };

type Conversation = {
  id: string;
  participant_ids: string[];
  last_message: { content: string; created_at: string; sender_id: string } | null;
  unread_count: Record<string, number>;
  updated_at: string;
  other_user: OtherUser | null;
};

type Message = {
  id: string;
  sender_id: string;
  content: string;
  attachment_url?: string | null;
  created_at: string;
  edited_at?: string | null;
  is_read: boolean;
  forwarded_from?: { sender_name: string } | null;
};

function formatChatTime(iso: string, locale: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function MessagesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get('conversation');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api<Conversation[]>('/conversations'),
    refetchInterval: 15_000,
  });

  const { data: friends = [] } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api<Array<{ friend_id: string; full_name: string; avatar_url: string | null }>>('/social/friendships'),
    enabled: showNewChat,
  });

  const active = conversations.find((c) => c.id === activeId);

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', activeId],
    queryFn: () => api<Message[]>(`/conversations/${activeId}/messages`),
    enabled: !!activeId,
    refetchInterval: 5_000,
  });

  const sendMutation = useMutation({
    mutationFn: (body: { content?: string; attachment_url?: string }) =>
      api(`/conversations/${activeId}/messages`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['messages', activeId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api(`/conversations/${activeId}/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditText('');
      qc.invalidateQueries({ queryKey: ['messages', activeId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api(`/conversations/${activeId}/messages/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', activeId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const forwardMutation = useMutation({
    mutationFn: ({
      messageId,
      target_conversation_id,
      recipient_id,
    }: {
      messageId: string;
      target_conversation_id?: string;
      recipient_id?: string;
    }) =>
      api<{ conversation_id: string }>(`/conversations/${activeId}/messages/${messageId}/forward`, {
        method: 'POST',
        body: JSON.stringify({ target_conversation_id, recipient_id }),
      }),
    onSuccess: (data: { conversation_id: string }) => {
      setForwardMsg(null);
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setSearchParams({ conversation: data.conversation_id });
    },
  });

  const newChatMutation = useMutation({
    mutationFn: (participantId: string) =>
      api<{ id: string }>('/conversations', {
        method: 'POST',
        body: JSON.stringify({ participant_ids: [participantId], type: 'user_user' }),
      }),
    onSuccess: (conv) => {
      setShowNewChat(false);
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setSearchParams({ conversation: conv.id });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filtered = conversations.filter((c) => {
    const unread = (c.unread_count[user?.id || ''] || 0) > 0;
    if (filter === 'unread' && !unread) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = c.other_user?.full_name.toLowerCase() || '';
    const preview = c.last_message?.content.toLowerCase() || '';
    return name.includes(q) || preview.includes(q);
  });

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    setUploading(true);
    try {
      const { url } = await uploadFile(file);
      sendMutation.mutate({ content: '', attachment_url: url });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="flex h-[calc(100vh-7rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Lista de conversas */}
      <aside className="flex w-full max-w-sm shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">{t('messages.title')}</h1>
          <button
            type="button"
            onClick={() => setShowNewChat(true)}
            className="rounded-full p-2 text-slate-600 hover:bg-slate-100"
            aria-label={t('messages.newChat')}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('messages.search')}
              className="w-full rounded-lg bg-slate-100 py-2 pl-9 pr-3 text-sm outline-none ring-brand-500/30 focus:ring-2"
            />
          </div>
          <div className="mt-2 flex gap-2">
            {(['all', 'unread'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  filter === key ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-600'
                )}
              >
                {t(key === 'all' ? 'messages.filterAll' : 'messages.filterUnread')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t('messages.empty')}</p>
          ) : (
            filtered.map((c) => {
              const unread = c.unread_count[user?.id || ''] || 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSearchParams({ conversation: c.id })}
                  className={cn(
                    'flex w-full items-center gap-3 border-b border-slate-50 px-3 py-3 text-left hover:bg-slate-50',
                    activeId === c.id && 'bg-brand-50/60'
                  )}
                >
                  <Avatar
                    name={c.other_user?.full_name || '?'}
                    src={c.other_user?.avatar_url}
                    className="h-12 w-12 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-semibold text-slate-900">
                        {c.other_user?.full_name || t('messages.unknownUser')}
                      </p>
                      {c.last_message && (
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {formatChatTime(c.last_message.created_at, i18n.language)}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm text-slate-500">
                      {c.last_message?.content || '...'}
                    </p>
                  </div>
                  {unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Área do chat */}
      <section className="flex min-w-0 flex-1 flex-col bg-[#efeae2]">
        {activeId && active ? (
          <>
            <header className="flex items-center gap-3 border-b bg-[#f0f2f5] px-4 py-2">
              <Avatar
                name={active.other_user?.full_name || '?'}
                src={active.other_user?.avatar_url}
                className="h-10 w-10"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">
                  {active.other_user?.full_name}
                </p>
                <p className="truncate text-xs text-slate-500">@{active.other_user?.username}</p>
              </div>
              <button type="button" className="rounded-full p-2 text-slate-500 hover:bg-slate-200/60">
                <Search className="h-5 w-5" />
              </button>
              <button type="button" className="rounded-full p-2 text-slate-500 hover:bg-slate-200/60">
                <MoreVertical className="h-5 w-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {messages.map((m) => {
                const mine = m.sender_id === user?.id;
                const isEditing = editingId === m.id;

                return (
                  <div key={m.id} className={cn('mb-2 flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'group relative max-w-[75%] rounded-lg px-3 py-2 shadow-sm',
                        mine ? 'bg-[#d9fdd3]' : 'bg-white'
                      )}
                    >
                      {m.forwarded_from && (
                        <p className="mb-1 text-[10px] italic text-slate-500">
                          {t('messages.forwardedFrom', { name: m.forwarded_from.sender_name })}
                        </p>
                      )}

                      {mine && !isEditing && (
                        <div className="absolute -top-3 right-0 flex gap-0.5 rounded-md bg-white/90 px-1 py-0.5 opacity-0 shadow group-hover:opacity-100">
                          {!m.attachment_url && (
                            <button
                              type="button"
                              className="rounded p-1 text-slate-500 hover:bg-slate-100"
                              onClick={() => { setEditingId(m.id); setEditText(m.content); }}
                              title={t('messages.edit')}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded p-1 text-slate-500 hover:bg-slate-100"
                            onClick={() => setForwardMsg(m)}
                            title={t('messages.forward')}
                          >
                            <Forward className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-red-500 hover:bg-red-50"
                            onClick={() => deleteMutation.mutate(m.id)}
                            title={t('common.delete')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-sm text-slate-900"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="text-xs font-medium text-brand-700"
                              onClick={() => editMutation.mutate({ id: m.id, content: editText })}
                            >
                              {t('common.save')}
                            </button>
                            <button
                              type="button"
                              className="text-xs text-slate-500"
                              onClick={() => setEditingId(null)}
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {m.attachment_url && (
                            <img
                              src={assetUrl(m.attachment_url) ?? m.attachment_url}
                              alt=""
                              className="mb-1 max-h-64 w-full rounded-lg object-cover"
                            />
                          )}
                          {m.content && <p className="whitespace-pre-wrap text-sm text-slate-900">{m.content}</p>}
                        </>
                      )}

                      <div className="mt-1 flex items-center justify-end gap-1">
                        {m.edited_at && (
                          <span className="text-[10px] text-slate-400">{t('messages.edited')}</span>
                        )}
                        <span className="text-[10px] text-slate-500">
                          {formatChatTime(m.created_at, i18n.language)}
                        </span>
                        {mine && <Check className="h-3 w-3 text-brand-600" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <footer className="flex items-center gap-2 border-t bg-[#f0f2f5] px-3 py-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-200/60 disabled:opacity-50"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
              <button type="button" className="rounded-full p-2 text-slate-500 hover:bg-slate-200/60">
                <Smile className="h-5 w-5" />
              </button>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('messages.placeholder')}
                className="flex-1 rounded-full border-0 bg-white px-4 py-2.5 text-sm outline-none ring-brand-500/30 focus:ring-2"
                onKeyDown={(e) => e.key === 'Enter' && text.trim() && sendMutation.mutate({ content: text })}
              />
              <button
                type="button"
                onClick={() => text.trim() && sendMutation.mutate({ content: text })}
                disabled={!text.trim() || sendMutation.isPending}
                className="rounded-full p-2 text-brand-700 hover:bg-brand-100 disabled:opacity-40"
              >
                <Send className="h-5 w-5" />
              </button>
            </footer>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-slate-500">
            <p className="text-lg font-medium">{t('messages.selectConversation')}</p>
            <p className="mt-1 text-sm">{t('messages.selectConversationHint')}</p>
          </div>
        )}
      </section>

      {forwardMsg && activeId && (
        <ForwardDialog
          excludeConversationId={activeId}
          onClose={() => setForwardMsg(null)}
          onSelect={(target) =>
            forwardMutation.mutate({
              messageId: forwardMsg.id,
              target_conversation_id: target.conversationId,
              recipient_id: target.recipientId,
            })
          }
        />
      )}

      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNewChat(false)}>
          <div className="max-h-[70vh] w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b px-4 py-3">
              <h3 className="font-semibold">{t('messages.newChat')}</h3>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {friends.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">{t('messages.noFriendsToChat')}</p>
              ) : (
                friends.map((f) => (
                  <button
                    key={f.friend_id}
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => newChatMutation.mutate(f.friend_id)}
                  >
                    <Avatar name={f.full_name} src={f.avatar_url} className="h-10 w-10" />
                    <span className="font-medium">{f.full_name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
