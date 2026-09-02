import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn, formatDate } from '@/lib/utils';

type Conversation = {
  id: string;
  participant_ids: string[];
  last_message: { content: string; created_at: string } | null;
  unread_count: Record<string, number>;
};

type Message = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
};

export function MessagesPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeId = searchParams.get('conversation');
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api<Conversation[]>('/conversations'),
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', activeId],
    queryFn: () => api<Message[]>(`/conversations/${activeId}/messages`),
    enabled: !!activeId,
  });

  const sendMutation = useMutation({
    mutationFn: () => api(`/conversations/${activeId}/messages`, { method: 'POST', body: JSON.stringify({ content: text }) }),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['messages', activeId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  useEffect(() => {
    if (!activeId) return;
    const socket = io({ path: '/socket.io' });
    socket.emit('join_conversation', activeId);
    socket.on('new_message', () => {
      qc.invalidateQueries({ queryKey: ['messages', activeId] });
    });
    return () => { socket.disconnect(); };
  }, [activeId, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex h-[calc(100vh-10rem)] gap-4">
      <div className="w-full max-w-xs shrink-0 space-y-2 overflow-y-auto">
        <h1 className="text-xl font-bold">{t('messages.title')}</h1>
        {conversations.length === 0 ? (
          <p className="text-sm text-slate-500">{t('messages.empty')}</p>
        ) : (
          conversations.map((c) => (
            <Card
              key={c.id}
              className={cn('cursor-pointer', activeId === c.id && 'border-brand-500')}
              onClick={() => setSearchParams({ conversation: c.id })}
            >
              <CardContent className="py-3">
                <p className="text-sm font-medium truncate">{c.last_message?.content || '...'}</p>
                {(c.unread_count[user?.id || ''] || 0) > 0 && (
                  <span className="text-xs text-brand-600">{c.unread_count[user?.id || '']} nova(s)</span>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card className="flex flex-1 flex-col">
        {activeId ? (
          <>
            <CardContent className="flex-1 overflow-y-auto space-y-2 pt-4">
              {messages.map((m) => (
                <div key={m.id} className={cn('flex', m.sender_id === user?.id ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[70%] rounded-lg px-3 py-2 text-sm', m.sender_id === user?.id ? 'bg-brand-600 text-white' : 'bg-slate-100')}>
                    <p>{m.content}</p>
                    <p className="text-[10px] opacity-70 mt-1">{formatDate(m.created_at, i18n.language)}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </CardContent>
            <div className="flex gap-2 border-t p-4">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('messages.placeholder')} onKeyDown={(e) => e.key === 'Enter' && text.trim() && sendMutation.mutate()} />
              <Button onClick={() => sendMutation.mutate()} disabled={!text.trim()}>→</Button>
            </div>
          </>
        ) : (
          <CardContent className="flex flex-1 items-center justify-center text-slate-500">
            {t('messages.empty')}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
