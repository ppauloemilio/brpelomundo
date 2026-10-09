import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import i18n from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { AuthHero } from '@/components/auth/AuthHero';
import { LegalFooter, TermsConsent } from '@/components/legal/LegalFooter';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

export function RegisterPage() {
  const { t, i18n: i18nInstance } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', username: '', full_name: '', country: 'US' });
  const [accepted, setAccepted] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: countries = [] } = useQuery({
    queryKey: ['geo-countries'],
    queryFn: () => api<Array<{ code: string; name: string }>>('/geo/countries'),
  });

  const sortedCountries = useMemo(() => {
    const locale = i18nInstance.language.startsWith('pt') ? 'pt-BR' : 'en';
    return [...countries].sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [countries, i18nInstance.language]);

  const changeLang = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('comunidade_lang', lang);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (!accepted) {
      setError(t('auth.acceptTermsRequired'));
      setLoading(false);
      return;
    }
    try {
      const res = await register({ ...form, terms_accepted: true });
      setPendingEmail(res.email);
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

          {pendingEmail ? (
            <div className="space-y-4 rounded-2xl border border-brand-100 bg-white p-5">
              <h3 className="text-lg font-semibold text-slate-900">{t('auth.checkEmailTitle')}</h3>
              <p className="text-sm leading-relaxed text-slate-600">{t('auth.checkEmailBody', { email: pendingEmail })}</p>
              {resent && <p className="text-sm text-brand-800">{t('auth.resendSent')}</p>}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={async () => {
                  await api('/auth/resend-verification', {
                    method: 'POST',
                    body: JSON.stringify({ email: pendingEmail }),
                  });
                  setResent(true);
                }}
              >
                {t('auth.resendEmail')}
              </Button>
            </div>
          ) : (
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
                required
              >
                {sortedCountries.length === 0 ? (
                  <option value="US">{t('common.loading')}</option>
                ) : (
                  sortedCountries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <TermsConsent checked={accepted} onChange={setAccepted} />

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-2 h-12 w-full text-base" disabled={loading || !accepted}>
              {loading ? t('common.loading') : t('auth.joinFree')}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </Button>
          </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            {t('auth.hasAccount')}{' '}
            <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => navigate('/login')}>
              {t('auth.login')}
            </button>
          </p>
          <LegalFooter className="mt-8" />
        </div>
      </div>
    </div>
  );
}
