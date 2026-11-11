import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { AuthHero } from '@/components/auth/AuthHero';
import { LegalFooter } from '@/components/legal/LegalFooter';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setDone(true);
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
        <div className="mx-auto w-full max-w-md space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t('auth.forgotTitle')}</h2>
            <p className="mt-1 text-slate-500">{t('auth.forgotSubtitle')}</p>
          </div>

          {done ? (
            <div className="space-y-4">
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
                {t('auth.forgotSent')}
              </p>
              <Link to="/login" className="text-sm font-medium text-brand-700 hover:underline">
                {t('auth.backToLogin')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="forgot-email" className="text-sm font-medium text-slate-700">
                  {t('auth.email')}
                </label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-xl border-slate-200 bg-white"
                  required
                />
              </div>
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="h-12 w-full" disabled={loading}>
                {loading ? t('common.loading') : t('auth.forgotSubmit')}
              </Button>
              <p className="text-center text-sm text-slate-500">
                <Link to="/login" className="font-medium text-brand-700 hover:underline">
                  {t('auth.backToLogin')}
                </Link>
              </p>
            </form>
          )}
          <LegalFooter />
        </div>
      </div>
    </div>
  );
}
