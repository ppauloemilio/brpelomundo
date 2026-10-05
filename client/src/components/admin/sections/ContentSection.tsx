import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { AdminSearchBar, StatusBadge } from '../AdminUi';
import { cn } from '@/lib/utils';

type Kind = 'classifieds' | 'events' | 'groups';

type Row = {
  id: string;
  title?: string;
  name?: string;
  city?: string;
  country?: string;
  is_active: number;
  status?: string;
  seller_name?: string;
  seller_email?: string;
  organizer_name?: string;
  owner_name?: string;
  event_date?: string;
  members_count?: number;
};

const confirmKey: Record<Kind, string> = {
  classifieds: 'admin.deleteClassifiedConfirm',
  events: 'admin.deleteEventConfirm',
  groups: 'admin.deleteGroupConfirm',
};

export function ContentSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>('classifieds');
  const [q, setQ] = useState('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['admin-content', kind, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      const qs = params.toString();
      return api<Row[]>(`/admin/${kind}${qs ? `?${qs}` : ''}`);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/${kind}/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-content'] }),
  });

  const tabs: { id: Kind; label: string }[] = [
    { id: 'classifieds', label: t('admin.contentClassifieds') },
    { id: 'events', label: t('admin.contentEvents') },
    { id: 'groups', label: t('admin.contentGroups') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setKind(tab.id); setQ(''); }}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium',
              kind === tab.id ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <AdminSearchBar value={q} onChange={setQ} placeholder={t('admin.searchContent')} />
      {isLoading ? (
        <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-slate-500">{t('admin.noResults')}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const title = row.title || row.name || row.id;
            const who = row.seller_name || row.organizer_name || row.owner_name || '';
            return (
              <Card key={row.id}>
                <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{title}</p>
                      <StatusBadge
                        active={!!row.is_active && row.status !== 'inactive'}
                        activeLabel={t('admin.active')}
                        inactiveLabel={t('admin.inactive')}
                      />
                    </div>
                    <p className="text-sm text-slate-500">
                      {[row.city, row.country].filter(Boolean).join(', ')}
                      {who ? ` · ${who}` : ''}
                      {row.seller_email ? ` · ${row.seller_email}` : ''}
                      {row.event_date ? ` · ${row.event_date}` : ''}
                      {row.members_count != null ? ` · ${row.members_count}` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={remove.isPending || !row.is_active}
                    onClick={() => {
                      if (window.confirm(t(confirmKey[kind], { name: title }))) remove.mutate(row.id);
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
