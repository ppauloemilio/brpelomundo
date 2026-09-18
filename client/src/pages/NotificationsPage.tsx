import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { formatDate } from '@/lib/utils';

type Notification = {
  id: string;
  type: string;
  actor_id: string;
  actor_snapshot: { full_name: string; avatar_url?: string };
  created_at: string;
  is_read: boolean;
};

export function NotificationsPage() {
  const { t, i18n } = useTranslation();
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
      qc.invalidateQueries({ queryKey: ['friends'] });
    },
  });

  const rejectFriendMutation = useMutation({
    mutationFn: (userId: string) => api(`/social/friendships/reject/${userId}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

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
        notifications.map((n) => (
          <Card
            key={n.id}
            className={!n.is_read ? 'border-brand-200 bg-brand-50/50' : ''}
          >
            <CardContent className="flex items-start gap-3 pt-4">
              <Avatar name={n.actor_snapshot.full_name} src={n.actor_snapshot.avatar_url} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold">{n.actor_snapshot.full_name}</span>{' '}
                  {t(`notifications.${n.type}` as 'notifications.like')}
                </p>
                <p className="text-xs text-slate-400">{formatDate(n.created_at, i18n.language)}</p>
                {n.type === 'friendship_request' && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        acceptFriendMutation.mutate(n.actor_id);
                        if (!n.is_read) markReadMutation.mutate(n.id);
                      }}
                    >
                      {t('community.acceptFriend')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        rejectFriendMutation.mutate(n.actor_id);
                        if (!n.is_read) markReadMutation.mutate(n.id);
                      }}
                    >
                      {t('community.rejectFriend')}
                    </Button>
                  </div>
                )}
              </div>
              {!n.is_read && n.type !== 'friendship_request' && (
                <button
                  type="button"
                  className="text-xs text-brand-700"
                  onClick={() => markReadMutation.mutate(n.id)}
                >
                  {t('notifications.markAllRead')}
                </button>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
