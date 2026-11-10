import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CreditCard, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import {
  AdCampaignCheckoutFields,
  AdCampaignPanel,
  emptyAdCampaignForm,
} from '@/components/billing/AdCampaignPanel';
import { PayPalCheckoutButtons } from '@/components/billing/PayPalCheckoutButtons';
import { PixCheckoutPanel } from '@/components/billing/PixCheckoutPanel';
import { adCampaignModeFromPlanCode, isAdCampaignPlan } from '@/lib/adPlacements';
import { groupPlans } from '@/lib/planGroups';

type PaymentConfig = {
  provider: 'mercadopago' | 'paypal' | 'demo';
  currency?: string;
  mercadopago: { method: 'pix' } | null;
  paypal: { clientId: string; mode: 'sandbox' | 'live'; currency: string } | null;
};

type PixCheckoutState = {
  orderId: string;
  pixCopyPaste: string;
  qrDataUrl: string;
  amount_cents: number;
  currency: string;
};

type Plan = {
  id: string;
  code: string;
  product_type: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  duration_days: number;
  sort_order?: number;
  effective_price_cents?: number;
  original_price_cents?: number;
  has_promo?: boolean;
  promo_badge?: string | null;
};

type Business = { id: string; name: string };
type Post = { id: string; content: string; created_at: string; type?: string };
type Listing = { id: string; title: string };
type CommunityEvent = { id: string; title: string; event_date: string };

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

