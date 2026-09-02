import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Users, FileText, Building2, Shield, Megaphone, DollarSign } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';

type Stats = {
  users: number;
  active_users: number;
  posts: number;
  businesses: number;
  admins: number;
  ads: number;
  paid_orders?: number;
  revenue_cents?: number;
};

export function DashboardSection() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api<Stats>('/admin/stats'),
  });

  if (isLoading || !data) {
    return <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>;
  }

  const revenue = ((data.revenue_cents || 0) / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
  });

  const cards = [
    { label: t('admin.statsUsers'), value: data.users, sub: `${data.active_users} ${t('admin.statsActive')}`, icon: Users },
    { label: t('admin.statsPosts'), value: data.posts, icon: FileText },
    { label: t('admin.statsBusinesses'), value: data.businesses, icon: Building2 },
    { label: t('admin.statsAdmins'), value: data.admins, icon: Shield },
    { label: t('admin.statsAds'), value: data.ads, icon: Megaphone },
    { label: t('admin.revenueTotal'), value: revenue, sub: `${data.paid_orders || 0} ${t('admin.paidOrders')}`, icon: DollarSign },
  ];

  return (
    <div className="space-y-4">
      <p className="text-slate-600">{t('admin.dashboardHint')}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, sub, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="flex items-start gap-3 pt-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                {sub && <p className="text-xs text-slate-500">{sub}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
