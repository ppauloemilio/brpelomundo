import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Users, Building2, Briefcase, Calendar, MessageCircle, ArrowRight, Tag, UsersRound,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { COUNTRY_LABELS, cn } from '@/lib/utils';

const ACTIONS = [
  { key: 'people', icon: Users, path: 'people', color: 'bg-sky-50 text-sky-700 border-sky-100' },
  { key: 'businesses', icon: Building2, path: 'businesses', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { key: 'classifieds', icon: Tag, path: 'classifieds', color: 'bg-orange-50 text-orange-700 border-orange-100' },
  { key: 'groups', icon: UsersRound, path: 'groups', color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  { key: 'events', icon: Calendar, path: 'events', color: 'bg-violet-50 text-violet-700 border-violet-100' },
  { key: 'jobs', icon: Briefcase, path: 'jobs', color: 'bg-amber-50 text-amber-800 border-amber-100' },
  { key: 'messages', icon: MessageCircle, path: 'messages', color: 'bg-rose-50 text-rose-700 border-rose-100' },
] as const;

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const city = user?.profile?.current_city || '';
  const country = user?.profile?.current_country || '';
  const place = city
    || COUNTRY_LABELS[country]
    || country
    || t('home.yourArea');
  const firstName = user?.full_name?.split(' ')[0] || '';

  const goTo = (path: (typeof ACTIONS)[number]['path']) => {
    if (path === 'people') {
      const params = new URLSearchParams({ type: 'people' });
      if (country && country.toUpperCase() !== 'BR') params.set('country', country);
      navigate(`/explore?${params.toString()}`);
      return;
    }
    if (path === 'businesses') {
      const params = new URLSearchParams();
      if (country && country.toUpperCase() !== 'BR') params.set('country', country);
      navigate(`/business-map${params.toString() ? `?${params}` : ''}`);
      return;
    }
    if (path === 'groups') navigate('/groups');
    if (path === 'events') navigate('/events');
    if (path === 'classifieds') navigate('/classifieds');
    if (path === 'jobs') navigate('/feed?scope=city&type=jobs');
    if (path === 'messages') navigate('/messages');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 p-6 text-white sm:p-8">
        <p className="text-sm font-medium text-brand-100">
          {t('home.greeting', { name: firstName })}
        </p>
        <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
          {t('home.headline', { place })}
        </h1>
        <p className="mt-2 max-w-lg text-brand-100/90">
          {t('home.subtitle')}
        </p>
        <button
          type="button"
          onClick={() => navigate('/feed')}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-800 transition hover:bg-brand-50"
        >
          {t('home.openFeed')}
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('home.whatToDo')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ACTIONS.map(({ key, icon: Icon, path, color }) => (
            <button
              key={key}
              type="button"
              onClick={() => goTo(path)}
              className={cn(
                'flex items-start gap-3 rounded-2xl border bg-white p-4 text-left transition hover:shadow-md',
                'border-slate-200'
              )}
            >
              <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border', color)}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-slate-900">{t(`home.action.${key}`)}</span>
                <span className="mt-0.5 block text-sm text-slate-500">{t(`home.action.${key}Desc`)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
