import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

type Review = {
  id: string;
  rating: number;
  comment: string;
  owner_reply?: string;
  author_name: string;
  author_username: string;
  author_avatar?: string | null;
  author_verified?: number;
  author_id: string;
  created_at: string;
};

type ReviewsPayload = {
  avg_rating: number;
  count: number;
  reviews: Review[];
};

type Props = {
  targetType: 'business' | 'user' | 'classified';
  targetId: string;
  ownerId?: string;
  compact?: boolean;
};

function Stars({ value, onChange, size = 'md' }: {
  value: number;
  onChange?: (n: number) => void;
  size?: 'sm' | 'md';
}) {
  const cls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={cn(!onChange && 'cursor-default')}
          aria-label={`${n}`}
        >
          <Star
            className={cn(cls, n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300')}
          />
        </button>
      ))}
    </span>
  );
}

export function ReviewsSection({ targetType, targetId, ownerId, compact }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', targetType, targetId],
    queryFn: () =>
      api<ReviewsPayload>(`/reviews?target_type=${targetType}&target_id=${targetId}`),
  });

  const submit = useMutation({
    mutationFn: () =>
      api('/reviews', {
        method: 'POST',
        body: JSON.stringify({ target_type: targetType, target_id: targetId, rating, comment }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', targetType, targetId] });
      setComment('');
    },
  });

  const reply = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api(`/reviews/${id}/reply`, { method: 'POST', body: JSON.stringify({ reply: text }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', targetType, targetId] });
      setReplyFor(null);
      setReplyText('');
    },
  });

  const isOwner = !!user && !!ownerId && user.id === ownerId;
  const canReview = !!user && (!ownerId || user.id !== ownerId);

  return (
    <section className={cn('space-y-4', compact && 'space-y-3')}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{t('reviews.title')}</h3>
        {(data?.count ?? 0) > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-slate-600">
            <Stars value={Math.round(data?.avg_rating || 0)} size="sm" />
            <span className="font-medium">{data?.avg_rating?.toFixed(1)}</span>
            <span className="text-slate-400">({data?.count})</span>
          </span>
        )}
      </div>

      {canReview && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600">{t('reviews.leaveReview')}</p>
          <Stars value={rating} onChange={setRating} />
          <Textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('reviews.commentPlaceholder')}
          />
          <Button size="sm" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {t('reviews.submit')}
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : (data?.reviews.length ?? 0) === 0 ? (
        <p className="text-sm text-slate-500">{t('reviews.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {data!.reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-start gap-2">
                <Avatar name={r.author_name} src={r.author_avatar} className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{r.author_name}</span>
                    <Stars value={r.rating} size="sm" />
                  </div>
                  {r.comment && <p className="mt-1 text-sm text-slate-600">{r.comment}</p>}
                  {r.owner_reply && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                      <span className="font-semibold">{t('reviews.ownerReply')}: </span>
                      {r.owner_reply}
                    </p>
                  )}
                  {isOwner && !r.owner_reply && (
                    replyFor === r.id ? (
                      <div className="mt-2 space-y-2">
                        <Textarea rows={2} value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => reply.mutate({ id: r.id, text: replyText })}>
                            {t('reviews.sendReply')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setReplyFor(null)}>
                            {t('common.cancel')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-brand-700 hover:underline"
                        onClick={() => setReplyFor(r.id)}
                      >
                        {t('reviews.reply')}
                      </button>
                    )
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type ReportProps = {
  targetType: string;
  targetId: string;
  className?: string;
};

export function ReportButton({ targetType, targetId, className }: ReportProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);

  const report = useMutation({
    mutationFn: () =>
      api('/moderation/reports', {
        method: 'POST',
        body: JSON.stringify({ target_type: targetType, target_id: targetId, reason, details }),
      }),
    onSuccess: () => {
      setDone(true);
      setOpen(false);
    },
  });

  if (done) {
    return <span className="text-xs text-slate-500">{t('moderation.reportSent')}</span>;
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600"
      >
        <Flag className="h-3.5 w-3.5" />
        {t('moderation.report')}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-slate-800">{t('moderation.reportReason')}</p>
          <select
            className="mb-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {['spam', 'scam', 'offensive', 'fake_profile', 'fraud', 'other'].map((r) => (
              <option key={r} value={r}>{t(`moderation.reason.${r}`)}</option>
            ))}
          </select>
          <Textarea
            rows={2}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={t('moderation.detailsOptional')}
            className="mb-2"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={report.isPending} onClick={() => report.mutate()}>
              {t('moderation.submitReport')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
