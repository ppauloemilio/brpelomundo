import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMonetization } from '@/hooks/useMonetization';
import { useRotatedAd } from '@/hooks/useRotatedAd';
import { AdBannerCard, trackAdImpression, type Ad } from '@/components/feed/AdBannerCard';

export function AdBanner({ placement = 'feed' }: { placement?: string }) {
  const { data: settings } = useMonetization();
  const tracked = useRef<string | null>(null);

  const { data: ads = [] } = useQuery({
    queryKey: ['advertisements', 'sidebar'],
    queryFn: () => api<Ad[]>('/advertisements?placement=sidebar'),
    enabled: settings?.ads_enabled,
  });

  const ad = useRotatedAd(ads);

  useEffect(() => {
    if (!ad?.id || tracked.current === ad.id) return;
    tracked.current = ad.id;
    trackAdImpression(ad.id, placement);
  }, [ad?.id, placement]);

  if (!settings?.ads_enabled || !ad) return null;

  return <AdBannerCard ad={ad} placement={placement} />;
}
