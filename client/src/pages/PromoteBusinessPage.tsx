import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function PromoteBusinessPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: businesses = [] } = useQuery({
    queryKey: ['my-businesses'],
    queryFn: () => api<Array<{ id: string; name: string; is_featured?: number }>>('/businesses/mine'),
  });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">{t('business.promote')}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('billing.promoteBusinessTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">{t('billing.promoteBusinessHint')}</p>
          <Button className="w-full" onClick={() => navigate('/pricing')}>
            {t('billing.goToPricing')}
          </Button>
          {businesses.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <span>{b.name}</span>
              {!!b.is_featured && (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
                  {t('admin.featured')}
                </span>
              )}
            </div>
          ))}
          {businesses.length === 0 && (
            <Button variant="outline" onClick={() => navigate('/create-business')}>{t('business.create')}</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
