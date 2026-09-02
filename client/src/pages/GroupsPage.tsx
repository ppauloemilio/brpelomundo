import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { COUNTRY_LABELS, cn } from '@/lib/utils';

type Group = {
  id: string;
  name: string;
  description: string;
  country: string;
  city: string;
  members_count: number;
  is_member: boolean;
};

export function GroupsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const country = user?.profile?.current_country || '';
  const city = user?.profile?.current_city || '';
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', city: city || '', country: country || 'US' });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (country && country.toUpperCase() !== 'BR') params.set('country', country);
    return params.toString();
  }, [country]);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups', query],
    queryFn: () => api<Group[]>(`/groups${query ? `?${query}` : ''}`),
  });

  const createGroup = useMutation({
    mutationFn: () => api('/groups', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: (g: Group) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      setShowCreate(false);
      navigate(`/groups/${g.id}`);
    },
  });

  const join = useMutation({
    mutationFn: (id: string) => api(`/groups/${id}/join`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('groups.title')}</h1>
          <p className="mt-1 text-slate-500">
            {t('groups.subtitle', { place: city || COUNTRY_LABELS[country] || t('home.yourArea') })}
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus className="h-4 w-4" />
          {t('groups.create')}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <Input
              placeholder={t('groups.name')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder={t('groups.description')}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                placeholder={t('groups.city')}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
              <select
                className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              >
                {Object.entries(COUNTRY_LABELS).filter(([c]) => c !== 'BR').map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
              <Button
                disabled={!form.name.trim() || !form.city.trim() || createGroup.isPending}
                onClick={() => createGroup.mutate()}
              >
                {t('common.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-slate-500">{t('common.loading')}</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <p>{t('groups.empty')}</p>
            <p className="mt-2 text-sm text-slate-400">{t('groups.emptyHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <article key={g.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => navigate(`/groups/${g.id}`)}>
                  <p className="font-semibold text-slate-900 hover:underline">{g.name}</p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                    <MapPin className="h-3.5 w-3.5" />
                    {g.city}, {COUNTRY_LABELS[g.country] || g.country}
                  </p>
                  {g.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">{g.description}</p>
                  )}
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                    <Users className="h-3.5 w-3.5" />
                    {t('groups.membersCount', { count: g.members_count })}
                  </p>
                </button>
                <Button
                  size="sm"
                  variant={g.is_member ? 'outline' : 'default'}
                  className={cn('shrink-0 rounded-full')}
                  onClick={() => (g.is_member ? navigate(`/groups/${g.id}`) : join.mutate(g.id))}
                >
                  {g.is_member ? t('groups.open') : t('groups.join')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
