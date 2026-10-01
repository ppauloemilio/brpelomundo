import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useAuth } from '@/hooks/useAuth';
import { AppLogo } from '@/components/ui/AppLogo';
import { LegalFooter } from '@/components/legal/LegalFooter';
import { cn } from '@/lib/utils';

const pages: Record<string, { titleKey: string; bodyKey: string }> = {
  '/sobre': { titleKey: 'legal.aboutTitle', bodyKey: 'legal.aboutBody' },
  '/privacidade': { titleKey: 'legal.privacyTitle', bodyKey: 'legal.privacyBody' },
  '/termos': { titleKey: 'legal.termsTitle', bodyKey: 'legal.termsBody' },
  '/seguranca': { titleKey: 'legal.safetyTitle', bodyKey: 'legal.safetyBody' },
};

export function LegalPage() {
  const { t, i18n: i18nInstance } = useTranslation();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const page = pages[pathname] ?? pages['/sobre'];
  const paragraphs = t(page.bodyKey, { returnObjects: true });
  const body = Array.isArray(paragraphs) ? paragraphs : [String(paragraphs)];

  const changeLang = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('comunidade_lang', lang);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to={user ? '/home' : '/login'} className="flex items-center gap-2 font-bold text-brand-800">
            <AppLogo size="sm" src="/logo-bg.png" />
            <span className="text-base">{t('app.name')}</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex rounded-full border border-slate-200 bg-white p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => changeLang('pt-BR')}
                className={cn(
                  'rounded-full px-2.5 py-1.5',
                  i18nInstance.language === 'pt-BR' ? 'bg-brand-700 text-white' : 'text-slate-600'
                )}
              >
                PT
              </button>
              <button
                type="button"
                onClick={() => changeLang('en')}
                className={cn(
                  'rounded-full px-2.5 py-1.5',
                  i18nInstance.language === 'en' ? 'bg-brand-700 text-white' : 'text-slate-600'
                )}
              >
                EN
              </button>
            </div>
            <Link to={user ? '/home' : '/login'} className="text-sm font-semibold text-brand-700 hover:underline">
              {user ? t('legal.backApp') : t('auth.login')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('legal.updated')}</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">{t(page.titleKey)}</h1>
        <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-700">
          {body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <LegalFooter className="mt-10 justify-start" />
      </main>
    </div>
  );
}
