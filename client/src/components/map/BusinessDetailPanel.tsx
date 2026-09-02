import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight, MapPin, Star, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { categoryLabel } from '@/components/map/MapBusinessFilters';
import { useCountryNameMap } from '@/components/explore/ExploreGeoFilters';
import { COUNTRY_LABELS } from '@/lib/utils';
import { ReportButton, ReviewsSection } from '@/components/trust/ReviewsSection';

export type BusinessDetail = {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  address: string;
  city: string;
  state: string;
  country: string;
  owner_id: string;
  owner_name: string;
  owner_username: string;
  owner_avatar_url: string | null;
  is_verified?: boolean;
  rating_avg?: number;
  rating_count?: number;
  social_links?: { whatsapp?: string; instagram?: string; website?: string };
};

function formatAddress(b: BusinessDetail, countryName: string) {
  return [b.address, b.city, b.state, countryName].filter(Boolean).join(', ');
}

type Props = {
  businessId: string;
  onClose: () => void;
};

export function BusinessDetailPanel({ businessId, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const countryNames = useCountryNameMap();

  const { data: business, isLoading } = useQuery({
    queryKey: ['business-detail', businessId],
    queryFn: () => api<BusinessDetail>(`/businesses/${businessId}`),
  });

  if (isLoading) {
    return (
      <aside className="flex h-full min-h-[480px] w-full flex-col rounded-xl border border-slate-200 bg-white lg:w-96">
        <p className="p-6 text-sm text-slate-500">{t('common.loading')}</p>
      </aside>
    );
  }

  if (!business) return null;

  const countryName = countryNames[business.country] || COUNTRY_LABELS[business.country] || business.country;
  const contactAddress = formatAddress(business, countryName);

  const goToOwnerProfile = () => {
    if (!business.owner_id) return;
    if (user?.id === business.owner_id) {
      navigate('/profile');
      return;
    }
    navigate(`/user/${business.owner_id}`);
  };

  return (
    <aside className="relative z-[1001] flex h-full max-h-[480px] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:w-96">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        aria-label={t('common.close')}
      >
        <X className="h-5 w-5" />
      </button>

      <div className="overflow-y-auto p-5 pt-10">
        <div className="flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
            <Building2 className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <h2 className="text-xl font-bold text-slate-900">
              {business.name}
              {business.is_verified && (
                <span className="ml-2 align-middle rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
                  {t('trust.verified')}
                </span>
              )}
            </h2>
            <span className="mt-1.5 inline-block rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
              {categoryLabel(business.category)}
            </span>
            {(business.rating_count ?? 0) > 0 && (
              <p className="mt-2 inline-flex items-center gap-1 text-sm text-amber-700">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {business.rating_avg} ({business.rating_count})
              </p>
            )}
            {business.tagline && (
              <p className="mt-2 text-sm text-slate-600">{business.tagline}</p>
            )}
            <div className="mt-2">
              <ReportButton targetType="business" targetId={business.id} />
            </div>
          </div>
        </div>

        {business.description && (
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">{t('map.about')}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{business.description}</p>
          </section>
        )}

        {contactAddress && (
          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">{t('map.contact')}</h3>
            <div className="mt-2 flex items-start gap-2 text-sm text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span>{contactAddress}</span>
            </div>
            {business.social_links?.whatsapp && (
              <a
                href={`https://wa.me/${business.social_links.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                WhatsApp
              </a>
            )}
            {business.social_links?.instagram && (
              <p className="mt-2 text-sm text-slate-500">{business.social_links.instagram}</p>
            )}
          </section>
        )}

        <div className="my-6 border-t border-slate-100" />

        <ReviewsSection
          targetType="business"
          targetId={business.id}
          ownerId={business.owner_id}
          compact
        />

        <div className="my-6 border-t border-slate-100" />

        <button
          type="button"
          onClick={goToOwnerProfile}
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-slate-50"
        >
          <Avatar name={business.owner_name} src={business.owner_avatar_url} className="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">{t('map.owner')}</p>
            <p className="truncate font-semibold text-brand-700 hover:underline">{business.owner_name}</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
        </button>
      </div>
    </aside>
  );
}
