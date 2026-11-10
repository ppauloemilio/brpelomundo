import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Users, FileText, Building2, Shield, Megaphone, DollarSign, ChevronRight } from 'lucide-react';
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

export type DashboardDetailSection = 'users' | 'posts' | 'businesses' | 'ads' | 'monetization';

export type DashboardNavigateOptions = {
  usersFilter?: string;
};

type Props = {
  onOpenDetail: (section: DashboardDetailSection, options?: DashboardNavigateOptions) => void;
};

export function DashboardSection({ onOpenDetail }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api<Stats>('/admin/stats'),
  });

  if (isLoading || !data) {
    return <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>;
  }

  const revenue = ((data.revenue_cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const cards: Array<{
    id: string;
    label: string;
    value: string | number;
    sub?: string;
    icon: typeof Users;
    section: DashboardDetailSection;
    options?: DashboardNavigateOptions;
  }> = [
    {
      id: 'users',
      label: t('admin.statsUsers'),
      value: data.users,
      sub: `${data.active_users} ${t('admin.statsActive')}`,
      icon: Users,
      section: 'users',
    },
    {
      id: 'posts',
      label: t('admin.statsPosts'),
      value: data.posts,
      icon: FileText,
      section: 'posts',
    },
    {
      id: 'businesses',
      label: t('admin.statsBusinesses'),
      value: data.businesses,
      icon: Building2,
      section: 'businesses',
    },
    {
      id: 'admins',
      label: t('admin.statsAdmins'),
      value: data.admins,
      icon: Shield,
      section: 'users',
      options: { usersFilter: 'admin' },
    },
    {
      id: 'ads',
      label: t('admin.statsAds'),
      value: data.ads,
      icon: Megaphone,
      section: 'ads',
    },
    {
      id: 'revenue',
      label: t('admin.revenueTotal'),
      value: revenue,
      sub: `${data.paid_orders || 0} ${t('admin.paidOrders')}`,
      icon: DollarSign,
      section: 'monetization',
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-slate-600">{t('admin.dashboardHint')}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ id, label, value, sub, icon: Icon, section, options }) => (
          <Card
            key={id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenDetail(section, options)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenDetail(section, options);
              }
            }}
            className="cursor-pointer transition hover:border-brand-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <CardContent className="flex items-start gap-3 pt-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                {sub && <p className="text-xs text-slate-500">{sub}</p>}
                <p className="mt-1 text-xs font-medium text-brand-700">{t('admin.viewDetails')}</p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
