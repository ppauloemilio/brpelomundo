import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

const OUTROS = 'OUTROS';

type GeoItem = { code: string; name: string };

type LocationCascadeProps = {
  country: string;
  stateIso: string;
  stateCustom: string;
  citySelect: string;
  cityCustom: string;
  onChange: (patch: Partial<{
    country: string;
    stateIso: string;
    stateCustom: string;
    citySelect: string;
    cityCustom: string;
  }>) => void;
  onResolved?: (resolved: { state: string; city: string }) => void;
  fixedCountry?: string;
  showCountry?: boolean;
};

export function resolveLocationForSave(
  stateIso: string,
  stateCustom: string,
  states: GeoItem[],
  citySelect: string,
  cityCustom: string
): { state: string; city: string } {
  const state =
    stateIso === OUTROS
      ? stateCustom.trim()
      : states.find((s) => s.code === stateIso)?.name || stateCustom.trim();

  const city = citySelect === OUTROS ? cityCustom.trim() : citySelect;

  return { state, city };
}

export function LocationCascade({
  country,
  stateIso,
  stateCustom,
  citySelect,
  cityCustom,
  onChange,
  onResolved,
  fixedCountry,
  showCountry = true,
}: LocationCascadeProps) {
  const { t } = useTranslation();
  const effectiveCountry = fixedCountry || country;

  const { data: countries = [] } = useQuery({
    queryKey: ['geo-countries'],
    queryFn: () => api<GeoItem[]>('/geo/countries'),
    enabled: showCountry && !fixedCountry,
  });

  const { data: states = [], isLoading: loadingStates } = useQuery({
    queryKey: ['geo-states', effectiveCountry],
    queryFn: () => api<GeoItem[]>(`/geo/states?country=${effectiveCountry}`),
    enabled: !!effectiveCountry,
  });

  const { data: cities = [], isLoading: loadingCities } = useQuery({
    queryKey: ['geo-cities', effectiveCountry, stateIso],
    queryFn: () => api<GeoItem[]>(`/geo/cities?country=${effectiveCountry}&state=${stateIso}`),
    enabled: !!effectiveCountry && !!stateIso && stateIso !== OUTROS,
  });

  const cityOptions = stateIso === OUTROS
    ? [{ code: OUTROS, name: t('editProfile.other') }]
    : cities;

  const stateIsOther = stateIso === OUTROS;
  const cityIsOther = citySelect === OUTROS;

  useEffect(() => {
    if (!onResolved) return;
    if (!effectiveCountry || (!stateIso && !stateCustom)) return;
    onResolved(resolveLocationForSave(stateIso, stateCustom, states, citySelect, cityCustom));
  }, [onResolved, effectiveCountry, stateIso, stateCustom, states, citySelect, cityCustom]);

  return (
    <div className={cn('grid gap-3', showCountry ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {showCountry && !fixedCountry && (
        <div className="sm:col-span-3 sm:grid-cols-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">{t('auth.country')}</label>
          <select
            className="h-10 w-full rounded-lg border border-slate-200 px-2 text-sm"
            value={country}
            onChange={(e) => onChange({
              country: e.target.value,
              stateIso: '',
              stateCustom: '',
              citySelect: '',
              cityCustom: '',
            })}
          >
            <option value="">{t('editProfile.selectCountry')}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className={showCountry ? '' : 'sm:col-span-1'}>
        <label className="mb-1 block text-xs font-medium text-slate-500">{t('editProfile.stateRegion')}</label>
        <select
          className="h-10 w-full rounded-lg border border-slate-200 px-2 text-sm"
          value={stateIso}
          disabled={!effectiveCountry || loadingStates}
          onChange={(e) => onChange({
            stateIso: e.target.value,
            stateCustom: '',
            citySelect: '',
            cityCustom: '',
          })}
        >
          <option value="">{loadingStates ? t('common.loading') : t('editProfile.selectState')}</option>
          {states.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code === OUTROS ? t('editProfile.other') : s.name}
            </option>
          ))}
        </select>
        {stateIsOther && (
          <Input
            className="mt-2"
            value={stateCustom}
            onChange={(e) => onChange({ stateCustom: e.target.value })}
            placeholder={t('editProfile.stateOtherPlaceholder')}
          />
        )}
      </div>

      <div className={showCountry ? 'sm:col-span-2' : ''}>
        <label className="mb-1 block text-xs font-medium text-slate-500">{t('editProfile.city')}</label>
        {!stateIsOther ? (
          <>
            <select
              className="h-10 w-full rounded-lg border border-slate-200 px-2 text-sm"
              value={citySelect}
              disabled={!stateIso || loadingCities}
              onChange={(e) => onChange({
                citySelect: e.target.value,
                cityCustom: e.target.value === OUTROS ? cityCustom : '',
              })}
            >
              <option value="">
                {!stateIso
                  ? t('editProfile.selectStateFirst')
                  : loadingCities
                    ? t('common.loading')
                    : t('editProfile.selectCity')}
              </option>
              {cityOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code === OUTROS ? t('editProfile.other') : c.name}
                </option>
              ))}
            </select>
            {cityIsOther && (
              <Input
                className="mt-2"
                value={cityCustom}
                onChange={(e) => onChange({ cityCustom: e.target.value })}
                placeholder={t('editProfile.cityOtherPlaceholder')}
              />
            )}
          </>
        ) : (
          <Input
            value={cityCustom || citySelect}
            onChange={(e) => onChange({ citySelect: OUTROS, cityCustom: e.target.value })}
            placeholder={t('editProfile.cityOtherPlaceholder')}
          />
        )}
      </div>
    </div>
  );
}
