import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { BUSINESS_CATEGORIES } from '@/lib/utils';

function LocationPicker({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onSelect(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

export function CreateBusinessPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', category: 'restaurant', country: 'US', address: '', city: '',
    latitude: 40.7128, longitude: -74.006, whatsapp: '',
  });

  const mutation = useMutation({
    mutationFn: () => api('/businesses', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        category: form.category,
        country: form.country,
        address: form.address,
        city: form.city,
        latitude: form.latitude,
        longitude: form.longitude,
        social_links: form.whatsapp ? { whatsapp: form.whatsapp } : {},
      }),
    }),
    onSuccess: () => navigate('/my-businesses'),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader><CardTitle>{t('business.create')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder={t('business.name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {BUSINESS_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Input placeholder={t('business.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input placeholder={t('business.city')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input placeholder="WhatsApp (+1...)" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
          <p className="text-sm text-slate-500">Clique no mapa para definir a localização</p>
          <div className="h-64 rounded-lg overflow-hidden">
            <MapContainer center={[form.latitude, form.longitude]} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <LocationPicker onSelect={(lat, lng) => setForm({ ...form, latitude: lat, longitude: lng })} />
              <Marker position={[form.latitude, form.longitude]} />
            </MapContainer>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
            <Button onClick={() => mutation.mutate()} disabled={!form.name.trim()}>{t('common.save')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
