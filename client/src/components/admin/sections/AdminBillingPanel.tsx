import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';

type AdminPlan = {
  id: string;
  code: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  duration_days: number;
  is_active: number;
  promo_price_cents?: number | null;
  promo_label?: string | null;
  promo_until?: string | null;
};

type Promo = {
  id: string;
  code: string;
  label: string;
  plan_id: string | null;
  plan_code?: string;
  plan_name?: string;
  discount_percent: number;
  discount_cents: number;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: number;
};

function dollarsToCents(value: string) {
  const n = Number(String(value).replace(',', '.'));
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function centsToDollars(cents: number | null | undefined) {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

export function AdminBillingPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [grant, setGrant] = useState({ email: '', plan_code: 'premium_monthly', duration_days: '30', note: '' });
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const [promoForm, setPromoForm] = useState({
    code: '',
    label: '',
    plan_id: '',
    discount_percent: '20',
    discount_cents: '',
    ends_at: '',
    max_uses: '',
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['admin-billing-plans'],
    queryFn: () => api<AdminPlan[]>('/admin/billing/plans'),
  });

  const { data: promotions = [] } = useQuery({
    queryKey: ['admin-billing-promos'],
    queryFn: () => api<Promo[]>('/admin/billing/promotions'),
  });

  const patchPlan = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api(`/admin/billing/plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-billing-plans'] });
      qc.invalidateQueries({ queryKey: ['billing-plans'] });
    },
  });

  const createPromo = useMutation({
    mutationFn: () =>
      api('/admin/billing/promotions', {
        method: 'POST',
        body: JSON.stringify({
          code: promoForm.code,
          label: promoForm.label,
          plan_id: promoForm.plan_id || null,
          discount_percent: Number(promoForm.discount_percent) || 0,
          discount_cents: promoForm.discount_cents ? dollarsToCents(promoForm.discount_cents) : 0,
          ends_at: promoForm.ends_at ? new Date(promoForm.ends_at).toISOString() : null,
          max_uses: promoForm.max_uses ? Number(promoForm.max_uses) : null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-billing-promos'] });
      setPromoForm({
        code: '', label: '', plan_id: '', discount_percent: '20', discount_cents: '', ends_at: '', max_uses: '',
      });
    },
  });

  const togglePromo = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api(`/admin/billing/promotions/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-billing-promos'] }),
  });

  const removePromo = useMutation({
    mutationFn: (id: string) => api(`/admin/billing/promotions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-billing-promos'] }),
  });

  const grantComp = useMutation({
    mutationFn: () =>
      api('/admin/billing/grant', {
        method: 'POST',
        body: JSON.stringify({
          email: grant.email,
          plan_code: grant.plan_code,
          duration_days: Number(grant.duration_days) || undefined,
          note: grant.note,
        }),
      }),
    onSuccess: () => {
      setGrantMsg(t('admin.grantSuccess'));
      setGrant((g) => ({ ...g, email: '', note: '' }));
      qc.invalidateQueries({ queryKey: ['admin-revenue'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (err: Error) => setGrantMsg(err.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div>
            <h3 className="font-semibold text-slate-900">{t('admin.plansEditor')}</h3>
            <p className="text-xs text-slate-500">{t('admin.plansEditorHint')}</p>
          </div>
          <div className="space-y-4">
            {plans.map((plan) => (
              <PlanEditor
                key={plan.id}
                plan={plan}
                saving={patchPlan.isPending}
                onSave={(body) => patchPlan.mutate({ id: plan.id, body })}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div>
            <h3 className="font-semibold text-slate-900">{t('admin.promotionsTitle')}</h3>
            <p className="text-xs text-slate-500">{t('admin.promotionsHint')}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder={t('admin.promoCode')}
              value={promoForm.code}
              onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })}
            />
            <Input
              placeholder={t('admin.promoLabel')}
              value={promoForm.label}
              onChange={(e) => setPromoForm({ ...promoForm, label: e.target.value })}
            />
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={promoForm.plan_id}
              onChange={(e) => setPromoForm({ ...promoForm, plan_id: e.target.value })}
            >
              <option value="">{t('admin.promoAllPlans')}</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Input
              type="number"
              placeholder={t('admin.promoPercent')}
              value={promoForm.discount_percent}
              onChange={(e) => setPromoForm({ ...promoForm, discount_percent: e.target.value })}
            />
            <Input
              placeholder={t('admin.promoFixed')}
              value={promoForm.discount_cents}
              onChange={(e) => setPromoForm({ ...promoForm, discount_cents: e.target.value })}
            />
            <Input
              type="date"
              value={promoForm.ends_at}
              onChange={(e) => setPromoForm({ ...promoForm, ends_at: e.target.value })}
            />
            <Input
              type="number"
              placeholder={t('admin.promoMaxUses')}
              value={promoForm.max_uses}
              onChange={(e) => setPromoForm({ ...promoForm, max_uses: e.target.value })}
            />
          </div>
          <Button
            size="sm"
            disabled={!promoForm.code.trim() || createPromo.isPending}
            onClick={() => createPromo.mutate()}
          >
            {t('admin.createPromo')}
          </Button>

          <ul className="divide-y divide-slate-100">
            {promotions.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-800">
                    {p.code}
                    {p.label ? ` — ${p.label}` : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.plan_name || t('admin.promoAllPlans')}
                    {p.discount_percent ? ` · ${p.discount_percent}%` : ''}
                    {p.discount_cents ? ` · -${centsToDollars(p.discount_cents)}` : ''}
                    {` · ${p.used_count}${p.max_uses != null ? `/${p.max_uses}` : ''} ${t('admin.promoUses')}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={p.is_active ? 'outline' : 'default'}
                    onClick={() => togglePromo.mutate({ id: p.id, is_active: !p.is_active })}
                  >
                    {p.is_active ? t('admin.deactivate') : t('admin.activate')}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => removePromo.mutate(p.id)}>
                    {t('common.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div>
            <h3 className="font-semibold text-slate-900">{t('admin.grantTitle')}</h3>
            <p className="text-xs text-slate-500">{t('admin.grantHint')}</p>
          </div>
          <Input
            placeholder={t('admin.grantEmail')}
            value={grant.email}
            onChange={(e) => { setGrant({ ...grant, email: e.target.value }); setGrantMsg(null); }}
          />
          <select
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={grant.plan_code}
            onChange={(e) => setGrant({ ...grant, plan_code: e.target.value })}
          >
            {plans.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
          <Input
            type="number"
            placeholder={t('admin.grantDays')}
            value={grant.duration_days}
            onChange={(e) => setGrant({ ...grant, duration_days: e.target.value })}
          />
          <Input
            placeholder={t('admin.grantNote')}
            value={grant.note}
            onChange={(e) => setGrant({ ...grant, note: e.target.value })}
          />
          {grantMsg && <p className="text-sm text-slate-600">{grantMsg}</p>}
          <Button
            disabled={!grant.email.trim() || grantComp.isPending}
            onClick={() => grantComp.mutate()}
          >
            {t('admin.grantSubmit')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanEditor({
  plan,
  onSave,
  saving,
}: {
  plan: AdminPlan;
  onSave: (body: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState(centsToDollars(plan.price_cents));
  const [promoPrice, setPromoPrice] = useState(centsToDollars(plan.promo_price_cents));
  const [promoLabel, setPromoLabel] = useState(plan.promo_label || '');
  const [promoUntil, setPromoUntil] = useState(plan.promo_until ? plan.promo_until.slice(0, 10) : '');
  const [days, setDays] = useState(String(plan.duration_days));
  const [active, setActive] = useState(!!plan.is_active);

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{plan.code}</p>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {t('admin.active')}
        </label>
      </div>
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          placeholder={t('admin.planPrice')}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Input
          type="number"
          placeholder={t('admin.planDays')}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
        <Input
          placeholder={t('admin.planPromoPrice')}
          value={promoPrice}
          onChange={(e) => setPromoPrice(e.target.value)}
        />
        <Input
          placeholder={t('admin.planPromoLabel')}
          value={promoLabel}
          onChange={(e) => setPromoLabel(e.target.value)}
        />
        <Input
          type="date"
          value={promoUntil}
          onChange={(e) => setPromoUntil(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={saving}
          onClick={() =>
            onSave({
              name,
              price_cents: dollarsToCents(price),
              duration_days: Number(days) || plan.duration_days,
              is_active: active,
              promo_price_cents: promoPrice.trim() === '' ? null : dollarsToCents(promoPrice),
              promo_label: promoLabel || '',
              promo_until: promoUntil ? new Date(promoUntil).toISOString() : null,
            })
          }
        >
          {t('common.save')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => {
            setPromoPrice('');
            setPromoLabel('');
            setPromoUntil('');
            onSave({ promo_price_cents: null, promo_label: '', promo_until: null });
          }}
        >
          {t('admin.clearPlanPromo')}
        </Button>
      </div>
    </div>
  );
}
