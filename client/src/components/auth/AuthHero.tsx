import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Users, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { AppLogo } from '@/components/ui/AppLogo';

const VALUE_KEYS = [
  { icon: Users, titleKey: 'auth.valueConnect', descKey: 'auth.valueConnectDesc' },
  { icon: MapPin, titleKey: 'auth.valueDiscover', descKey: 'auth.valueDiscoverDesc' },
  { icon: Sparkles, titleKey: 'auth.valueShare', descKey: 'auth.valueShareDesc' },
] as const;

const FALLBACK_COUNTRIES = ['BR', 'DE', 'PT', 'US'];

export function AuthHero() {
  const { t } = useTranslation();

  const { data: countries = FALLBACK_COUNTRIES } = useQuery({
    queryKey: ['registered-countries'],
    queryFn: () => api<string[]>('/stats/registered-countries'),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex min-h-[min(100vh,920px)] flex-col bg-brand-900 px-8 py-10 text-white lg:min-h-screen lg:px-12 lg:py-12">
      <div className="flex items-center gap-4">
        <AppLogo className="h-14 w-14 shrink-0 lg:h-16 lg:w-16" />
        <div>
          <p className="text-xl font-bold leading-tight lg:text-[1.35rem]">{t('app.name')}</p>
          <p className="mt-0.5 text-sm text-white/75">{t('app.tagline')}</p>
        </div>
      </div>

      <div className="mt-10 flex flex-1 flex-col justify-center lg:mt-12">
        <h1 className="max-w-lg text-[1.75rem] font-bold leading-tight tracking-tight lg:text-4xl">
          {t('auth.loginHeadline')}
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-white/80 lg:text-[1.05rem]">
          {t('auth.loginSubheadline')}
        </p>

        <ul className="mt-10 space-y-5 lg:mt-12">
          {VALUE_KEYS.map(({ icon: Icon, titleKey, descKey }) => (
            <li key={titleKey} className="flex gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
                <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2} />
              </span>
              <div>
                <p className="font-semibold text-white">{t(titleKey)}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-white/70">{t(descKey)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-2 lg:mt-12">
        {countries.map((code) => (
          <span
            key={code}
            title={code}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold tracking-wide text-white"
            aria-label={code}
          >
            {code}
          </span>
        ))}
        <span className="ml-1 text-sm text-white/80">{t('auth.countriesHint')}</span>
      </div>
    </div>
  );
}
