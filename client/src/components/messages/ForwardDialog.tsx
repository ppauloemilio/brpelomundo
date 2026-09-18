import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';

type Conversation = {
  id: string;
  other_user: { id: string; full_name: string; avatar_url: string | null } | null;
};

type Friend = { friend_id: string; full_name: string; avatar_url: string | null };

type Props = {
  excludeConversationId?: string;
  onSelect: (target: { conversationId?: string; recipientId?: string }) => void;
  onClose: () => void;
};

export function ForwardDialog({ excludeConversationId, onSelect, onClose }: Props) {
  const { t } = useTranslation();

  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api<Conversation[]>('/conversations'),
  });

  const { data: friends = [] } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api<Friend[]>('/social/friendships'),
  });

  const convIds = new Set(
    conversations.filter((c) => c.id !== excludeConversationId).map((c) => c.other_user?.id)
  );

  const list = conversations.filter((c) => c.id !== excludeConversationId && c.other_user);
  const friendsWithoutChat = friends.filter((f) => !convIds.has(f.friend_id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[70vh] w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold text-slate-900">{t('messages.forwardTo')}</h3>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {list.length === 0 && friendsWithoutChat.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t('messages.noForwardTargets')}</p>
          ) : (
            <>
              {list.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  onClick={() => onSelect({ conversationId: c.id })}
                >
                  <Avatar name={c.other_user!.full_name} src={c.other_user!.avatar_url} className="h-10 w-10" />
                  <span className="font-medium text-slate-800">{c.other_user!.full_name}</span>
                </button>
              ))}
              {friendsWithoutChat.map((f) => (
                <button
                  key={f.friend_id}
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  onClick={() => onSelect({ recipientId: f.friend_id })}
                >
                  <Avatar name={f.full_name} src={f.avatar_url} className="h-10 w-10" />
                  <span className="font-medium text-slate-800">{f.full_name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
