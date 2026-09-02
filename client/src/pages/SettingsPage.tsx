import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Shield, ChevronRight, Sparkles, CreditCard } from 'lucide-react';
import i18n from '@/i18n';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const changeLang = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('comunidade_lang', lang);
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
