import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, setToken } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { refreshUser } = useAuth();
  const refreshUserRef = useRef(refreshUser);
  refreshUserRef.current = refreshUser;
  const [error, setError] = useState('');
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError(t('auth.verifyFailed'));
      return;
    }
    if (startedFor.current === token) return;
    startedFor.current = token;

    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ token: string }>('/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        setToken(res.token);
        await refreshUserRef.current();
        navigate('/home', { replace: true });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('auth.verifyFailed'));
      }
    })();

    return () => {
      cancelled = true;
      startedFor.current = null;
    };
  }, [token, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 py-8 text-center">
          <h1 className="text-xl font-bold text-slate-900">{t('auth.verifyTitle')}</h1>
          {error ? (
            <>
              <p className="text-sm text-red-700">{error}</p>
              <Button className="w-full" onClick={() => navigate('/login')}>
                {t('auth.login')}
              </Button>
            </>
          ) : (
            <p className="text-sm text-slate-600">{t('common.loading')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
