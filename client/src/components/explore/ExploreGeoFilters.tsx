import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SKILL_AREAS } from '@/lib/profileConstants';
import { cn } from '@/lib/utils';

type GeoItem = { code: string; name: string };

export type ExploreFilters = {
  country: string;
  state: string;
  city: string;
  area: string;
};

type Props = {
  tab: 'people' | 'businesses';
  filters: ExploreFilters;
  onChange: (patch: Partial<ExploreFilters>) => void;
  className?: string;
};

export function ExploreGeoFilters({ tab, filters, onChange, className }: Props) {
  const { t } = useTranslation();
  const typeParam = `type=${tab}`;

  const { data: countries = [] } = useQuery({
    queryKey: ['geo-used-countries', tab],
    queryFn: () => api<GeoItem[]>(`/geo/used-countries?${typeParam}`),
  });

  const { data: states = [] } = useQuery({
    queryKey: ['geo-used-states', tab, filters.country],
    queryFn: () => api<GeoItem[]>(`/geo/used-states?${typeParam}&country=${filters.country}`),
    enabled: !!filters.country,
  });

  const { data: cities = [] } = useQuery({
    queryKey: ['geo-used-cities', tab, filters.country, filters.state],
    queryFn: () => api<GeoItem[]>(
      `/geo/used-cities?${typeParam}&country=${filters.country}&state=${encodeURIComponent(filters.state)}`
    ),
    enabled: !!filters.country && !!filters.state,
  });

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <select
        className="h-9 min-w-[130px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
        value={filters.country}
        onChange={(e) => onChange({ country: e.target.value, state: '', city: '' })}
      >
        <option value="">{t('explore.allCountries')}</option>
        {countries.map((c) => (
          <option key={c.code} value={c.code}>{c.name}</option>
        ))}
      </select>

      <select
        className="h-9 min-w-[130px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 disabled:opacity-50"
        value={filters.state}
        disabled={!filters.country}
        onChange={(e) => onChange({ state: e.target.value, city: '' })}
      >
        <option value="">{t('explore.allStates')}</option>
        {states.map((s) => (
          <option key={s.code} value={s.name}>{s.name}</option>
        ))}
      </select>

      <select
        className="h-9 min-w-[130px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 disabled:opacity-50"
        value={filters.city}
        disabled={!filters.state}
        onChange={(e) => onChange({ city: e.target.value })}
      >
        <option value="">{t('explore.allCities')}</option>
        {cities.map((c) => (
          <option key={c.code} value={c.name}>{c.name}</option>
        ))}
      </select>

      <select
        className="h-9 min-w-[130px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
        value={filters.area}
        onChange={(e) => onChange({ area: e.target.value })}
      >
        <option value="">{t('explore.allAreas')}</option>
        {SKILL_AREAS.map((a) => (
          <option key={a} value={a}>{a}</option>
        ))}
      </select>
    </div>
  );
}

export function useCountryNameMap() {
  const { data: countries = [] } = useQuery({
    queryKey: ['geo-countries'],
    queryFn: () => api<GeoItem[]>('/geo/countries'),
  });
  return Object.fromEntries(countries.map((c) => [c.code, c.name]));
}
