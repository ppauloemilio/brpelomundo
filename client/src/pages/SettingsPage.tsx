import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, ChevronRight, Sparkles, CreditCard } from 'lucide-react';
import i18n from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { legalLinks } from '@/components/legal/LegalFooter';

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdOk, setPwdOk] = useState(false);

  const changeLang = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('comunidade_lang', lang);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdOk(false);
    if (newPassword.length < 6) {
      setPwdError(t('settings.passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError(t('settings.passwordMismatch'));
      return;
    }
    setPwdLoading(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwdOk(true);
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">{t('settings.account')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">
            <strong>{user?.full_name}</strong>
            {user?.is_premium && (
              <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
                Premium
              </span>
            )}
          </p>
          <p className="text-sm text-slate-500">{user?.email}</p>
          {user?.is_premium && (
            <p className="text-sm text-brand-700">{t('settings.premiumActive')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('settings.changePassword')}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('settings.currentPassword')}
              </label>
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('settings.newPassword')}
              </label>
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {t('settings.confirmPassword')}
              </label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {pwdError && <p className="text-sm text-red-600">{pwdError}</p>}
            {pwdOk && <p className="text-sm text-emerald-700">{t('settings.passwordChanged')}</p>}
            <Button type="submit" disabled={pwdLoading}>
              {pwdLoading ? t('common.loading') : t('settings.savePassword')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className={user?.is_premium ? 'border-brand-200 bg-brand-50/40' : ''}>
        <CardContent className="flex items-start gap-3 pt-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">{t('settings.premiumPlan')}</p>
            <p className="mt-1 text-sm text-slate-600">{t('settings.premiumBenefits')}</p>
            <Button size="sm" className="mt-3" onClick={() => navigate('/pricing')}>
              <CreditCard className="h-4 w-4" />
              {user?.is_premium ? t('settings.manageBilling') : t('settings.upgradePremium')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {user?.is_admin && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('settings.administration')}</CardTitle></CardHeader>
          <CardContent>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="flex w-full items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3 text-left transition-colors hover:bg-brand-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                <Shield className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-slate-900">{t('nav.admin')}</span>
                <span className="block text-sm text-slate-500">{t('settings.adminHint')}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
            </button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('settings.legal')}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-slate-500">{t('settings.legalHint')}</p>
          <div className="flex flex-col">
            {legalLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="flex items-center justify-between rounded-lg px-2 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                {t(link.labelKey)}
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{t('settings.language')}</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Button variant={i18n.language === 'pt-BR' ? 'default' : 'outline'} onClick={() => changeLang('pt-BR')}>
            Português (BR)
          </Button>
          <Button variant={i18n.language === 'en' ? 'default' : 'outline'} onClick={() => changeLang('en')}>
            English
          </Button>
        </CardContent>
      </Card>
      <Button variant="destructive" onClick={logout}>{t('nav.logout')}</Button>
    </div>
  );
}
