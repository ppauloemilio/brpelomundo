import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Bell, Home, Map, Search, Users, MessageCircle, Plus, Menu, Globe, Calendar, LogOut, Tag,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

const mainNav = [
  { to: '/feed', icon: Home, labelKey: 'nav.feed' },
  { to: '/explore', icon: Search, labelKey: 'nav.explore' },
  { to: '/business-map', icon: Map, labelKey: 'nav.map' },
  { to: '/groups', icon: Users, labelKey: 'nav.groups' },
  { to: '/events', icon: Calendar, labelKey: 'nav.events' },
];

const moreNav = [
  { to: '/classifieds', icon: Tag, labelKey: 'nav.classifieds' },
];

export function Layout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isFeed = location.pathname === '/feed' || location.pathname === '/' || location.pathname === '/home';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const { data: notifCount } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => api<{ count: number }>('/social/notifications/unread-count'),
    refetchInterval: 30000,
  });

  const { data: msgCount } = useQuery({
    queryKey: ['messages-count'],
    queryFn: () => api<{ count: number }>('/conversations/unread-count'),
    refetchInterval: 30000,
  });

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 lg:px-6">
          <button type="button" className="lg:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
            <Menu className="h-6 w-6 text-slate-700" />
          </button>

          <button
            type="button"
            className="flex items-center gap-2 font-bold text-brand-800"
            onClick={() => navigate('/home')}
          >
            <Globe className="h-6 w-6 text-brand-600" />
            <span className="hidden sm:inline text-base">{t('app.name')}</span>
          </button>

          <nav className="mx-auto hidden items-center gap-1 md:flex">
            {[...mainNav, ...moreNav].map(({ to, icon: Icon, labelKey }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {t(labelKey)}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Button size="sm" variant="outline" className="hidden rounded-full border-slate-300 sm:inline-flex" onClick={() => navigate('/create-post')}>
              <Plus className="h-4 w-4" />
              {t('nav.post')}
            </Button>
            <button
              type="button"
              onClick={() => navigate('/messages')}
              className="relative rounded-full p-2.5 text-slate-600 hover:bg-slate-100"
              aria-label={t('nav.messages')}
            >
              <MessageCircle className="h-5 w-5" />
              {(msgCount?.count ?? 0) > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className="relative rounded-full p-2.5 text-slate-600 hover:bg-slate-100"
              aria-label={t('nav.notifications')}
            >
              <Bell className="h-5 w-5" />
              {(notifCount?.count ?? 0) > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
              )}
            </button>
            <button type="button" onClick={() => navigate('/profile')} className={cn('rounded-full ring-2 ring-transparent hover:ring-brand-200', user?.is_premium && 'ring-brand-300')}>
              <Avatar src={user?.avatar_url} name={user?.full_name || 'U'} className="h-9 w-9" />
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full p-2.5 text-slate-600 hover:bg-slate-100 hover:text-red-600"
              aria-label={t('nav.logout')}
              title={t('nav.logout')}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className={cn('mx-auto max-w-6xl px-4 py-4 lg:px-6', isFeed ? '' : 'pb-20 md:pb-6')}>
        <Outlet />
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-200 bg-white md:hidden">
        {mainNav.map(({ to, icon: Icon, labelKey }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
                isActive ? 'text-brand-700' : 'text-slate-500'
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{t(labelKey)}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => navigate('/create-post')}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-brand-700"
        >
          <Plus className="h-5 w-5" />
          <span>{t('nav.post')}</span>
        </button>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute left-0 top-0 h-full w-72 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center gap-2 font-bold text-brand-800">
              <Globe className="h-6 w-6" /> {t('app.name')}
            </div>
            <nav className="flex flex-col gap-1">
              {mainNav.map(({ to, icon: Icon, labelKey }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium',
                      isActive ? 'bg-brand-100 text-brand-800' : 'text-slate-600'
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  {t(labelKey)}
                </NavLink>
              ))}
              {moreNav.map(({ to, icon: Icon, labelKey }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium',
                      isActive ? 'bg-brand-100 text-brand-800' : 'text-slate-600'
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  {t(labelKey)}
                </NavLink>
              ))}
              <NavLink to="/pricing" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-600">
                {t('billing.title')}
              </NavLink>
              <NavLink to="/messages" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-600">
                <MessageCircle className="h-5 w-5" /> {t('nav.messages')}
              </NavLink>
              <NavLink to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-600">
                {t('nav.profile')}
              </NavLink>
              <NavLink to="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-600">
                {t('nav.settings')}
              </NavLink>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
