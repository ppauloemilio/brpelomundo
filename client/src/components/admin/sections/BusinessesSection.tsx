import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { AdminFilterSelect, AdminSearchBar, StatusBadge } from '../AdminUi';

type AdminBusiness = {
  id: string;
  name: string;
  category: string;
  country: string;
  address: string;
  owner_name: string;
  owner_email: string;
  is_active: number;
  is_featured: number;
  is_verified: number;
};

export function BusinessesSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ['admin-businesses-manage', q, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      const qs = params.toString();
      return api<AdminBusiness[]>(`/admin/businesses${qs ? `?${qs}` : ''}`);
    },
  });

  const patchBusiness = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, boolean> }) =>
      api(`/admin/businesses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-businesses-manage'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1"><AdminSearchBar value={q} onChange={setQ} placeholder={t('admin.searchBusiness')} /></div>
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
      ) : businesses.length === 0 ? (
        <p className="py-8 text-center text-slate-500">{t('admin.noResults')}</p>
      ) : (
        <div className="space-y-3">
          {businesses.map((b) => (
            <Card key={b.id}>
              <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{b.name}</p>
                    <StatusBadge active={!!b.is_active} activeLabel={t('admin.active')} inactiveLabel={t('admin.inactive')} />
                    {!!b.is_featured && (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">{t('admin.featured')}</span>
                    )}
                    {!!b.is_verified && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">{t('trust.verified')}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{b.category} · {b.country}</p>
                  <p className="text-sm text-slate-500">{b.address}</p>
                  <p className="mt-1 text-xs text-slate-400">{b.owner_name} · {b.owner_email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={b.is_featured ? 'default' : 'outline'}
                    onClick={() => patchBusiness.mutate({ id: b.id, body: { is_featured: !b.is_featured } })}
                  >
                    {b.is_featured ? t('admin.unfeature') : t('admin.feature')}
                  </Button>
                  <Button
                    size="sm"
                    variant={b.is_verified ? 'default' : 'outline'}
                    onClick={() => patchBusiness.mutate({ id: b.id, body: { is_verified: !b.is_verified } })}
                  >
                    {b.is_verified ? t('admin.revokeVerified') : t('admin.grantVerified')}
                  </Button>
                  <Button
                    size="sm"
                    variant={b.is_active ? 'outline' : 'default'}
                    onClick={() => patchBusiness.mutate({ id: b.id, body: { is_active: !b.is_active } })}
                  >
                    {b.is_active ? t('admin.deactivate') : t('admin.activate')}
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
