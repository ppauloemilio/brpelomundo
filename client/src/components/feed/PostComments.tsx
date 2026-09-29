import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircleOff, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { timeAgo } from '@/lib/utils';

export type PostComment = {
  id: string;
  author_id: string;
  parent_id: string | null;
  content: string;
  author_snapshot: { full_name: string; username?: string; avatar_url?: string | null };
  created_at: string;
};

type CommentNode = PostComment & { replies: CommentNode[] };

function buildCommentTree(comments: PostComment[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const c of comments) {
    nodes.set(c.id, { ...c, replies: [] });
  }
  const roots: CommentNode[] = [];
  for (const c of comments) {
    const node = nodes.get(c.id)!;
    if (c.parent_id && nodes.has(c.parent_id)) {
      nodes.get(c.parent_id)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

type Props = {
  postId: string;
  postAuthorId: string;
  commentsEnabled: boolean;
  currentUserId?: string;
};

export function PostComments({ postId, postAuthorId, commentsEnabled, currentUserId }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);

  const { data: comments = [] } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => api<PostComment[]>(`/posts/${postId}/comments`),
  });

  const tree = useMemo(() => buildCommentTree(comments), [comments]);

  const commentMutation = useMutation({
    mutationFn: () =>
      api(`/posts/${postId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: comment,
          ...(replyTo ? { parent_id: replyTo.id } : {}),
        }),
      }),
    onSuccess: () => {
      setComment('');
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ['comments', postId] });
      qc.invalidateQueries({ queryKey: ['posts'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) =>
      api(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', postId] });
      qc.invalidateQueries({ queryKey: ['posts'] });
    },
  });

  const canDelete = (authorId: string) =>
    currentUserId === postAuthorId || currentUserId === authorId;

  const renderComment = (c: CommentNode, depth = 0) => (
    <div key={c.id} className={depth > 0 ? 'ml-6 mt-2 border-l-2 border-slate-100 pl-3' : ''}>
      <div className="flex gap-2">
        <Avatar name={c.author_snapshot.full_name} src={c.author_snapshot.avatar_url} className="h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-sm font-medium text-slate-900">{c.author_snapshot.full_name}</p>
            <p className="text-sm text-slate-700">{c.content}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{timeAgo(c.created_at, i18n.language)}</span>
            {commentsEnabled && (
              <button
                type="button"
                className="font-medium hover:text-brand-700"
                onClick={() => setReplyTo({ id: c.id, name: c.author_snapshot.full_name })}
              >
                {t('feed.reply')}
              </button>
            )}
            {canDelete(c.author_id) && (
              <button
                type="button"
                className="inline-flex items-center gap-0.5 font-medium text-red-600 hover:text-red-700"
                onClick={() => deleteMutation.mutate(c.id)}
              >
                <Trash2 className="h-3 w-3" />
                {t('common.delete')}
              </button>
            )}
          </div>
        </div>
      </div>
      {c.replies.map((r) => renderComment(r, depth + 1))}
    </div>
  );

  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      {comments.length === 0 && !commentsEnabled && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <MessageCircleOff className="h-4 w-4" />
          {t('feed.commentsDisabled')}
        </p>
      )}

      {tree.map((c) => renderComment(c))}

      {commentsEnabled ? (
        <div className="space-y-2">
          {replyTo && (
            <p className="text-xs text-slate-500">
              {t('feed.replyingTo', { name: replyTo.name })}{' '}
              <button type="button" className="font-medium text-brand-700" onClick={() => setReplyTo(null)}>
                {t('common.cancel')}
              </button>
            </p>
          )}
          <div className="flex gap-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={replyTo ? t('feed.writeReply') : t('feed.writeComment')}
              className="min-h-[60px] rounded-xl"
            />
            <Button
              className="shrink-0 rounded-full"
              onClick={() => commentMutation.mutate()}
              disabled={!comment.trim() || commentMutation.isPending}
            >
              {replyTo ? t('feed.reply') : t('feed.comment')}
            </Button>
          </div>
        </div>
      ) : (
        comments.length > 0 && (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <MessageCircleOff className="h-3.5 w-3.5" />
            {t('feed.commentsClosed')}
          </p>
        )
      )}
    </div>
  );
}
