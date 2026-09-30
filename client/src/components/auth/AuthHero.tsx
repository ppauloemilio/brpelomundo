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
    <div className="flex min-h-screen flex-col justify-between bg-brand-900 px-8 py-10 text-white sm:px-10 lg:px-14 lg:py-12">
      <div>
        <div className="flex items-center gap-4 sm:gap-5">
          <AppLogo className="h-[80px] w-[80px] shrink-0 sm:h-[96px] sm:w-[96px]" />
          <div className="min-w-0 pt-0.5">
            <p className="text-lg font-bold leading-tight sm:text-[1.35rem]">{t('app.name')}</p>
            <p className="mt-1 text-sm leading-snug text-white/70">{t('app.tagline')}</p>
          </div>
        </div>

        <h1 className="mt-10 max-w-[22rem] text-[1.85rem] font-bold leading-[1.12] tracking-tight sm:mt-12 sm:max-w-[24rem] sm:text-[2.15rem] lg:text-[2.25rem]">
          {t('auth.loginHeadline')}
        </h1>
        <p className="mt-5 max-w-[21rem] text-[0.9375rem] leading-relaxed text-white/75 sm:max-w-[23rem] sm:text-base">
          {t('auth.loginSubheadline')}
        </p>

        <ul className="mt-9 space-y-5 sm:mt-10 sm:space-y-6">
          {VALUE_KEYS.map(({ icon: Icon, titleKey, descKey }) => (
            <li key={titleKey} className="flex gap-3 sm:gap-3.5">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2} />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-[0.9375rem] font-semibold leading-snug text-white sm:text-base">
                  {t(titleKey)}
                </p>
                <p className="mt-1 max-w-[19rem] text-sm leading-relaxed text-white/65">
                  {t(descKey)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-2 sm:mt-12">
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
        <span className="ml-1 text-sm text-white/75">{t('auth.countriesHint')}</span>
      </div>
    </div>
  );
}
