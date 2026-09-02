import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { BUSINESS_CATEGORIES } from '@/lib/utils';

function LocationPicker({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onSelect(e.latlng.lat, e.latlng.lng); } });
  return null;
}

type BusinessForm = {
  name: string;
  category: string;
  country: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  social_links?: { whatsapp?: string };
};

export function EditBusinessPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', category: 'restaurant', country: 'US', address: '', city: '',
    latitude: 40.7128, longitude: -74.006, whatsapp: '',
  });

  const { data } = useQuery({
    queryKey: ['business', id],
    queryFn: () => api<BusinessForm>(`/businesses/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name,
        category: data.category,
        country: data.country,
        address: data.address || '',
        city: data.city || '',
        latitude: data.latitude || 40.7128,
        longitude: data.longitude || -74.006,
        whatsapp: data.social_links?.whatsapp || '',
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => api(`/businesses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: form.name,
        category: form.category,
        country: form.country,
        address: form.address,
        city: form.city,
        latitude: form.latitude,
        longitude: form.longitude,
        social_links: {
          ...(data?.social_links || {}),
          whatsapp: form.whatsapp || undefined,
        },
      }),
    }),
    onSuccess: () => navigate('/my-businesses'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/businesses/${id}`, { method: 'DELETE' }),
    onSuccess: () => navigate('/my-businesses'),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader><CardTitle>{t('business.edit')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {BUSINESS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t('business.address')} />
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder={t('business.city')} />
          <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="WhatsApp (+1...)" />
          <div className="h-64 rounded-lg overflow-hidden">
            <MapContainer center={[form.latitude, form.longitude]} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <LocationPicker onSelect={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })} />
              <Marker position={[form.latitude, form.longitude]} />
            </MapContainer>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => mutation.mutate()}>{t('common.save')}</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()}>{t('common.delete')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
