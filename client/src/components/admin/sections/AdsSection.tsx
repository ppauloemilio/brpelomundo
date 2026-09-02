import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, assetUrl, uploadFile } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';

type Ad = {
  id: string; title: string; image_url: string; link_url?: string;
  description?: string; is_active: number; order_num: number;
};

export function AdsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [adForm, setAdForm] = useState({ title: '', image_url: '', link_url: '', description: '', order_num: 0 });

  const { data: ads = [], isLoading } = useQuery({
    queryKey: ['admin-ads'],
    queryFn: () => api<Ad[]>('/admin/advertisements'),
  });

  const createAd = useMutation({
    mutationFn: () => api('/admin/advertisements', { method: 'POST', body: JSON.stringify({ ...adForm, is_active: true }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-ads'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
      setAdForm({ title: '', image_url: '', link_url: '', description: '', order_num: 0 });
    },
  });

  const toggleAd = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api(`/admin/advertisements/${id}`, { method: 'PATCH', body: JSON.stringify({ is_active }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-ads'] }),
  });

  const deleteAd = useMutation({
    mutationFn: (id: string) => api(`/admin/advertisements/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-ads'] }),
  });

  const handleAdImage = async (file: File) => {
    const { url } = await uploadFile(file);
    setAdForm((f) => ({ ...f, image_url: url }));
  };

  if (isLoading) return <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="font-semibold">{t('admin.newAd')}</h2>
          <Input placeholder={t('admin.adTitle')} value={adForm.title} onChange={(e) => setAdForm({ ...adForm, title: e.target.value })} />
          <Input placeholder="URL da imagem" value={adForm.image_url} onChange={(e) => setAdForm({ ...adForm, image_url: e.target.value })} />
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleAdImage(e.target.files[0])} />
          <Input placeholder={t('admin.adLink')} value={adForm.link_url} onChange={(e) => setAdForm({ ...adForm, link_url: e.target.value })} />
          <Button onClick={() => createAd.mutate()} disabled={!adForm.title || !adForm.image_url || createAd.isPending}>
            {t('admin.createAd')}
          </Button>
        </CardContent>
      </Card>
      {ads.map((ad) => (
        <Card key={ad.id}>
          <CardContent className="flex items-center justify-between gap-4 pt-4">
            <div className="flex min-w-0 items-center gap-3">
              <img src={assetUrl(ad.image_url) ?? ad.image_url} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
              <div className="min-w-0">
                <p className="truncate font-medium">{ad.title}</p>
                <p className="text-xs text-slate-500">{ad.is_active ? t('admin.active') : t('admin.inactive')}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant={ad.is_active ? 'outline' : 'default'} onClick={() => toggleAd.mutate({ id: ad.id, is_active: !ad.is_active })}>
                {ad.is_active ? t('admin.deactivate') : t('admin.activate')}
              </Button>
              <Button size="sm" variant="destructive" onClick={() => deleteAd.mutate(ad.id)}>{t('common.delete')}</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
