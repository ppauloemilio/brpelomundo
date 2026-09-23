import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMonetization } from '@/hooks/useMonetization';
import { getCarouselStartIndex } from '@/lib/adRotation';
import { cn } from '@/lib/utils';
import { AdBannerCard, trackAdImpression, type Ad } from '@/components/feed/AdBannerCard';

const SLIDE_MS = 10_000;

export function AdCarousel({ placement = 'feed' }: { placement?: string }) {
  const { t } = useTranslation();
  const { data: settings } = useMonetization();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const poolInitialized = useRef(false);

  const { data: ads = [] } = useQuery({
    queryKey: ['advertisements', 'feed'],
    queryFn: () => api<Ad[]>('/advertisements?placement=feed'),
    enabled: settings?.ads_enabled,
  });

  useEffect(() => {
    if (ads.length === 0) {
      poolInitialized.current = false;
      return;
    }
    if (poolInitialized.current) return;
    poolInitialized.current = true;
    setIndex(getCarouselStartIndex(ads.length));
  }, [ads]);

  const ad = ads[index] ?? ads[0] ?? null;
  const multi = ads.length > 1;

  useEffect(() => {
    if (!ad?.id) return;
    trackAdImpression(ad.id, placement);
  }, [ad?.id, index, placement]);

  useEffect(() => {
    if (!multi || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % ads.length);
    }, SLIDE_MS);

    return () => window.clearInterval(timer);
  }, [ads.length, multi, paused]);

  const goTo = (next: number) => setIndex(next);

  if (!settings?.ads_enabled || !ad) return null;

  return (
    <div
      className="space-y-2"
      aria-roledescription="carousel"
      aria-label={t('feed.adCarousel')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="relative">
        <AdBannerCard ad={ad} placement={placement} />
        {multi && (
          <p className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
            {t('feed.adSlideOf', { current: index + 1, total: ads.length })}
          </p>
        )}
      </div>

      {multi && (
        <div className="flex items-center justify-center gap-1.5" role="tablist" aria-label={t('feed.adCarouselDots')}>
          {ads.map((item, i) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={t('feed.adGoToSlide', { n: i + 1 })}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-4 bg-brand-600' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              )}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
