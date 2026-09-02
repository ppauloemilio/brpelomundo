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

export function RegisterPage() {
  const { t, i18n: i18nInstance } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', username: '', full_name: '', country: 'US' });
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
      await register(form);
      navigate('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      <AuthHero />

      <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16 lg:py-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{t('auth.registerTitle')}</h2>
              <p className="mt-1 text-slate-500">{t('auth.registerSubtitle')}</p>
            </div>
            <div className="flex shrink-0 rounded-full border border-slate-200 bg-white p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => changeLang('pt-BR')}
                className={cn(
                  'rounded-full px-2.5 py-1.5 transition-colors',
                  i18nInstance.language === 'pt-BR' ? 'bg-brand-700 text-white' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                PT
              </button>
              <button
                type="button"
                onClick={() => changeLang('en')}
                className={cn(
                  'rounded-full px-2.5 py-1.5 transition-colors',
                  i18nInstance.language === 'en' ? 'bg-brand-700 text-white' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                EN
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {(['full_name', 'username', 'email', 'password'] as const).map((field) => (
              <div key={field} className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  {t(`auth.${field === 'full_name' ? 'fullName' : field}`)}
                </label>
                <Input
                  type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className="h-11 rounded-xl border-slate-200 bg-white"
                  required
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">{t('auth.country')}</label>
              <select
                className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              >
                <option value="BR">Brasil</option>
                <option value="US">Estados Unidos</option>
                <option value="PT">Portugal</option>
                <option value="CA">Canadá</option>
                <option value="UK">Reino Unido</option>
                <option value="DE">Alemanha</option>
              </select>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-2 h-12 w-full text-base" disabled={loading}>
              {loading ? t('common.loading') : t('auth.joinFree')}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {t('auth.hasAccount')}{' '}
            <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => navigate('/login')}>
              {t('auth.login')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
