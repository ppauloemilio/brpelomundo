import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

type Plan = {
  id: string;
  code: string;
  product_type: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  duration_days: number;
  effective_price_cents?: number;
  original_price_cents?: number;
  has_promo?: boolean;
  promo_badge?: string | null;
};

type Business = { id: string; name: string };
type Post = { id: string; content: string; created_at: string };

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function PricingPage() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>('premium_monthly');
  const [targetId, setTargetId] = useState('');
  const [cardName, setCardName] = useState(user?.full_name || '');
  const [cardNumber, setCardNumber] = useState('4242424242424242');
  const [promoCode, setPromoCode] = useState('');
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => api<Plan[]>('/billing/plans'),
  });

  const { data: businesses = [] } = useQuery({
    queryKey: ['my-businesses'],
    queryFn: () => api<Business[]>('/businesses/mine'),
  });

  const { data: myPosts = [] } = useQuery({
    queryKey: ['user-posts', user?.id],
    queryFn: () => api<Post[]>(`/users/${user!.id}/posts`),
    enabled: !!user?.id,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['billing-orders'],
    queryFn: () => api<Array<{ id: string; plan_name: string; amount_cents: number; currency: string; status: string; paid_at: string; ends_at: string }>>('/billing/orders'),
  });

  const plan = useMemo(() => plans.find((p) => p.code === selected), [plans, selected]);
  const payCents = plan?.effective_price_cents ?? plan?.price_cents ?? 0;

  const needsBusiness = plan?.product_type === 'featured_business';
  const needsPost = plan?.product_type === 'promoted_post';

  const checkout = useMutation({
    mutationFn: () =>
      api<{ message?: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({
          plan_code: selected,
          target_id: targetId || undefined,
          card_last4: cardNumber.replace(/\D/g, '').slice(-4),
          promo_code: promoCode.trim() || undefined,
        }),
      }),
    onSuccess: async (res: { message?: string }) => {
      setError(null);
      setDoneMsg(res.message || t('billing.success'));
      await refreshUser();
      qc.invalidateQueries({ queryKey: ['billing-orders'] });
      qc.invalidateQueries({ queryKey: ['monetization-settings'] });
      qc.invalidateQueries({ queryKey: ['my-businesses'] });
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['businesses'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err: Error) => {
      setDoneMsg(null);
      setError(err.message || t('common.error'));
    },
  });

  const canPay =
    !!plan &&
    cardNumber.replace(/\D/g, '').length >= 12 &&
    (!needsBusiness || !!targetId) &&
    (!needsPost || !!targetId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('billing.title')}</h1>
        <p className="mt-1 text-slate-500">{t('billing.subtitle')}</p>
      </div>

      {user?.is_premium && (
        <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <Sparkles className="h-4 w-4" />
          {t('billing.alreadyPremium')}
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-500">{t('common.loading')}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((p) => (
            <button
              key={p.code}
              type="button"
              onClick={() => {
                setSelected(p.code);
                setTargetId('');
                setDoneMsg(null);
                setError(null);
              }}
              className={cn(
                'rounded-2xl border p-4 text-left transition',
                selected === p.code
                  ? 'border-brand-500 bg-brand-50/60 ring-2 ring-brand-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-slate-900">{p.name}</h2>
                <div className="flex items-center gap-1">
                  {p.has_promo && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                      {p.promo_badge || 'Promo'}
                    </span>
                  )}
                  {selected === p.code && <Check className="h-5 w-5 text-brand-600" />}
                </div>
              </div>
              <p className="mt-1 text-sm text-slate-500">{p.description}</p>
              <p className="mt-3 text-lg font-bold text-brand-800">
                {formatMoney(p.effective_price_cents ?? p.price_cents, p.currency)}
                {p.has_promo && (
                  <span className="ml-2 text-sm font-normal text-slate-400 line-through">
                    {formatMoney(p.original_price_cents ?? p.price_cents, p.currency)}
                  </span>
                )}
                <span className="ml-1 text-xs font-medium text-slate-500">
                  / {p.duration_days}{t('billing.daysShort')}
                </span>
              </p>
            </button>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <CreditCard className="h-5 w-5 text-brand-600" />
            {t('billing.checkout')}
          </h3>
          <p className="text-xs text-slate-500">{t('billing.demoHint')}</p>

          {needsBusiness && (
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">{t('billing.selectBusiness')}</option>
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}

          {needsPost && (
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">{t('billing.selectPost')}</option>
              {myPosts.slice(0, 20).map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.content || '').slice(0, 60) || p.id}
                </option>
              ))}
            </select>
          )}

          <Input
            placeholder={t('billing.cardName')}
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
          />
          <Input
            placeholder={t('billing.cardNumber')}
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value.replace(/[^\d\s]/g, ''))}
          />
          <Input
            placeholder={t('billing.promoCode')}
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          {doneMsg && <p className="text-sm text-emerald-700">{doneMsg}</p>}

          <Button
            className="w-full"
            disabled={!canPay || checkout.isPending}
            onClick={() => checkout.mutate()}
          >
            {checkout.isPending
              ? t('common.loading')
              : t('billing.payNow', { amount: plan ? formatMoney(payCents, plan.currency) : '' })}
          </Button>
        </CardContent>
      </Card>

      {orders.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h3 className="font-semibold text-slate-900">{t('billing.history')}</h3>
            <ul className="divide-y divide-slate-100">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{o.plan_name}</p>
                    <p className="text-xs text-slate-500">
                      {o.paid_at ? new Date(o.paid_at).toLocaleString() : ''}
                      {o.ends_at ? ` · ${t('billing.validUntil')} ${new Date(o.ends_at).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <span className="font-semibold text-slate-700">
                    {formatMoney(o.amount_cents, o.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
