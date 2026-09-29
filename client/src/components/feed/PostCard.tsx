import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, MessageCircleOff, Share2, MoreHorizontal, MapPin, Trash2 } from 'lucide-react';
import { api, assetUrl } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { timeAgo, COUNTRY_LABELS } from '@/lib/utils';
import { FormattedText, findInlineImages, truncateContent } from '@/lib/formatPostText';
import { useAuth } from '@/hooks/useAuth';
import { PostLikesDialog } from '@/components/feed/PostLikesDialog';
import { PostComments } from '@/components/feed/PostComments';

export type Post = {
  id: string;
  content: string;
  type: string;
  images: string[];
  author_id: string;
  business_id: string | null;
  country: string;
  likes_count: number;
  comments_count: number;
  comments_enabled?: boolean;
  author_snapshot: { full_name: string; username: string; avatar_url?: string; city?: string; country?: string; is_premium?: boolean };
  created_at: string;
  liked_by_me?: boolean;
  is_promoted?: boolean;
  author_is_premium?: boolean;
};

const COLLAPSE_LEN = 280;

export function PostCard({ post }: { post: Post }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [showLikes, setShowLikes] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsEnabled, setCommentsEnabled] = useState(post.comments_enabled !== false);

  useEffect(() => {
    setCommentsEnabled(post.comments_enabled !== false);
  }, [post.id, post.comments_enabled]);

  const isLong = post.content.length > COLLAPSE_LEN;
  const displayContent = expanded || !isLong
    ? post.content
    : `${truncateContent(post.content, COLLAPSE_LEN)}...`;

  const inlineUrls = new Set(findInlineImages(post.content).map((img) => img.url));
  const galleryImages = (post.images ?? []).filter((url) => !inlineUrls.has(url));
  const snap = post.author_snapshot;
  const authorPremium = post.author_is_premium ?? snap.is_premium;
  const locationLabel = snap.city
    ? `${snap.city}, ${COUNTRY_LABELS[post.country] || post.country}`
    : COUNTRY_LABELS[post.country] || post.country;
  const isOwner = user?.id === post.author_id;

  const likeMutation = useMutation({
    mutationFn: () =>
      post.liked_by_me
        ? api(`/posts/${post.id}/like`, { method: 'DELETE' })
        : api(`/posts/${post.id}/like`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['post-likes', post.id] });
    },
  });

  const shareMutation = useMutation({
    mutationFn: () => api(`/posts/${post.id}/share`, { method: 'POST' }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/posts/${post.id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  });

  const toggleCommentsMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api(`/posts/${post.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ comments_enabled: enabled }),
      }),
    onSuccess: (_data, enabled) => {
      setCommentsEnabled(enabled);
      setMenuOpen(false);
      qc.invalidateQueries({ queryKey: ['posts'] });
    },
  });

  return (
    <>
      <Card className="border-slate-200/80 shadow-sm overflow-hidden">
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-start gap-3">
            <Avatar name={post.author_snapshot.full_name} src={post.author_snapshot.avatar_url} className="h-11 w-11" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[15px] leading-tight">
                {post.author_snapshot.full_name}
                {!!authorPremium && (
                  <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-800">
                    {t('admin.premium')}
                  </span>
                )}
                {!!post.is_promoted && post.type === 'job' && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                    {t('feed.hiring')}
                  </span>
                )}
                {!!post.is_promoted && post.type !== 'job' && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                    {t('feed.promoted')}
                  </span>
                )}
              </p>
              <p className="text-sm text-slate-500">@{post.author_snapshot.username}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {locationLabel}
                </span>
                <span>·</span>
                <span>{timeAgo(post.created_at, i18n.language)}</span>
              </div>
            </div>
            <div className="relative">
              <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setMenuOpen(!menuOpen)}>
                <MoreHorizontal className="h-5 w-5 text-slate-400" />
              </Button>
              {menuOpen && isOwner && (
                <div className="absolute right-0 top-10 z-10 min-w-[200px] rounded-lg border bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    onClick={() => toggleCommentsMutation.mutate(!commentsEnabled)}
                  >
                    {commentsEnabled ? (
                      <MessageCircleOff className="h-4 w-4" />
                    ) : (
                      <MessageCircle className="h-4 w-4" />
                    )}
                    {commentsEnabled ? t('feed.disableComments') : t('feed.enableComments')}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    onClick={() => { deleteMutation.mutate(); setMenuOpen(false); }}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('common.delete')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="text-[15px] leading-relaxed">
            <FormattedText text={displayContent} />
            {isLong && !expanded && (
              <button type="button" className="ml-1 font-medium text-brand-700 hover:underline" onClick={() => setExpanded(true)}>
                {t('feed.seeMore')}
              </button>
            )}
          </div>

          {galleryImages.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-100">
              {galleryImages.map((img) => (
                <img key={img} src={assetUrl(img) ?? img} alt="" className="max-h-96 w-full object-cover" />
              ))}
            </div>
          )}

          <div className="flex gap-1 border-t border-slate-100 pt-2">
            <div className="inline-flex items-center">
              <Button variant="ghost" size="sm" className="rounded-full rounded-r-none pr-1" onClick={() => likeMutation.mutate()}>
                <Heart className={`h-4 w-4 ${post.liked_by_me ? 'fill-red-500 text-red-500' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full rounded-l-none pl-0 text-slate-600"
                disabled={post.likes_count === 0}
                onClick={() => setShowLikes(true)}
              >
                {post.likes_count}
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setShowComments(!showComments)}>
              <MessageCircle className="h-4 w-4" />
              <span className="text-slate-600">{post.comments_count}</span>
            </Button>
            <Button variant="ghost" size="sm" className="rounded-full" onClick={() => shareMutation.mutate()}>
              <Share2 className="h-4 w-4" />
            </Button>
          </div>

          {showComments && (
            <PostComments
              postId={post.id}
              postAuthorId={post.author_id}
              commentsEnabled={commentsEnabled}
              currentUserId={user?.id}
            />
          )}
        </CardContent>
      </Card>

      {showLikes && <PostLikesDialog postId={post.id} onClose={() => setShowLikes(false)} />}
    </>
  );
}
