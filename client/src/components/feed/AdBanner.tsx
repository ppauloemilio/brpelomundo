import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useMonetization } from '@/hooks/useMonetization';

type Ad = { id: string; title: string; image_url: string; link_url?: string; description?: string };

export function AdBanner({ placement = 'feed' }: { placement?: string }) {
  const { data: settings } = useMonetization();
  const tracked = useRef<string | null>(null);

  const { data: ads = [] } = useQuery({
    queryKey: ['advertisements'],
    queryFn: () => api<Ad[]>('/advertisements'),
    enabled: settings?.ads_enabled,
  });

  const ad = ads[0];

  useEffect(() => {
    if (!ad?.id || tracked.current === ad.id) return;
    tracked.current = ad.id;
    api(`/billing/ads/${ad.id}/events`, {
      method: 'POST',
      body: JSON.stringify({ event_type: 'impression', placement }),
    }).catch(() => { /* ignore tracking errors */ });
  }, [ad?.id, placement]);

  if (!settings?.ads_enabled || !ad) return null;

  const content = (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <img src={ad.image_url} alt={ad.title} className="h-32 w-full object-cover" />
      {ad.title && <p className="px-3 py-2 text-sm font-medium text-slate-800">{ad.title}</p>}
    </div>
  );

  const onClick = () => {
    api(`/billing/ads/${ad.id}/events`, {
      method: 'POST',
      body: JSON.stringify({ event_type: 'click', placement }),
    }).catch(() => { /* ignore */ });
  };

  if (ad.link_url) {
    return (
      <a
        href={ad.link_url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        onClick={onClick}
      >
        {content}
      </a>
    );
  }
  return (
    <button type="button" className="block w-full text-left" onClick={onClick}>
      {content}
    </button>
  );
}
