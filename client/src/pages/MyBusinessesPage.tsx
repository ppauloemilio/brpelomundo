import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Plus, Pencil } from 'lucide-react';

type Business = {
  id: string;
  name: string;
  category: string;
  country: string;
  address: string;
  is_active: number;
};

export function MyBusinessesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ['my-businesses'],
    queryFn: () => api<Business[]>('/businesses/mine'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('business.mine')}</h1>
        <Button onClick={() => navigate('/create-business')}>
          <Plus className="h-4 w-4" />{t('business.create')}
        </Button>
      </div>
      {isLoading ? (
        <p>{t('common.loading')}</p>
      ) : businesses.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-slate-500">{t('business.noBusinesses')}</CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {businesses.map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {b.name}
                  <Badge>{b.category}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-500">{b.address || b.country}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate(`/edit-business/${b.id}`)}>
                  <Pencil className="h-3 w-3" />{t('business.edit')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
