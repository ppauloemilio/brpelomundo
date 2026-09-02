import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type GeoItem = { code: string; name: string };

export type MapFilters = {
  category: string;
  country: string;
  state: string;
  city: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: 'Restaurante',
  law: 'Direito',
  accounting: 'Contabilidade',
  health: 'Saúde',
  education: 'Educação',
  tech: 'TI',
  retail: 'Varejo',
  services: 'Outros',
};

export function categoryLabel(code: string) {
  return CATEGORY_LABELS[code] || code;
}

type Props = {
  filters: MapFilters;
  onChange: (patch: Partial<MapFilters>) => void;
  className?: string;
};

export function MapBusinessFilters({ filters, onChange, className }: Props) {
  const { t } = useTranslation();
  const typeParam = 'type=businesses';

  const { data: categories = [] } = useQuery({
    queryKey: ['geo-used-categories'],
    queryFn: () => api<GeoItem[]>(`/geo/used-categories?${typeParam}`),
  });

  const { data: countries = [] } = useQuery({
    queryKey: ['geo-used-countries', 'businesses'],
    queryFn: () => api<GeoItem[]>(`/geo/used-countries?${typeParam}`),
  });

  const { data: states = [] } = useQuery({
    queryKey: ['geo-used-states', 'businesses', filters.country],
    queryFn: () => api<GeoItem[]>(`/geo/used-states?${typeParam}&country=${filters.country}`),
    enabled: !!filters.country,
  });

  const { data: cities = [] } = useQuery({
    queryKey: ['geo-used-cities', 'businesses', filters.country, filters.state],
    queryFn: () => api<GeoItem[]>(
      `/geo/used-cities?${typeParam}&country=${filters.country}&state=${encodeURIComponent(filters.state)}`
    ),
    enabled: !!filters.country && !!filters.state,
  });

  const selectClass = 'h-9 min-w-[130px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 disabled:opacity-50';

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      <select
        className={selectClass}
        value={filters.category}
        onChange={(e) => onChange({ category: e.target.value })}
      >
        <option value="">{t('map.allCategories')}</option>
        {categories.map((c) => (
          <option key={c.code} value={c.code}>{categoryLabel(c.code)}</option>
        ))}
      </select>

      <select
        className={selectClass}
        value={filters.country}
        onChange={(e) => onChange({ country: e.target.value, state: '', city: '' })}
      >
        <option value="">{t('explore.allCountries')}</option>
        {countries.map((c) => (
          <option key={c.code} value={c.code}>{c.name}</option>
        ))}
      </select>

      <select
        className={selectClass}
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
        className={selectClass}
        value={filters.city}
        disabled={!filters.state}
        onChange={(e) => onChange({ city: e.target.value })}
      >
        <option value="">{t('explore.allCities')}</option>
        {cities.map((c) => (
          <option key={c.code} value={c.name}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
