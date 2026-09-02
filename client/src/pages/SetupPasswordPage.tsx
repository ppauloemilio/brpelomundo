import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, setToken } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
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
    mutationFn: () => api<{ token: string }>('/auth/setup-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
    onSuccess: async (res) => {
      setToken(res.token);
      await refreshUser();
      navigate('/admin');
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
          <p className="text-sm text-slate-600">{t('setupPassword.greeting', { name: invite.full_name })}</p>
          <p className="text-sm text-slate-500">{invite.email}</p>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('auth.password')}</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('setupPassword.confirm')}</label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <Button className="w-full" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? t('common.loading') : t('setupPassword.submit')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
