import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { Building2, ChevronRight, Search } from 'lucide-react';
import L from 'leaflet';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { MapBusinessFilters, categoryLabel, type MapFilters } from '@/components/map/MapBusinessFilters';
import { BusinessDetailPanel } from '@/components/map/BusinessDetailPanel';
import { useMonetization } from '@/hooks/useMonetization';

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const selectedIcon = L.divIcon({
  className: '',
  html: '<div style="background:#dc2626;width:28px;height:28px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;">P</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const featuredIcon = L.divIcon({
  className: '',
  html: '<div style="background:#0d9488;width:32px;height:32px;border-radius:50%;border:3px solid #fbbf24;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:11px;">★</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

type Business = {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  address: string;
  city?: string;
  state?: string;
  country: string;
  skills: string[];
  distance_km?: number;
  is_featured?: boolean;
};

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function FlyTo({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], zoom, { duration: 0.8 });
  }, [map, lat, lng, zoom]);
  return null;
}

function buildQuery(search: string, filters: MapFilters, lat?: number | null, lng?: number | null) {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (filters.category) params.set('category', filters.category);
  if (filters.country) params.set('country', filters.country);
  if (filters.state) params.set('state', filters.state);
  if (filters.city) params.set('city', filters.city);
  if (lat != null && lng != null) {
    params.set('lat', String(lat));
    params.set('lng', String(lng));
  }
  return params.toString();
}

export function BusinessMapPage() {
  const { t } = useTranslation();
  const { data: monetization } = useMonetization();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [filters, setFilters] = useState<MapFilters>({
    category: searchParams.get('category') || '',
    country: searchParams.get('country') || '',
    state: searchParams.get('state') || '',
    city: searchParams.get('city') || '',
  });
  const [userLat, setUserLat] = useState<number | null>(
    searchParams.get('lat') ? parseFloat(searchParams.get('lat')!) : null
  );
  const [userLng, setUserLng] = useState<number | null>(
    searchParams.get('lng') ? parseFloat(searchParams.get('lng')!) : null
  );
  const [locationDenied, setLocationDenied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('business'));
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);

  const locationActive = userLat != null && userLng != null;

  useEffect(() => {
    const params = new URLSearchParams(buildQuery(search, filters, userLat, userLng));
    if (selectedId) params.set('business', selectedId);
    setSearchParams(params.toString(), { replace: true });
  }, [search, filters, userLat, userLng, selectedId, setSearchParams]);

  const queryString = buildQuery(search, filters);

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ['businesses-map', queryString],
    queryFn: () => api<Business[]>(`/businesses${queryString ? `?${queryString}` : ''}`),
    staleTime: 0,
  });

  useEffect(() => {
    if (!selectedId || !businesses.length) return;
    const b = businesses.find((x) => x.id === selectedId);
    if (b?.latitude && b?.longitude) {
      setFlyTarget({ lat: b.latitude, lng: b.longitude });
    }
  }, [selectedId, businesses]);

  const withCoords = useMemo(() => {
    let list = businesses.filter((b) => b.latitude && b.longitude);
    if (locationActive) {
      list = list
        .map((b) => ({ ...b, distance_km: haversine(userLat!, userLng!, b.latitude, b.longitude) }))
        .sort((a, b) => (a.distance_km || 0) - (b.distance_km || 0));
    }
    return list;
  }, [businesses, locationActive, userLat, userLng]);

  const center: [number, number] =
    locationActive ? [userLat!, userLng!] :
    withCoords.length ? [withCoords[0].latitude, withCoords[0].longitude] :
    [40.7128, -74.006];

  const activateLocation = () => {
    if (!navigator.geolocation) {
      setLocationDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setLocationDenied(false);
      },
      () => setLocationDenied(true),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const selectBusiness = (b: Business) => {
    setSelectedId(b.id);
    if (b.latitude && b.longitude) setFlyTarget({ lat: b.latitude, lng: b.longitude });
  };

  const businessSubtitle = (b: Business) => {
    if (b.address) return b.address;
    if (b.skills?.length) return b.skills[0];
    return categoryLabel(b.category);
  };

  useEffect(() => {
    delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-3 pb-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('map.searchPlaceholder')}
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none ring-brand-500/30 focus:ring-2"
          />
        </div>
        <MapBusinessFilters filters={filters} onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))} />
      </div>

      {!locationActive && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-sm text-brand-900">{t('map.activateLocation')}</p>
          <Button size="sm" onClick={activateLocation}>{t('map.activate')}</Button>
        </div>
      )}
      {locationDenied && (
        <p className="text-sm text-amber-700">{t('map.locationDenied')}</p>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="relative min-h-[480px] flex-1 overflow-hidden rounded-xl border border-slate-200">
          <span className="absolute left-3 top-3 z-[1000] rounded-lg bg-white/95 px-3 py-1.5 text-sm font-medium shadow-sm">
            {withCoords.length} {t('map.businessesCount')}
          </span>
          {isLoading ? (
            <div className="flex h-[480px] items-center justify-center text-slate-500">{t('common.loading')}</div>
          ) : (
            <MapContainer
              center={center}
              zoom={locationActive ? 11 : 4}
              style={{ height: '480px', width: '100%' }}
              key={`map-${center[0]}-${center[1]}`}
            >
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} zoom={14} />}
              {locationActive && (
                <Circle
                  center={[userLat!, userLng!]}
                  radius={20000}
                  pathOptions={{ color: '#00875F', fillColor: '#00875F', fillOpacity: 0.08 }}
                />
              )}
              {withCoords.map((b) => (
                <Marker
                  key={b.id}
                  position={[b.latitude, b.longitude]}
                  icon={
                    selectedId === b.id
                      ? selectedIcon
                      : monetization?.featured_business_enabled && b.is_featured
                        ? featuredIcon
                        : markerIcon
                  }
                  eventHandlers={{ click: () => selectBusiness(b) }}
                >
                  <Popup>
                    <strong>{b.name}</strong><br />
                    {categoryLabel(b.category)}<br />
                    {b.address}
                    {b.distance_km != null && <><br />{b.distance_km.toFixed(1)} km</>}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>

        {selectedId ? (
          <BusinessDetailPanel businessId={selectedId} onClose={() => setSelectedId(null)} />
        ) : (
          <aside className="w-full shrink-0 lg:w-80">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">
              {t('map.sidebarTitle')} ({businesses.length})
            </h2>
            <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
              {businesses.length === 0 && !isLoading && (
                <p className="text-sm text-slate-500">{t('business.noBusinesses')}</p>
              )}
              {businesses.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => selectBusiness(b)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {b.name}
                      {monetization?.featured_business_enabled && b.is_featured && (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          {t('admin.featured')}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500">{businessSubtitle(b)}</p>
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {categoryLabel(b.category)}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
