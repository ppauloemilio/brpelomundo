import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, setToken } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { Card, CardContent } from '@/components/ui/Card';

export function SetupPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { refreshUser } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const { data: invite, isLoading, error } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<{ email: string; full_name: string }>(`/auth/invite/${token}`),
    enabled: !!token,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api<{ token: string; user: { is_admin?: boolean } }>('/auth/setup-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      }),
    onSuccess: async (res) => {
      setToken(res.token);
      await refreshUser();
      navigate(res.user?.is_admin ? '/admin' : '/home');
    },
  });

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md w-full"><CardContent className="py-8 text-center text-slate-600">{t('setupPassword.invalidLink')}</CardContent></Card>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">{t('common.loading')}</div>;
  }

  if (error || !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="max-w-md w-full"><CardContent className="py-8 text-center text-slate-600">{t('setupPassword.expired')}</CardContent></Card>
      </div>
    );
  }

  const canSubmit = password.length >= 6 && password === confirm;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 pt-6">
          <h1 className="text-xl font-bold">{t('setupPassword.title')}</h1>
          <p className="text-sm text-slate-600">{t('setupPassword.greetingReset', { name: invite.full_name })}</p>
          <p className="text-sm text-slate-500">{invite.email}</p>
          <div>
            <FieldLabel className="mb-1 block" required>{t('auth.password')}</FieldLabel>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div>
            <FieldLabel className="mb-1 block" required>{t('setupPassword.confirm')}</FieldLabel>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          <Button className="w-full" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? t('common.loading') : t('setupPassword.submit')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