function buildCreativePayload(form: ReturnType<typeof emptyAdCampaignForm>) {
  if (!form.title.trim() || !form.image_url.trim()) return undefined;
  return {
    title: form.title.trim(),
    image_url: form.image_url.trim(),
    link_url: form.link_url.trim() || undefined,
    description: form.description.trim() || undefined,
  };
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
  const [adCreativeFeed, setAdCreativeFeed] = useState(emptyAdCampaignForm());
  const [adCreativeSidebar, setAdCreativeSidebar] = useState(emptyAdCampaignForm());
  const [pixCheckout, setPixCheckout] = useState<PixCheckoutState | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const skipPaypalErrorRef = useRef(false);

  const { data: paymentConfig } = useQuery({
    queryKey: ['billing-payment-config'],
    queryFn: () => api<PaymentConfig>('/billing/payment-config'),
  });
  const useMercadoPago = paymentConfig?.provider === 'mercadopago';
  const usePaypal = paymentConfig?.provider === 'paypal' && !!paymentConfig.paypal?.clientId;

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

  const { data: myClassifieds = [] } = useQuery({
    queryKey: ['classifieds-mine'],
    queryFn: () => api<Listing[]>('/classifieds?mine=1&status=all'),
  });

  const { data: myEvents = [] } = useQuery({
    queryKey: ['events-mine'],
    queryFn: () => api<CommunityEvent[]>('/events?mine=1&scope=all'),
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['billing-orders'],
    queryFn: () =>
      api<
        Array<{
          id: string;
          plan_name: string;
          amount_cents: number;
          currency: string;
          status: string;
          paid_at: string | null;
          ends_at: string | null;
          created_at: string;
        }>
      >('/billing/orders'),
  });

  const planGroups = useMemo(() => groupPlans(plans), [plans]);
  const plan = useMemo(() => plans.find((p) => p.code === selected), [plans, selected]);
  const payCents = plan?.effective_price_cents ?? plan?.price_cents ?? 0;
  const adCampaignMode = plan ? adCampaignModeFromPlanCode(plan.code) : null;

  const needsBusiness = plan?.product_type === 'featured_business' || plan?.product_type === 'local_business';
  const needsPost = plan?.product_type === 'promoted_post';
  const needsJob = plan?.product_type === 'promoted_job';
  const needsClassified = plan?.product_type === 'classified_featured';
  const needsEvent = plan?.product_type === 'sponsored_event';
  const needsAdCampaign = plan ? isAdCampaignPlan(plan.product_type, plan.code) : false;
  const jobPosts = myPosts.filter((p) => p.type === 'job');

  const checkoutPayload = () => ({
    plan_code: selected,
    target_id: targetId || undefined,
    card_last4: cardNumber.replace(/\D/g, '').slice(-4),
    promo_code: promoCode.trim() || undefined,
    ad_creatives: needsAdCampaign
      ? {
          feed: buildCreativePayload(adCreativeFeed),
          sidebar: buildCreativePayload(adCreativeSidebar),
        }
      : undefined,
  });

  const refreshAfterPurchase = async (res?: { message?: string; activated?: { needs_creative?: boolean } }) => {
    setError(null);
    const msg =
      res?.activated?.needs_creative
        ? t('billing.adCampaignPurchasedSetup')
        : res?.message || t('billing.success');
    setDoneMsg(msg);
    setPixCheckout(null);
    setAdCreativeFeed(emptyAdCampaignForm());
    setAdCreativeSidebar(emptyAdCampaignForm());
    await refreshUser();
    qc.invalidateQueries({ queryKey: ['billing-orders'] });
    qc.invalidateQueries({ queryKey: ['billing-ad-campaigns'] });
    qc.invalidateQueries({ queryKey: ['advertisements'] });
    qc.invalidateQueries({ queryKey: ['monetization-settings'] });
    qc.invalidateQueries({ queryKey: ['my-businesses'] });
    qc.invalidateQueries({ queryKey: ['posts'] });
    qc.invalidateQueries({ queryKey: ['businesses'] });
    qc.invalidateQueries({ queryKey: ['profile'] });
    qc.invalidateQueries({ queryKey: ['classifieds'] });
    qc.invalidateQueries({ queryKey: ['events'] });
    qc.invalidateQueries({ queryKey: ['classifieds-mine'] });
    qc.invalidateQueries({ queryKey: ['events-mine'] });
  };

  const checkout = useMutation({
    mutationFn: () =>
      api<{ message?: string; activated?: { needs_creative?: boolean } }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify(checkoutPayload()),
      }),
    onSuccess: async (res) => {
      await refreshAfterPurchase(res);
    },
    onError: (err: Error) => {
      setDoneMsg(null);
      setError(err.message || t('common.error'));
    },
  });

  const createPaypalOrder = async () => {
    setError(null);
    setDoneMsg(null);
    skipPaypalErrorRef.current = false;
    const res = await api<{
      free?: boolean;
      paypalOrderId?: string;
      message?: string;
      activated?: { needs_creative?: boolean };
    }>('/billing/paypal/create-order', {
      method: 'POST',
      body: JSON.stringify(checkoutPayload()),
    });

    if (res.free) {
      skipPaypalErrorRef.current = true;
      await refreshAfterPurchase(res);
      throw new Error('FREE_CHECKOUT');
    }

    if (!res.paypalOrderId) {
      throw new Error(t('billing.paypalError'));
    }
    return res.paypalOrderId;
  };

  const capturePaypalOrder = async (paypalOrderId: string) => {
    const res = await api<{ message?: string; activated?: { needs_creative?: boolean } }>(
      '/billing/paypal/capture',
      {
        method: 'POST',
        body: JSON.stringify({ paypal_order_id: paypalOrderId }),
      }
    );
    await refreshAfterPurchase(res);
  };

  const startMercadoPagoPix = async () => {
    setError(null);
    setDoneMsg(null);
    setPixLoading(true);
    try {
      const res = await api<{
        free?: boolean;
        orderId?: string;
        pixCopyPaste?: string;
        qrDataUrl?: string;
        amount_cents?: number;
        currency?: string;
        message?: string;
        activated?: { needs_creative?: boolean };
      }>('/billing/mercadopago/create', {
        method: 'POST',
        body: JSON.stringify(checkoutPayload()),
      });

      if (res.free) {
        await refreshAfterPurchase(res);
        return;
      }

      if (!res.orderId || !res.pixCopyPaste || !res.qrDataUrl) {
        throw new Error(t('billing.pixError'));
      }

      setPixCheckout({
        orderId: res.orderId,
        pixCopyPaste: res.pixCopyPaste,
        qrDataUrl: res.qrDataUrl,
        amount_cents: res.amount_cents || payCents,
        currency: res.currency || 'BRL',
      });
    } catch (err) {
      setPixCheckout(null);
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPixLoading(false);
    }
  };

  const selectionReady =
    !!plan &&
    (!needsBusiness || !!targetId) &&
    (!needsPost || !!targetId) &&
    (!needsJob || !!targetId) &&
    (!needsClassified || !!targetId) &&
    (!needsEvent || !!targetId);

  const canPay =
    selectionReady &&
    (useMercadoPago || usePaypal || cardNumber.replace(/\D/g, '').length >= 12);

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
        <div className="space-y-8">
          {planGroups.map((group) => (
            <section
              key={group.id}
              className={cn(
                'space-y-3',
                group.id === 'ads' && 'rounded-2xl border border-slate-200 bg-slate-50 p-4'
              )}
            >
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{t(`billing.group.${group.id}`)}</h2>
                <p className="mt-1 text-sm text-slate-500">{t(`billing.groupHint.${group.id}`)}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {group.plans.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => {
                      setSelected(p.code);
                      setTargetId('');
                      setAdCreativeFeed(emptyAdCampaignForm());
                      setAdCreativeSidebar(emptyAdCampaignForm());
                      setPixCheckout(null);
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
                      <h3 className="font-semibold text-slate-900">{p.name}</h3>
                      <div className="flex items-center gap-1">
                        {p.has_promo && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                            {p.promo_badge || 'Promo'}
                          </span>
                        )}
                        {selected === p.code && <Check className="h-5 w-5 text-brand-600" />}
                      </div>
                    </div>
                    {p.product_type === 'featured_business' && (
                      <p className="mt-1 text-sm font-medium text-brand-800">{t('billing.mapWorldwide')}</p>
                    )}
                    {p.product_type === 'local_business' && (
                      <p className="mt-1 text-sm font-medium text-brand-800">{t('billing.mapCityOnly')}</p>
                    )}
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
            </section>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-5">
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <CreditCard className="h-5 w-5 text-brand-600" />
            {t('billing.checkout')}
          </h3>
          <p className="text-xs text-slate-500">
            {useMercadoPago
              ? t('billing.pixPayHint')
              : usePaypal
                ? t('billing.paypalHint')
                : t('billing.demoHint')}
          </p>

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
              {myPosts.filter((p) => p.type !== 'job').slice(0, 20).map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.content || '').slice(0, 60) || p.id}
                </option>
              ))}
            </select>
          )}

          {needsJob && (
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">{t('billing.selectJob')}</option>
              {jobPosts.slice(0, 20).map((p) => (
                <option key={p.id} value={p.id}>
                  {(p.content || '').slice(0, 60) || p.id}
                </option>
              ))}
            </select>
          )}

          {needsClassified && (
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">{t('billing.selectClassified')}</option>
              {myClassifieds.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          )}

          {needsEvent && (
            <select
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              <option value="">{t('billing.selectEvent')}</option>
              {myEvents.map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </select>
          )}

          {needsAdCampaign && adCampaignMode === 'feed' && (
            <AdCampaignCheckoutFields
              placement="feed"
              form={adCreativeFeed}
              onChange={setAdCreativeFeed}
            />
          )}

          {needsAdCampaign && adCampaignMode === 'sidebar' && (
            <AdCampaignCheckoutFields
              placement="sidebar"
              form={adCreativeSidebar}
              onChange={setAdCreativeSidebar}
            />
          )}

          {needsAdCampaign && adCampaignMode === 'combo' && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-800">{t('billing.adComboOptional')}</p>
              <p className="text-xs text-slate-500">{t('billing.adComboDiscountHint')}</p>
              <AdCampaignCheckoutFields
                placement="feed"
                form={adCreativeFeed}
                onChange={setAdCreativeFeed}
              />
              <AdCampaignCheckoutFields
                placement="sidebar"
                form={adCreativeSidebar}
                onChange={setAdCreativeSidebar}
              />
            </div>
          )}

          {!usePaypal && !useMercadoPago && (
            <>
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
            </>
          )}
          <Input
            placeholder={t('billing.promoCode')}
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}
          {doneMsg && <p className="text-sm text-emerald-700">{doneMsg}</p>}

          {useMercadoPago ? (
            pixCheckout ? (
              <PixCheckoutPanel
                orderId={pixCheckout.orderId}
                amountLabel={formatMoney(pixCheckout.amount_cents, pixCheckout.currency)}
                pixCopyPaste={pixCheckout.pixCopyPaste}
                qrDataUrl={pixCheckout.qrDataUrl}
                onPaid={() => {
                  void refreshAfterPurchase({ message: t('billing.success') });
                }}
                onError={(message) => {
                  setError(message);
                  if (message === t('billing.pixExpired')) {
                    setPixCheckout(null);
                    qc.invalidateQueries({ queryKey: ['billing-orders'] });
                  }
                }}
              />
            ) : (
              <Button
                className="w-full"
                disabled={!canPay || pixLoading}
                onClick={() => void startMercadoPagoPix()}
              >
                {pixLoading
                  ? t('common.loading')
                  : t('billing.payPix', { amount: plan ? formatMoney(payCents, plan.currency || 'BRL') : '' })}
              </Button>
            )
          ) : usePaypal && paymentConfig?.paypal ? (
            <PayPalCheckoutButtons
              clientId={paymentConfig.paypal.clientId}
              currency={paymentConfig.paypal.currency || plan?.currency || 'USD'}
              disabled={!selectionReady}
              onCreateOrder={async () => {
                try {
                  return await createPaypalOrder();
                } catch (err) {
                  if (err instanceof Error && err.message === 'FREE_CHECKOUT') {
                    throw err;
                  }
                  setDoneMsg(null);
                  setError(err instanceof Error ? err.message : t('common.error'));
                  throw err;
                }
              }}
              onApprove={async (paypalOrderId) => {
                try {
                  await capturePaypalOrder(paypalOrderId);
                } catch (err) {
                  setDoneMsg(null);
                  setError(err instanceof Error ? err.message : t('common.error'));
                  throw err;
                }
              }}
              onError={(message) => {
                if (skipPaypalErrorRef.current) {
                  skipPaypalErrorRef.current = false;
                  return;
                }
                setDoneMsg(null);
                setError(message);
              }}
              onCancel={() => {
                setError(t('billing.paypalCancelled'));
              }}
            />
          ) : (
            <Button
              className="w-full"
              disabled={!canPay || checkout.isPending}
              onClick={() => checkout.mutate()}
            >
              {checkout.isPending
                ? t('common.loading')
                : t('billing.payNow', { amount: plan ? formatMoney(payCents, plan.currency) : '' })}
            </Button>
          )}
        </CardContent>
      </Card>

      <AdCampaignPanel />

      {orders.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h3 className="font-semibold text-slate-900">{t('billing.history')}</h3>
            <ul className="divide-y divide-slate-100">
              {orders.map((o) => {
                const isPaid = o.status === 'paid';
                const isExpired = o.status === 'expired';
                const isPending = o.status === 'pending';
                return (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{o.plan_name}</p>
                      <p className="text-xs text-slate-500">
                        {isPaid && o.paid_at
                          ? `${new Date(o.paid_at).toLocaleString()}${
                              o.ends_at
                                ? ` · ${t('billing.validUntil')} ${new Date(o.ends_at).toLocaleDateString()}`
                                : ''
                            }`
                          : isExpired
                            ? t('billing.orderExpired')
                            : isPending
                              ? t('billing.orderPending')
                              : o.created_at
                                ? new Date(o.created_at).toLocaleString()
                                : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="block font-semibold text-slate-700">
                        {formatMoney(o.amount_cents, o.currency)}
                      </span>
                      {(isPending || isExpired) && (
                        <span
                          className={
                            isExpired
                              ? 'text-[11px] font-medium text-rose-600'
                              : 'text-[11px] font-medium text-amber-700'
                          }
                        >
                          {isExpired ? t('billing.statusExpired') : t('billing.statusPending')}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
