import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, Building2, MapPin, Search, User } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { ExploreGeoFilters, useCountryNameMap, type ExploreFilters } from '@/components/explore/ExploreGeoFilters';
import { COUNTRY_LABELS, cn } from '@/lib/utils';

type ExploreUser = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  bio: string;
  current_country: string;
  current_city: string;
  current_state: string;
  primary_skill: string;
  show_city_on_profile: number | boolean;
  is_premium?: boolean;
};

type ExploreBusiness = {
  id: string;
  name: string;
  category: string;
  country: string;
  address: string;
  owner_name: string;
  owner_username: string;
};

function buildExploreQuery(
  type: 'people' | 'businesses',
  q: string,
  filters: ExploreFilters
) {
  const params = new URLSearchParams();
  params.set('type', type);
  if (q) params.set('q', q);
  if (filters.country) params.set('country', filters.country);
  if (filters.state) params.set('state', filters.state);
  if (filters.city) params.set('city', filters.city);
  if (filters.area) params.set('area', filters.area);
  return params.toString();
}

export function ExplorePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const countryNames = useCountryNameMap();

  const [tab, setTab] = useState<'people' | 'businesses'>(
    searchParams.get('type') === 'businesses' ? 'businesses' : 'people'
  );
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [filters, setFilters] = useState<ExploreFilters>({
    country: searchParams.get('country') || '',
    state: searchParams.get('state') || '',
    city: searchParams.get('city') || '',
    area: searchParams.get('area') || '',
  });

  useEffect(() => {
    const next = buildExploreQuery(tab, search, filters);
    setSearchParams(next, { replace: true });
  }, [tab, search, filters, setSearchParams]);

  const queryString = buildExploreQuery(tab, search, filters);

  const { data, isLoading } = useQuery({
    queryKey: ['explore', queryString],
    queryFn: () => api<{ users: ExploreUser[]; businesses: ExploreBusiness[] }>(`/explore?${queryString}`),
    staleTime: 0,
  });

  const users = (data?.users ?? []).filter((u) => u.current_country?.toUpperCase() !== 'BR');
  const businesses = (data?.businesses ?? []).filter((b) => b.country?.toUpperCase() !== 'BR');

  const countryLabel = (code: string) => countryNames[code] || COUNTRY_LABELS[code] || code;

  const locationLabel = (user: ExploreUser) => {
    const country = countryLabel(user.current_country);
    const showCity = user.show_city_on_profile !== 0 && user.show_city_on_profile !== false;
    if (showCity && user.current_city) return `${user.current_city}, ${country}`;
    return country;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('explore.title')}</h1>
        <p className="mt-1 text-slate-500">{t('explore.subtitle')}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('explore.searchPlaceholder')}
          className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none ring-brand-500/30 focus:ring-2"
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => {
              setTab('people');
              setFilters((f) => ({ ...f, country: '', state: '', city: '' }));
            }}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              tab === 'people' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-800'
            )}
          >
            <User className="h-4 w-4" />
            {t('explore.people')}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('businesses');
              setFilters((f) => ({ ...f, country: '', state: '', city: '' }));
            }}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              tab === 'businesses' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:text-slate-800'
            )}
          >
            <Building2 className="h-4 w-4" />
            {t('explore.businesses')}
          </button>
        </div>

        <ExploreGeoFilters
          tab={tab}
          filters={filters}
          onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
        />
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-slate-500">{t('common.loading')}</p>
      ) : tab === 'people' ? (
        users.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => navigate(`/user/${user.id}`)}
                className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition-shadow hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={user.full_name} src={user.avatar_url} className="h-14 w-14 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {user.full_name}
                      {user.is_premium && (
                        <span className="ml-1 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800">Premium</span>
                      )}
                    </p>
                    <p className="truncate text-sm text-slate-500">@{user.username}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-600">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate">{locationLabel(user)}</span>
                </div>

                {user.primary_skill && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    <Briefcase className="h-3.5 w-3.5" />
                    {user.primary_skill}
                  </span>
                )}

                {user.bio && (
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-600">{user.bio}</p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="py-12 text-center text-slate-500">{t('explore.noResults')}</p>
        )
      ) : businesses.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {businesses.map((biz) => (
            <button
              key={biz.id}
              type="button"
              onClick={() => navigate('/businesses')}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-left transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Building2 className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{biz.name}</p>
                  <p className="truncate text-sm text-slate-500">@{biz.owner_username}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-sm text-slate-600">
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">
                  {biz.address || countryLabel(biz.country)}
                </span>
              </div>
              {biz.category && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  <Briefcase className="h-3.5 w-3.5" />
                  {biz.category}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="py-12 text-center text-slate-500">{t('explore.noResults')}</p>
      )}
    </div>
  );
}
