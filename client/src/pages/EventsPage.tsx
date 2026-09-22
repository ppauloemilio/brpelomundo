import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, MapPin, Plus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent } from '@/components/ui/Card';
import { COUNTRY_LABELS } from '@/lib/utils';

type CommunityEvent = {
  id: string;
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  location_name: string;
  address: string;
  city: string;
  country: string;
  interest_count: number;
  interested_by_me: boolean;
  is_sponsored?: boolean;
  organizer_name: string;
  whatsapp?: string;
  external_link?: string;
};

export function EventsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const country = user?.profile?.current_country || '';
  const city = user?.profile?.current_city || '';
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    event_date: '',
    event_time: '',
    location_name: '',
    address: '',
    city: city || '',
    country: country || 'US',
    whatsapp: '',
  });

  const query = useMemo(() => {
    const params = new URLSearchParams({ scope: 'upcoming' });
    if (country && country.toUpperCase() !== 'BR') params.set('country', country);
    return params.toString();
  }, [country]);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', query],
    queryFn: () => api<CommunityEvent[]>(`/events?${query}`),
  });

  const createEvent = useMutation({
    mutationFn: () => api('/events', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] });
      setShowCreate(false);
      setForm({
        title: '', description: '', event_date: '', event_time: '',
        location_name: '', address: '', city: city || '', country: country || 'US', whatsapp: '',
      });
    },
  });

  const toggleInterest = useMutation({
    mutationFn: ({ id, interested }: { id: string; interested: boolean }) =>
      api(`/events/${id}/interest`, { method: interested ? 'DELETE' : 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['events'] }),
  });

  const formatDate = (date: string, time?: string) => {
    const d = new Date(`${date}T${time || '12:00'}`);
    return d.toLocaleDateString(i18n.language, {
      weekday: 'short', day: 'numeric', month: 'short',
    }) + (time ? ` · ${time}` : '');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('events.title')}</h1>
          <p className="mt-1 text-slate-500">
            {t('events.subtitle', { place: city || COUNTRY_LABELS[country] || t('home.yourArea') })}
          </p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus className="h-4 w-4" />
          {t('events.create')}
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <Input placeholder={t('events.eventTitle')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Textarea placeholder={t('events.description')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
              <Input type="time" value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} />
            </div>
            <Input placeholder={t('events.location')} value={form.location_name} onChange={(e) => setForm({ ...form, location_name: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input placeholder={t('events.city')} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <select className="flex h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {Object.entries(COUNTRY_LABELS).filter(([c]) => c !== 'BR').map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
            <Input placeholder={t('events.whatsapp')} value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>{t('common.cancel')}</Button>
              <Button
                disabled={!form.title.trim() || !form.event_date || !form.city.trim() || createEvent.isPending}
                onClick={() => createEvent.mutate()}
              >
                {t('common.save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-slate-500">{t('common.loading')}</p>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-500">
            <p>{t('events.empty')}</p>
            <p className="mt-2 text-sm text-slate-400">{t('events.emptyHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <article key={ev.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700">
                    <Calendar className="h-4 w-4" />
                    {formatDate(ev.event_date, ev.event_time)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">{ev.title}</h2>
                    {ev.is_sponsored && (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-800">
                        {t('events.sponsored')}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                    <MapPin className="h-3.5 w-3.5" />
                    {[ev.location_name, ev.city].filter(Boolean).join(' · ')}
                    {', '}
                    {COUNTRY_LABELS[ev.country] || ev.country}
                  </p>
                  {ev.description && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{ev.description}</p>}
                  <p className="mt-2 text-xs text-slate-500">
                    {t('events.organizedBy', { name: ev.organizer_name })}
                    {' · '}
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {t('events.interestedCount', { count: ev.interest_count })}
                    </span>
                  </p>
                  {ev.whatsapp && (
                    <a
                      href={`https://wa.me/${ev.whatsapp.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-sm font-medium text-brand-700 hover:underline"
                    >
                      WhatsApp
                    </a>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={ev.interested_by_me ? 'outline' : 'default'}
                  className="shrink-0 rounded-full"
                  onClick={() => toggleInterest.mutate({ id: ev.id, interested: ev.interested_by_me })}
                >
                  {ev.interested_by_me ? t('events.interested') : t('events.imInterested')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
