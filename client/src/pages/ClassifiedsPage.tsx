import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Star, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { COUNTRY_LABELS, cn } from '@/lib/utils';
import { ReportButton, ReviewsSection } from '@/components/trust/ReviewsSection';

type Listing = {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number | null;
  currency: string;
  condition_label: string;
  city: string;
  country: string;
  contact_whatsapp?: string;
  seller_id: string;
  seller_name: string;
  seller_avatar?: string | null;
  seller_verified?: number;
  status: string;
  rating_avg: number;
  rating_count: number;
  is_featured?: boolean;
};

type ClassifiedQuota = { used: number; max: number; can_create: boolean; premium: boolean };

const CATEGORIES = [
  'furniture', 'electronics', 'cars', 'clothes', 'real_estate',
  'brazilian_products', 'services', 'baby', 'home', 'other',
] as const;

export function ClassifiedsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [createError, setCreateError] = useState<string | null>(null);
  const country = user?.profile?.current_country || '';
  const city = user?.profile?.current_city || '';
  const [showCreate, setShowCreate] = useState(false);
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<Listing | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'furniture',
    price: '',
    currency: 'USD',
    condition_label: 'used',
    city: city || '',
    country: country || 'US',
    contact_whatsapp: '',
  });

  const query = useMemo(() => {
    const params = new URLSearchParams({ status: 'active' });
    if (country && country.toUpperCase() !== 'BR') params.set('country', country);
    if (category) params.set('category', category);
    return params.toString();
  }, [country, category]);

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ['classifieds', query],
    queryFn: () => api<Listing[]>(`/classifieds?${query}`),
  });

  const { data: quota } = useQuery({
    queryKey: ['classifieds-quota'],
    queryFn: () => api<ClassifiedQuota>('/classifieds/quota'),
  });

  const createListing = useMutation({
    mutationFn: () =>
      api('/classifieds', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          price: form.price === '' ? null : Number(form.price),
        }),
      }),
    onSuccess: () => {
      setCreateError(null);
      qc.invalidateQueries({ queryKey: ['classifieds'] });
      qc.invalidateQueries({ queryKey: ['classifieds-quota'] });
      setShowCreate(false);
      setForm({
        title: '', description: '', category: 'furniture', price: '', currency: 'USD',
        condition_label: 'used', city: city || '', country: country || 'US', contact_whatsapp: '',
      });
    },
    onError: (err: Error) => setCreateError(err.message || t('classifieds.limitReached')),
  });

  const markSold = useMutation({
    mutationFn: (id: string) =>
      api(`/classifieds/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'sold' }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['classifieds'] });
      setSelected(null);
    },
  });

  const formatPrice = (listing: Listing) => {
    if (listing.price == null) return t('classifieds.priceOnRequest');
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: listing.currency || 'USD',
        maximumFractionDigits: 0,
      }).format(listing.price);
    } catch {
      return `${listing.currency} ${listing.price}`;
    }
  };

  if (selected) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 pb-10">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          ← {t('classifieds.back')}
        </Button>
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-900">{selected.title}</h1>
                  {selected.is_featured && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      {t('classifieds.featured')}
                    </span>
                  )}
                  {selected.status === 'sold' && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {t('classifieds.sold')}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-lg font-semibold text-brand-700">{formatPrice(selected)}</p>
                <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                  <MapPin className="h-3.5 w-3.5" />
                  {selected.city}, {COUNTRY_LABELS[selected.country] || selected.country}
                </p>
              </div>
              <ReportButton targetType="classified" targetId={selected.id} />
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                {t(`classifieds.category.${selected.category}`)}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                {t(`classifieds.condition.${selected.condition_label}`)}
              </span>
              {selected.rating_count > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {selected.rating_avg} ({selected.rating_count})
                </span>
              )}
            </div>

            {selected.description && (
              <p className="text-sm leading-relaxed text-slate-600">{selected.description}</p>
            )}

            <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
              <Avatar name={selected.seller_name} src={selected.seller_avatar} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">{t('classifieds.seller')}</p>
                <p className="font-medium text-slate-900">
                  {selected.seller_name}
                  {!!selected.seller_verified && (
                    <span className="ml-2 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                      {t('trust.verified')}
                    </span>
                  )}
                </p>
              </div>
              {selected.contact_whatsapp && selected.status === 'active' && (
                <a
                  href={`https://wa.me/${selected.contact_whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  WhatsApp
                </a>
              )}
            </div>

            {user?.id === selected.seller_id && selected.status === 'active' && (
              <Button variant="outline" onClick={() => markSold.mutate(selected.id)}>
                {t('classifieds.markSold')}
              </Button>
            )}

            <ReviewsSection
              targetType="classified"
              targetId={selected.id}
              ownerId={selected.seller_id}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('classifieds.title')}</h1>
          <p className="mt-1 text-slate-500">
            {t('classifieds.subtitle', { place: city || COUNTRY_LABELS[country] || t('home.yourArea') })}
          </p>
        </div>
        <Button onClick={() => { setCreateError(null); setShowCreate((v) => !v); }}>
          <Plus className="h-4 w-4" />
          {t('classifieds.create')}
        </Button>
      </div>

      {quota && (
        <p className="text-sm text-slate-500">
          {t('classifieds.quota', { used: quota.used, max: quota.max })}
          {!quota.can_create && (
            <button type="button" className="ml-2 font-medium text-brand-700 hover:underline" onClick={() => navigate('/pricing')}>
              {t('classifieds.upgradeQuota')}
            </button>
          )}
        </p>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCategory('')}
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium',
            !category ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
          )}
        >
          {t('classifieds.allCategories')}
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium',
              category === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
            )}
          >
            {t(`classifieds.category.${c}`)}
          </button>
        ))}
      </div>

      {showCreate && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <Input
              placeholder={t('classifieds.listingTitle')}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <Textarea
              placeholder={t('classifieds.description')}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t(`classifieds.category.${c}`)}</option>
                ))}
              </select>
              <select
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={form.condition_label}
                onChange={(e) => setForm({ ...form, condition_label: e.target.value })}
              >
                {['new', 'like_new', 'used'].map((c) => (
                  <option key={c} value={c}>{t(`classifieds.condition.${c}`)}</option>
                ))}
              </select>
              <Input
                type="number"
                placeholder={t('classifieds.price')}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              <Input
                placeholder={t('classifieds.currency')}
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              />
              <Input
                placeholder={t('classifieds.city')}
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
              <Input
                placeholder="WhatsApp"
                value={form.contact_whatsapp}
                onChange={(e) => setForm({ ...form, contact_whatsapp: e.target.value })}
              />
            </div>
            {createError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {createError}
                <button type="button" className="ml-2 font-semibold underline" onClick={() => navigate('/pricing')}>
                  {t('billing.goToPricing')}
                </button>
              </div>
            )}
            <Button
              disabled={!form.title.trim() || createListing.isPending || quota?.can_create === false}
              onClick={() => createListing.mutate()}
            >
              {t('classifieds.publish')}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-center text-slate-500">{t('common.loading')}</p>
      ) : listings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Tag className="h-10 w-10 text-slate-300" />
            <p className="font-medium text-slate-700">{t('classifieds.empty')}</p>
            <p className="text-sm text-slate-500">{t('classifieds.emptyHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {listings.map((listing) => (
            <button
              key={listing.id}
              type="button"
              onClick={() => setSelected(listing)}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="line-clamp-2 font-semibold text-slate-900">{listing.title}</h2>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {listing.is_featured && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      {t('classifieds.featured')}
                    </span>
                  )}
                {!!listing.seller_verified && (
                  <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                    {t('trust.verified')}
                  </span>
                )}
                </div>
              </div>
              <p className="mt-1 font-semibold text-brand-700">{formatPrice(listing)}</p>
              <p className="mt-1 text-xs text-slate-500">
                {t(`classifieds.category.${listing.category}`)} · {listing.city}
              </p>
              {listing.rating_count > 0 && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-amber-700">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {listing.rating_avg} ({listing.rating_count})
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
