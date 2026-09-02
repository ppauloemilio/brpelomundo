import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { AdminFilterSelect, AdminSearchBar, StatusBadge } from '../AdminUi';

type AdminUser = {
  id: string;
  email: string;
  username: string;
  full_name: string;
  is_admin: number;
  is_active: number;
  is_premium: number;
  is_verified: number;
  email_verified: number;
  posts_count: number;
  businesses_count: number;
  current_country?: string;
  created_at: string;
};

export function UsersSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, refreshUser } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users-manage', q, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      const qs = params.toString();
      return api<AdminUser[]>(`/admin/users${qs ? `?${qs}` : ''}`);
    },
  });

  const patchUser = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, boolean> }) =>
      api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin-users-manage'] });
      qc.invalidateQueries({ queryKey: ['profile', id] });
      if (id === user?.id) {
        refreshUser();
        qc.invalidateQueries({ queryKey: ['explore'] });
      }
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1"><AdminSearchBar value={q} onChange={setQ} placeholder={t('admin.searchUser')} /></div>
        <AdminFilterSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: t('admin.filterAll') },
            { value: 'active', label: t('admin.filterActive') },
            { value: 'inactive', label: t('admin.filterInactive') },
            { value: 'admin', label: t('admin.filterAdmins') },
          ]}
        />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>
      ) : users.length === 0 ? (
        <p className="py-8 text-center text-slate-500">{t('admin.noResults')}</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id}>
              <CardContent className="pt-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{u.full_name}</p>
                      {!!u.is_admin && (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">Admin</span>
                      )}
                      {!!u.is_premium && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Premium</span>
                      )}
                      {!!u.is_verified && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">{t('trust.verified')}</span>
                      )}
                      <StatusBadge active={!!u.is_active} activeLabel={t('admin.active')} inactiveLabel={t('admin.inactive')} />
                    </div>
                    <p className="text-sm text-slate-500">@{u.username} · {u.email}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {u.posts_count} {t('admin.postsCount')} · {u.businesses_count} {t('admin.businessesCount')}
                      {u.current_country ? ` · ${u.current_country}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigate(`/user/${u.id}`)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('admin.viewProfile')}
                    </Button>
                    <Button
                      size="sm"
                      variant={u.is_admin ? 'default' : 'outline'}
                      onClick={() => patchUser.mutate({ id: u.id, body: { is_admin: !u.is_admin } })}
                    >
                      {u.is_admin ? t('admin.revokeAdmin') : t('admin.makeAdmin')}
                    </Button>
                    <Button
                      size="sm"
                      variant={u.is_premium ? 'default' : 'outline'}
                      onClick={() => patchUser.mutate({ id: u.id, body: { is_premium: !u.is_premium } })}
                    >
                      {u.is_premium ? t('admin.revokePremium') : t('admin.grantPremium')}
                    </Button>
                    <Button
                      size="sm"
                      variant={u.is_verified ? 'default' : 'outline'}
                      onClick={() => patchUser.mutate({ id: u.id, body: { is_verified: !u.is_verified } })}
                    >
                      {u.is_verified ? t('admin.revokeVerified') : t('admin.grantVerified')}
                    </Button>
                    <Button
                      size="sm"
                      variant={u.is_active ? 'outline' : 'destructive'}
                      onClick={() => patchUser.mutate({ id: u.id, body: { is_active: !u.is_active } })}
                    >
                      {u.is_active ? t('admin.deactivate') : t('admin.activate')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
