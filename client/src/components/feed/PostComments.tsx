import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircleOff, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { UserLink } from '@/components/ui/UserLink';
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

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

  const editMutation = useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      api(`/posts/${postId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setEditingId(null);
      setEditDraft('');
      qc.invalidateQueries({ queryKey: ['comments', postId] });
    },
  });

  const canDelete = (authorId: string) =>
    currentUserId === postAuthorId || currentUserId === authorId;
  const canEdit = (authorId: string) => currentUserId === authorId;

  const startEdit = (c: CommentNode) => {
    setEditingId(c.id);
    setEditDraft(c.content);
    setReplyTo(null);
  };

  const renderComment = (c: CommentNode, depth = 0) => (
    <div key={c.id} className={depth > 0 ? 'ml-6 mt-2 border-l-2 border-slate-100 pl-3' : ''}>
      <div className="flex gap-2">
        <UserLink userId={c.author_id} className="shrink-0 no-underline">
          <Avatar name={c.author_snapshot.full_name} src={c.author_snapshot.avatar_url} className="h-8 w-8" />
        </UserLink>
        <div className="min-w-0 flex-1">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <UserLink userId={c.author_id} className="text-sm font-medium text-slate-900">
              {c.author_snapshot.full_name}
            </UserLink>
            {editingId === c.id ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  className="min-h-[60px] rounded-xl bg-white"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="rounded-full"
                    disabled={!editDraft.trim() || editMutation.isPending}
                    onClick={() => editMutation.mutate({ commentId: c.id, content: editDraft.trim() })}
                  >
                    {t('common.save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => {
                      setEditingId(null);
                      setEditDraft('');
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-700">{c.content}</p>
            )}
          </div>
          {editingId !== c.id && (
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
              {canEdit(c.author_id) && (
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 font-medium hover:text-brand-700"
                  onClick={() => startEdit(c)}
                >
                  <Pencil className="h-3 w-3" />
                  {t('common.edit')}
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
          )}
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
