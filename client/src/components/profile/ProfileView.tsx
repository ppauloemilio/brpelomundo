import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Briefcase, Calendar, LayoutGrid, Building2, Pencil, Settings, UserPlus, MessageCircle, Ban, Users, UserCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { PostCard, Post } from '@/components/feed/PostCard';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ReportButton, ReviewsSection } from '@/components/trust/ReviewsSection';
import { COUNTRY_LABELS, cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

export type ProfileData = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  cover_url?: string;
  bio: string;
  current_country: string;
  current_city?: string;
  current_state?: string;
  origin_city?: string;
  origin_state?: string;
  primary_skill?: string;
  created_at?: string;
  followers_count: number;
  following_count: number;
  friends_count?: number;
  posts_count?: number;
  skills?: Array<{ id: string; skill_name: string; proficiency_level: string; years_experience: number }>;
  is_following?: boolean;
  friendship_status?: 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'self';
  friendship_id?: string;
  is_premium?: boolean;
  is_verified?: boolean;
  email_verified?: boolean;
  rating_avg?: number;
  rating_count?: number;
  profile_views_30d?: number;
};

type Tab = 'posts' | 'skills' | 'businesses' | 'friends';

function formatJoinDate(date: string, locale: string) {
  return new Date(date).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

type ProfileViewProps = {
  userId: string;
  isOwner?: boolean;
  onEdit?: () => void;
  showFollow?: boolean;
  defaultTab?: Tab;
};

export function ProfileView({
  userId,
  isOwner,
  onEdit,
  showFollow,
  defaultTab = 'posts',
}: ProfileViewProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [blocked, setBlocked] = useState(false);

  const { data: user, isLoading } = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => api<ProfileData>(`/users/${userId}`),
  });

  const followMutation = useMutation({
    mutationFn: () =>
      user?.is_following
        ? api(`/social/follow/${userId}`, { method: 'DELETE' })
        : api(`/social/follow/${userId}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', userId] }),
  });

  const friendMutation = useMutation({
    mutationFn: () => {
      const status = user?.friendship_status;
      if (status === 'friends' || status === 'pending_sent') {
        return api(`/social/friendships/user/${userId}`, { method: 'DELETE' });
      }
      if (status === 'pending_received') {
        return api(`/social/friendships/accept/${userId}`, { method: 'POST' });
      }
      return api('/social/friendships', { method: 'POST', body: JSON.stringify({ receiver_id: userId }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile', userId] });
      qc.invalidateQueries({ queryKey: ['friends'] });
      qc.invalidateQueries({ queryKey: ['user-friends', userId] });
    },
  });

  const rejectFriendMutation = useMutation({
    mutationFn: () => api(`/social/friendships/reject/${userId}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', userId] }),
  });

  const messageMutation = useMutation({
    mutationFn: () => api<{ id: string }>('/conversations', { method: 'POST', body: JSON.stringify({ participant_ids: [userId], type: 'user_user' }) }),
    onSuccess: (conv: { id: string }) => navigate(`/messages?conversation=${conv.id}`),
  });

  const blockMutation = useMutation({
    mutationFn: () =>
      blocked
        ? api(`/moderation/blocks/${userId}`, { method: 'DELETE' })
        : api('/moderation/blocks', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
    onSuccess: () => setBlocked((v) => !v),
  });

  useQuery({
    queryKey: ['block-check', userId],
    enabled: !!showFollow && !!me && me.id !== userId,
    queryFn: async () => {
      const res = await api<{ blocked: boolean }>(`/moderation/blocks/check/${userId}`);
      setBlocked(res.blocked);
      return res;
    },
  });

  const { data: posts = [], isLoading: loadingPosts } = useQuery({
    queryKey: ['user-posts', userId],
    queryFn: () => api<Post[]>(`/users/${userId}/posts`),
  });

  const { data: businesses = [] } = useQuery({
    queryKey: ['user-businesses', userId],
    queryFn: () => api<Array<{ id: string; name: string; category: string; address: string }>>(`/users/${userId}/businesses`),
    enabled: tab === 'businesses',
  });

  const { data: userFriends = [] } = useQuery({
    queryKey: ['user-friends', userId],
    queryFn: () =>
      api<Array<{ friend_id: string; full_name: string; username: string; avatar_url: string | null }>>(
        `/social/friendships/user/${userId}`
      ),
    enabled: tab === 'friends',
  });

  if (isLoading || !user) return <p className="py-12 text-center text-slate-500">{t('common.loading')}</p>;

  const locationLabel = user.current_city
    ? `${user.current_city}, ${COUNTRY_LABELS[user.current_country] || user.current_country}`
    : COUNTRY_LABELS[user.current_country] || user.current_country;
  const originLabel = user.origin_city
    ? `${user.origin_city}${user.origin_state ? `, ${user.origin_state}` : ''}`
    : '';
  const primarySkill = user.primary_skill || user.skills?.[0]?.skill_name;
  const postsCount = user.posts_count ?? posts.length;

  const tabs: { key: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { key: 'posts', label: t('profile.tabPosts'), icon: LayoutGrid },
    { key: 'friends', label: t('community.friends'), icon: Users },
    { key: 'skills', label: t('profile.tabSkills'), icon: Briefcase },
    { key: 'businesses', label: t('profile.tabBusinesses'), icon: Building2 },
  ];

  const friendButtonLabel = () => {
    switch (user?.friendship_status) {
      case 'friends': return t('community.friends');
      case 'pending_sent': return t('community.friendPending');
      case 'pending_received': return t('community.acceptFriend');
      default: return t('community.friendRequest');
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <ProfileHeader
        coverUrl={user.cover_url}
        avatarUrl={user.avatar_url}
        name={user.full_name}
        username={user.username}
        isPremium={user.is_premium}
        isVerified={user.is_verified}
        emailVerified={user.email_verified}
        stats={(
          <div className="flex gap-6 text-center sm:pb-2">
            <div>
              <p className="text-lg font-bold">{postsCount}</p>
              <p className="text-xs text-slate-500">{t('profile.posts')}</p>
            </div>
            <div>
              <p className="text-lg font-bold">{user.friends_count ?? 0}</p>
              <p className="text-xs text-slate-500">{t('community.friends')}</p>
            </div>
            <div>
              <p className="text-lg font-bold">{user.followers_count}</p>
              <p className="text-xs text-slate-500">{t('profile.followers')}</p>
            </div>
            <div>
              <p className="text-lg font-bold">{user.following_count}</p>
              <p className="text-xs text-slate-500">{t('profile.following')}</p>
            </div>
          </div>
        )}
        tabs={(
          <div className="flex border-t border-slate-200">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors',
                  tab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        )}
      >
        {isOwner && user.is_premium && (
          <div className="mt-4 space-y-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
            <p>{t('profile.premiumOwnerHint')}</p>
            {typeof user.profile_views_30d === 'number' && (
              <p className="text-xs text-brand-700">
                {t('profile.profileViews30d', { count: user.profile_views_30d })}
              </p>
            )}
          </div>
        )}
        {user.bio && (
          <div className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-slate-700">
            {user.bio}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-slate-400" />
              {locationLabel}
            </span>
            {originLabel && (
              <span className="inline-flex items-center gap-1.5">
                <span>🇧🇷</span>
                {t('profile.from')} {originLabel}
              </span>
            )}
            {primarySkill && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-brand-800">
                <Briefcase className="h-3.5 w-3.5" />
                {primarySkill}
              </span>
            )}
            {user.created_at && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-slate-400" />
                {t('profile.joined')} {formatJoinDate(user.created_at, i18n.language)}
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {isOwner && (
              <>
                <Button variant="outline" size="sm" className="rounded-full" onClick={onEdit}>
                  <Pencil className="h-4 w-4" />
                  {t('profile.edit')}
                </Button>
                <Button variant="ghost" size="sm" className="rounded-full" onClick={() => navigate('/settings')}>
                  <Settings className="h-4 w-4" />
                  {t('nav.settings')}
                </Button>
              </>
            )}
            {showFollow && (
              <>
                <Button
                  size="sm"
                  className="rounded-full"
                  variant={user.friendship_status === 'friends' ? 'outline' : 'default'}
                  onClick={() => friendMutation.mutate()}
                  disabled={friendMutation.isPending}
                >
                  {user.friendship_status === 'friends' ? (
                    <UserCheck className="h-4 w-4" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {friendButtonLabel()}
                </Button>
                {user.friendship_status === 'pending_received' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-slate-600"
                    onClick={() => rejectFriendMutation.mutate()}
                  >
                    {t('community.rejectFriend')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => followMutation.mutate()}
                >
                  <UserPlus className="h-4 w-4" />
                  {user.is_following ? t('community.following') : t('community.follow')}
                </Button>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => messageMutation.mutate()}>
                  <MessageCircle className="h-4 w-4" />
                  {t('messages.start')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-slate-600"
                  onClick={() => blockMutation.mutate()}
                >
                  <Ban className="h-4 w-4" />
                  {blocked ? t('moderation.unblock') : t('moderation.block')}
                </Button>
                <ReportButton targetType="user" targetId={userId} />
              </>
            )}
          </div>
      </ProfileHeader>

      <div className="mt-4">
        <Card>
          <CardContent className="pt-5">
            <ReviewsSection targetType="user" targetId={userId} ownerId={userId} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 space-y-4">
        {tab === 'posts' && (
          loadingPosts ? (
            <Card><CardContent className="py-10 text-center text-slate-500">{t('common.loading')}</CardContent></Card>
          ) : posts.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-slate-500">{t('feed.empty')}</CardContent></Card>
          ) : (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          )
        )}
        {tab === 'friends' && (
          <Card>
            <CardContent className="divide-y pt-2">
              {userFriends.length === 0 ? (
                <p className="py-8 text-center text-slate-500">{t('community.noFriends')}</p>
              ) : (
                userFriends.map((f) => (
                  <button
                    key={f.friend_id}
                    type="button"
                    className="flex w-full items-center gap-3 py-3 text-left hover:bg-slate-50"
                    onClick={() => navigate(`/user/${f.friend_id}`)}
                  >
                    <Avatar name={f.full_name} src={f.avatar_url} className="h-10 w-10" />
                    <div>
                      <p className="font-medium text-slate-900">{f.full_name}</p>
                      <p className="text-sm text-slate-500">@{f.username}</p>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        )}
        {tab === 'skills' && (
          <Card>
            <CardContent className="divide-y pt-2">
              {(user.skills?.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-slate-500">{t('profile.noSkills')}</p>
              ) : (
                user.skills!.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{s.skill_name}</p>
                      <p className="text-sm text-slate-500">{s.proficiency_level} · {s.years_experience} {t('profile.years')}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}
        {tab === 'businesses' && (
          businesses.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-slate-500">
                {t('business.noBusinesses')}
                {isOwner && (
                  <Button className="mt-4 rounded-full" onClick={() => navigate('/create-business')}>
                    {t('business.create')}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            businesses.map((b) => (
              <Card key={b.id} className="cursor-pointer hover:border-brand-200" onClick={() => isOwner && navigate(`/edit-business/${b.id}`)}>
                <CardContent className="pt-4">
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-sm text-slate-500">{b.category} · {b.address}</p>
                </CardContent>
              </Card>
            ))
          )
        )}
      </div>
    </div>
  );
}
