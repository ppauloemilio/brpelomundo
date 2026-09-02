import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, Building2, DollarSign, Megaphone, ArrowLeft, Settings, ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { DashboardSection } from '@/components/admin/sections/DashboardSection';
import { UsersSection } from '@/components/admin/sections/UsersSection';
import { PostsSection } from '@/components/admin/sections/PostsSection';
import { BusinessesSection } from '@/components/admin/sections/BusinessesSection';
import { MonetizationSection } from '@/components/admin/sections/MonetizationSection';
import { AdsSection } from '@/components/admin/sections/AdsSection';
import { ReportsSection } from '@/components/admin/sections/ReportsSection';

export type AdminSection = 'dashboard' | 'users' | 'posts' | 'businesses' | 'monetization' | 'ads' | 'reports';

const NAV: { key: AdminSection; labelKey: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', labelKey: 'admin.tabDashboard', icon: LayoutDashboard },
  { key: 'users', labelKey: 'admin.tabUsers', icon: Users },
  { key: 'posts', labelKey: 'admin.tabPostsManage', icon: FileText },
  { key: 'businesses', labelKey: 'admin.tabBusinesses', icon: Building2 },
  { key: 'reports', labelKey: 'admin.tabReports', icon: ShieldAlert },
  { key: 'monetization', labelKey: 'admin.tabMonetization', icon: DollarSign },
  { key: 'ads', labelKey: 'admin.tabAds', icon: Megaphone },
];

function NavItem({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: typeof LayoutDashboard; children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
        active ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </button>
  );
}

export function AdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [section, setSection] = useState<AdminSection>('dashboard');

  const titles: Record<AdminSection, string> = {
    dashboard: t('admin.tabDashboard'),
    users: t('admin.tabUsers'),
    posts: t('admin.tabPostsManage'),
    businesses: t('admin.tabBusinesses'),
    reports: t('admin.tabReports'),
    monetization: t('admin.tabMonetization'),
    ads: t('admin.tabAds'),
  };

  return (
    <div className="mx-auto max-w-6xl pb-12">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate('/settings')}>
            <ArrowLeft className="h-4 w-4" />
            {t('settings.title')}
          </Button>
          <h1 className="text-2xl font-bold text-slate-900">{t('admin.title')}</h1>
          <p className="text-sm text-slate-500">{t('admin.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/settings')}>
          <Settings className="h-4 w-4" />
          {t('settings.title')}
        </Button>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-56 shrink-0">
          <nav className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 lg:flex-col lg:overflow-visible lg:bg-transparent lg:p-0">
            {NAV.map(({ key, labelKey, icon }) => (
              <NavItem key={key} active={section === key} onClick={() => setSection(key)} icon={icon}>
                {t(labelKey)}
              </NavItem>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">{titles[section]}</h2>
          {section === 'dashboard' && <DashboardSection />}
          {section === 'users' && <UsersSection />}
          {section === 'posts' && <PostsSection />}
          {section === 'businesses' && <BusinessesSection />}
          {section === 'reports' && <ReportsSection />}
          {section === 'monetization' && <MonetizationSection />}
          {section === 'ads' && <AdsSection />}
        </main>
      </div>
    </div>
  );
}
