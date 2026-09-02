import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, ChevronDown, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { COUNTRY_LABELS } from '@/lib/utils';
import { AdBanner } from '@/components/feed/AdBanner';

export function FeedSidebar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['feed-sidebar'],
    queryFn: () => api<{
      trending: Array<{ id: string; content: string; likes_count: number }>;
      users: Array<{ id: string; full_name: string; username: string; avatar_url: string | null; current_country: string; address?: string }>;
      country: string;
    }>('/feed/sidebar'),
  });

  const followMutation = useMutation({
    mutationFn: (userId: string) => api(`/social/follow/${userId}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed-sidebar'] }),
  });

  const countryLabel = COUNTRY_LABELS[data?.country || ''] || data?.country || '';
  const suggestedUsers = data?.users.filter((u) => u.id !== user?.id).slice(0, 5) || [];

  return (
    <aside className="hidden min-w-0 flex-1 space-y-4 xl:block max-w-sm">
      <AdBanner placement="sidebar" />
      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="pt-4">
          <button type="button" className="flex w-full items-center justify-between text-left">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-brand-600" />
              <div>
                <p className="font-semibold">{t('explore.trending')}</p>
                <p className="text-xs text-slate-500">
                  {t('feed.trendingCount', { count: data?.trending.length || 0 })}
                </p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          {data?.trending && data.trending.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              {data.trending.slice(0, 3).map((p) => (
                <li key={p.id} className="text-sm text-slate-600 line-clamp-2">
                  {p.content}
                  <span className="ml-1 text-xs text-slate-400">❤️ {p.likes_count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="pt-4">
          <p className="font-semibold">{t('feed.peopleYouMayKnow')}</p>
          <p className="text-xs text-slate-500">
            {data?.city
              ? t('feed.braziliansIn', { place: data.city })
              : t('feed.braziliansIn', { place: countryLabel })}
          </p>
          <ul className="mt-4 space-y-4">
            {suggestedUsers.map((u) => (
              <li key={u.id} className="flex items-center gap-3">
                <button type="button" onClick={() => navigate(`/user/${u.id}`)} className="shrink-0">
                  <Avatar name={u.full_name} src={u.avatar_url} className="h-10 w-10" />
                </button>
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/user/${u.id}`)}>
                  <p className="truncate text-sm font-medium">{u.full_name}</p>
                  <p className="truncate text-xs text-slate-500">{u.address || countryLabel}</p>
                </div>
                <Button size="sm" className="shrink-0 rounded-full" onClick={() => followMutation.mutate(u.id)}>
                  <UserPlus className="h-3.5 w-3.5" />
                  {t('community.follow')}
                </Button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-4 w-full text-center text-sm font-medium text-brand-700 hover:underline"
            onClick={() => navigate('/community')}
          >
            {t('feed.seeMorePeople')}
          </button>
        </CardContent>
      </Card>
    </aside>
  );
}
