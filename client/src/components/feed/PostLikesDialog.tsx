import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { UserLink } from '@/components/ui/UserLink';

type LikeUser = {
  user_id: string;
  user_snapshot: { full_name: string; username?: string; avatar_url?: string | null };
};

type Props = {
  postId: string;
  onClose: () => void;
};

export function PostLikesDialog({ postId, onClose }: Props) {
  const { t } = useTranslation();

  const { data: likes = [], isLoading } = useQuery({
    queryKey: ['post-likes', postId],
    queryFn: () => api<LikeUser[]>(`/posts/${postId}/likes`),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[70vh] w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-slate-900">{t('feed.whoLiked')}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t('common.loading')}</p>
          ) : likes.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t('feed.noLikes')}</p>
          ) : (
            likes.map((like) => (
              <UserLink
                key={like.user_id}
                userId={like.user_id}
                className="flex items-center gap-3 px-4 py-3 no-underline hover:bg-slate-50"
              >
                <Avatar
                  name={like.user_snapshot.full_name}
                  src={like.user_snapshot.avatar_url}
                  className="h-10 w-10"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{like.user_snapshot.full_name}</p>
                  {like.user_snapshot.username && (
                    <p className="truncate text-sm text-slate-500">@{like.user_snapshot.username}</p>
                  )}
                </div>
              </UserLink>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
