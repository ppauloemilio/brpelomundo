import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { AdminFilterSelect, AdminSearchBar, StatusBadge } from '../AdminUi';

type AdminPost = {
  id: string;
  content: string;
  type: string;
  full_name: string;
  username: string;
  is_active: number;
  is_promoted: number;
  likes_count: number;
  comments_count: number;
  created_at: string;
};

export function PostsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['admin-posts-manage', q, type, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      const qs = params.toString();
      return api<AdminPost[]>(`/admin/posts${qs ? `?${qs}` : ''}`);
    },
  });

  const patchPost = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, boolean> }) =>
      api(`/admin/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-posts-manage'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminSearchBar value={q} onChange={setQ} placeholder={t('admin.searchPost')} />
        <AdminFilterSelect
          value={type}
          onChange={setType}
          options={[
            { value: '', label: t('admin.filterAllTypes') },
            { value: 'text', label: t('admin.typeText') },
            { value: 'image', label: t('admin.typeImage') },
            { value: 'job', label: t('admin.typeJob') },
            { value: 'event', label: t('admin.typeEvent') },
          ]}
        />
        <AdminFilterSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: t('admin.filterAll') },
            { value: 'active', label: t('admin.filterActive') },
            { value: 'inactive', label: t('admin.filterInactive') },
          ]}
        />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>
      ) : posts.length === 0 ? (
        <p className="py-8 text-center text-slate-500">{t('admin.noResults')}</p>
      ) : (
        <div className="space-y-3">
          {posts.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-700">{p.type}</span>
                    <StatusBadge active={!!p.is_active} activeLabel={t('admin.active')} inactiveLabel={t('admin.inactive')} />
                    {!!p.is_promoted && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{t('admin.promoted')}</span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm text-slate-800">{p.content}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {p.full_name} (@{p.username}) · {p.likes_count} {t('admin.likes')} · {p.comments_count} {t('admin.comments')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={p.is_promoted ? 'default' : 'outline'}
                    onClick={() => patchPost.mutate({ id: p.id, body: { is_promoted: !p.is_promoted } })}
                  >
                    {p.is_promoted ? t('admin.unpromote') : t('admin.promote')}
                  </Button>
                  <Button
                    size="sm"
                    variant={p.is_active ? 'outline' : 'default'}
                    onClick={() => patchPost.mutate({ id: p.id, body: { is_active: !p.is_active } })}
                  >
                    {p.is_active ? t('admin.deactivate') : t('admin.activate')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
