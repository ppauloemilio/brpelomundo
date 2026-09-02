import { useTranslation } from 'react-i18next';
import { Globe, MapPin, Users, Sparkles } from 'lucide-react';

const FLAGS = ['🇧🇷', '🇺🇸', '🇵🇹', '🇩🇪', '🇨🇦', '🇬🇧'];

const VALUE_KEYS = [
  { icon: Users, titleKey: 'auth.valueConnect', descKey: 'auth.valueConnectDesc' },
  { icon: MapPin, titleKey: 'auth.valueDiscover', descKey: 'auth.valueDiscoverDesc' },
  { icon: Sparkles, titleKey: 'auth.valueShare', descKey: 'auth.valueShareDesc' },
] as const;

export function AuthHero() {
  const { t } = useTranslation();

  return (
    <div className="relative flex h-full min-h-[280px] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-8 text-white lg:min-h-0 lg:p-12">
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />

      <div className="relative">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <Globe className="h-6 w-6 text-white" />
          </span>
          <div>
            <p className="text-lg font-bold leading-tight">{t('app.name')}</p>
            <p className="text-sm text-brand-100">{t('app.tagline')}</p>
          </div>
        </div>

        <h1 className="max-w-md text-3xl font-bold leading-tight tracking-tight lg:text-4xl">
          {t('auth.loginHeadline')}
        </h1>
        <p className="mt-4 max-w-sm text-base leading-relaxed text-brand-100/90">
          {t('auth.loginSubheadline')}
        </p>
      </div>

      <ul className="relative mt-8 hidden space-y-4 lg:block">
        {VALUE_KEYS.map(({ icon: Icon, titleKey, descKey }) => (
          <li key={titleKey} className="flex gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Icon className="h-4 w-4 text-brand-100" />
            </span>
            <div>
              <p className="font-semibold text-white">{t(titleKey)}</p>
              <p className="text-sm text-brand-100/80">{t(descKey)}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="relative mt-8 flex flex-wrap items-center gap-2">
        {FLAGS.map((flag) => (
          <span
            key={flag}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg backdrop-blur-sm"
            aria-hidden
          >
            {flag}
          </span>
        ))}
        <span className="ml-1 text-sm text-brand-100/90">{t('auth.countriesHint')}</span>
      </div>
    </div>
  );
}
