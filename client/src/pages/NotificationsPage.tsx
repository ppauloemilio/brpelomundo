import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { UserLink } from '@/components/ui/UserLink';
import { formatDate } from '@/lib/utils';

type Notification = {
  id: string;
  type: string;
  actor_id: string;
  target_type?: string | null;
  target_id?: string | null;
  actor_snapshot: { full_name: string; avatar_url?: string };
  created_at: string;
  is_read: boolean;
};

function notificationPath(n: Notification): string | null {
  if (n.type === 'message') {
    if (n.target_type === 'conversation' && n.target_id) {
      return `/messages?conversation=${encodeURIComponent(n.target_id)}`;
    }
    return '/messages';
  }

  if (
    n.type === 'friendship_accepted' ||
    n.type === 'friendship_accepted_self' ||
    n.type === 'friendship_rejected_self' ||
    n.type === 'friendship_request' ||
    n.type === 'follow'
  ) {
    return n.actor_id ? `/user/${n.actor_id}` : null;
  }

  if (n.type === 'like' || n.type === 'comment' || n.type === 'share') {
    return '/feed';
  }

  return n.actor_id ? `/user/${n.actor_id}` : null;
}

export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notification[]>('/social/notifications'),
  });

  const markAllMutation = useMutation({
    mutationFn: () => api('/social/notifications/read-all', { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api(`/social/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-count'] });
    },
  });

  const acceptFriendMutation = useMutation({
    mutationFn: (userId: string) => api(`/social/friendships/accept/${userId}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-count'] });
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['feed-sidebar'] });
    },
  });

  const rejectFriendMutation = useMutation({
    mutationFn: (userId: string) => api(`/social/friendships/reject/${userId}`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-count'] });
      qc.invalidateQueries({ queryKey: ['feed-sidebar'] });
    },
  });

  const openNotification = (n: Notification) => {
    if (!n.is_read) markReadMutation.mutate(n.id);
    const path = notificationPath(n);
    if (path) navigate(path);
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('notifications.title')}</h1>
        {notifications.some((n) => !n.is_read) && (
          <Button variant="outline" size="sm" onClick={() => markAllMutation.mutate()}>
            {t('notifications.markAllRead')}
          </Button>
        )}
      </div>
      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : notifications.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-slate-500">{t('notifications.empty')}</CardContent></Card>
      ) : (
        notifications.map((n) => {
          const path = notificationPath(n);
          return (
            <Card
              key={n.id}
              className={!n.is_read ? 'border-brand-200 bg-brand-50/50' : ''}
            >
              <CardContent
                className={`flex items-start gap-3 pt-4 ${path ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (path) openNotification(n);
                }}
                role={path ? 'link' : undefined}
              >
                <UserLink userId={n.actor_id} className="shrink-0 no-underline">
                  <Avatar name={n.actor_snapshot.full_name} src={n.actor_snapshot.avatar_url} className="h-10 w-10" />
                </UserLink>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {n.type === 'friendship_accepted_self' ? (
                      t('notifications.friendshipAcceptedSelfMsg', { name: n.actor_snapshot.full_name })
                    ) : n.type === 'friendship_rejected_self' ? (
                      t('notifications.friendshipRejectedSelfMsg', { name: n.actor_snapshot.full_name })
                    ) : (
                      <>
                        <UserLink userId={n.actor_id} className="font-semibold text-slate-900">
                          {n.actor_snapshot.full_name}
                        </UserLink>{' '}
                        {t(`notifications.${n.type}` as 'notifications.like')}
                      </>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(n.created_at, i18n.language)}</p>
                  {n.type === 'friendship_request' && (
                    <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        className="rounded-full"
                        disabled={acceptFriendMutation.isPending || rejectFriendMutation.isPending}
                        onClick={() => acceptFriendMutation.mutate(n.actor_id)}
                      >
                        {acceptFriendMutation.isPending ? t('common.loading') : t('community.acceptFriend')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        disabled={acceptFriendMutation.isPending || rejectFriendMutation.isPending}
                        onClick={() => rejectFriendMutation.mutate(n.actor_id)}
                      >
                        {t('community.rejectFriend')}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
