import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { TermsConsent } from '@/components/legal/LegalFooter';

export function AcceptTermsGate() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!user || user.terms_accepted !== false) return null;

  const submit = async () => {
    if (!accepted) {
      setError(t('auth.acceptTermsRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api('/auth/accept-terms', {
        method: 'POST',
        body: JSON.stringify({ accepted: true }),
      });
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-slate-900">{t('auth.acceptTermsTitle')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('auth.acceptTermsBody')}</p>
        <div className="mt-4">
          <TermsConsent checked={accepted} onChange={setAccepted} />
        </div>
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <Button className="mt-4 h-11 w-full" disabled={loading || !accepted} onClick={submit}>
          {loading ? t('common.loading') : t('auth.acceptTermsSubmit')}
        </Button>
      </div>
    </div>
  );
}
