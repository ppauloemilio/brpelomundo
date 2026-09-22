import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Megaphone, ShoppingBag } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AdminToggle } from '../AdminUi';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MonetizationSettings } from '@/hooks/useMonetization';
import { AdminBillingPanel } from './AdminBillingPanel';

type Revenue = {
  by_currency: Array<{ orders_count: number; revenue_cents: number; currency: string }>;
  by_product: Array<{ product_type: string; orders_count: number; revenue_cents: number }>;
  recent_orders: Array<{
    id: string;
    plan_name: string;
    user_name: string;
    user_email: string;
    amount_cents: number;
    currency: string;
    product_type: string;
    paid_at: string;
    status: string;
  }>;
};

type AdMetrics = {
  impressions: number;
  clicks: number;
  ctr: number;
  ads: Array<{ id: string; title: string; impressions: number; clicks: number; ctr: number; is_active: number }>;
};

function money(cents: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

export function MonetizationSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api<MonetizationSettings>('/admin/settings'),
  });

  const { data: revenue } = useQuery({
    queryKey: ['admin-revenue'],
    queryFn: () => api<Revenue>('/admin/billing/revenue'),
  });

  const { data: adMetrics } = useQuery({
    queryKey: ['admin-ad-metrics'],
    queryFn: () => api<AdMetrics>('/admin/ads/metrics'),
  });

  const saveSettings = useMutation({
    mutationFn: (patch: Partial<MonetizationSettings>) =>
      api('/admin/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['monetization-settings'] });
    },
  });

  const applyExamples = useMutation({
    mutationFn: () => api('/admin/monetization-examples', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] });
      qc.invalidateQueries({ queryKey: ['monetization-settings'] });
      qc.invalidateQueries({ queryKey: ['advertisements'] });
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['businesses'] });
    },
  });

  if (isLoading || !settings) {
    return <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>;
  }

  const totalRevenue = revenue?.by_currency?.[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-start gap-3 pt-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <DollarSign className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">
                {totalRevenue ? money(totalRevenue.revenue_cents, totalRevenue.currency) : money(0)}
              </p>
              <p className="text-sm text-slate-600">{t('admin.revenueTotal')}</p>
              <p className="text-xs text-slate-400">
                {totalRevenue?.orders_count ?? 0} {t('admin.paidOrders')}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-3 pt-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <Megaphone className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{adMetrics?.impressions ?? 0}</p>
              <p className="text-sm text-slate-600">{t('admin.adImpressions')}</p>
              <p className="text-xs text-slate-400">
                {adMetrics?.clicks ?? 0} {t('admin.adClicks')} · CTR {adMetrics?.ctr ?? 0}%
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-3 pt-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <ShoppingBag className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold text-slate-900">{revenue?.by_product?.length ?? 0}</p>
              <p className="text-sm text-slate-600">{t('admin.productLines')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <AdminToggle
            checked={settings.ads_enabled}
            onChange={(v) => saveSettings.mutate({ ads_enabled: v })}
            label={t('admin.adsEnabled')}
            hint={t('admin.adsHint')}
          />
          <AdminToggle
            checked={settings.featured_business_enabled}
            onChange={(v) => saveSettings.mutate({ featured_business_enabled: v })}
            label={t('admin.featuredBusinessEnabled')}
            hint={t('admin.featuredBusinessHint')}
          />
          <AdminToggle
            checked={settings.paid_posts_enabled}
            onChange={(v) => saveSettings.mutate({ paid_posts_enabled: v })}
            label={t('admin.paidPostsEnabled')}
            hint={t('admin.paidPostsHint')}
          />
          <AdminToggle
            checked={settings.premium_profile_enabled}
            onChange={(v) => saveSettings.mutate({ premium_profile_enabled: v })}
            label={t('admin.premiumEnabled')}
            hint={t('admin.premiumHint')}
          />
          <AdminToggle
            checked={settings.classifieds_paid_enabled}
            onChange={(v) => saveSettings.mutate({ classifieds_paid_enabled: v })}
            label={t('admin.classifiedsPaidEnabled')}
            hint={t('admin.classifiedsPaidHint')}
          />
          <AdminToggle
            checked={settings.sponsored_events_enabled}
            onChange={(v) => saveSettings.mutate({ sponsored_events_enabled: v })}
            label={t('admin.sponsoredEventsEnabled')}
            hint={t('admin.sponsoredEventsHint')}
          />
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">{t('admin.examplesTitle')}</p>
            <p className="mb-3 text-xs text-slate-500">{t('admin.examplesHint')}</p>
            <Button
              variant="outline"
              size="sm"
              disabled={applyExamples.isPending}
              onClick={() => applyExamples.mutate()}
            >
              {applyExamples.isPending ? t('common.loading') : t('admin.applyExamples')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AdminBillingPanel />

      {revenue && revenue.recent_orders.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h3 className="font-semibold text-slate-900">{t('admin.recentOrders')}</h3>
            <ul className="divide-y divide-slate-100">
              {revenue.recent_orders.slice(0, 10).map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div>
                    <p className="font-medium text-slate-800">{o.plan_name}</p>
                    <p className="text-xs text-slate-500">{o.user_name} · {o.user_email}</p>
                  </div>
                  <span className="font-semibold">{money(o.amount_cents, o.currency)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {adMetrics && adMetrics.ads.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <h3 className="font-semibold text-slate-900">{t('admin.adMetricsTitle')}</h3>
            <ul className="divide-y divide-slate-100">
              {adMetrics.ads.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <p className="font-medium text-slate-800">{a.title}</p>
                  <p className="text-xs text-slate-500">
                    {a.impressions} imp · {a.clicks} clk · CTR {a.ctr}%
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
