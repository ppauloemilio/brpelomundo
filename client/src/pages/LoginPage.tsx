import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import i18n from '@/i18n';
import { useAuth } from '@/hooks/useAuth';
import { AuthHero } from '@/components/auth/AuthHero';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

export function LoginPage() {
  const { t, i18n: i18nInstance } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const changeLang = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('comunidade_lang', lang);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail('ana@demo.com');
    setPassword('demo123');
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      <AuthHero />

      <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16 lg:py-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{t('auth.welcomeBack')}</h2>
              <p className="mt-1 text-slate-500">{t('auth.loginSubtitle')}</p>
            </div>
            <div className="flex shrink-0 rounded-full border border-slate-200 bg-white p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => changeLang('pt-BR')}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 transition-colors',
                  i18nInstance.language === 'pt-BR' ? 'bg-brand-700 text-white' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                PT
              </button>
              <button
                type="button"
                onClick={() => changeLang('en')}
                className={cn(
                  'flex items-center gap-1 rounded-full px-2.5 py-1.5 transition-colors',
                  i18nInstance.language === 'en' ? 'bg-brand-700 text-white' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                EN
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-sm font-medium text-slate-700">
                {t('auth.email')}
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl border-slate-200 bg-white"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-sm font-medium text-slate-700">
                {t('auth.password')}
              </label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-xl border-slate-200 bg-white"
                required
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={loading}>
              {loading ? t('common.loading') : t('auth.enterCommunity')}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <div className="mt-8 rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
            <p className="font-semibold text-slate-900">{t('auth.joinCta')}</p>
            <p className="mt-1 text-sm text-slate-600">{t('auth.joinCtaDesc')}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full border-brand-200 bg-white hover:bg-brand-50"
              onClick={() => navigate('/register')}
            >
              {t('auth.joinFree')}
            </Button>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            {t('auth.demoHint')}{' '}
            <button type="button" onClick={fillDemo} className="font-medium text-brand-700 hover:underline">
              {t('auth.demoFill')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
