import { api, assetUrl } from '@/lib/api';

export type Ad = {
  id: string;
  title: string;
  image_url: string;
  link_url?: string;
  description?: string;
};

export function trackAdImpression(adId: string, placement: string) {
  api(`/billing/ads/${adId}/events`, {
    method: 'POST',
    body: JSON.stringify({ event_type: 'impression', placement }),
  }).catch(() => { /* ignore tracking errors */ });
}

export function trackAdClick(adId: string, placement: string) {
  api(`/billing/ads/${adId}/events`, {
    method: 'POST',
    body: JSON.stringify({ event_type: 'click', placement }),
  }).catch(() => { /* ignore */ });
}

export function AdBannerCard({ ad, placement }: { ad: Ad; placement: string }) {
  const content = (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <img
        src={assetUrl(ad.image_url) ?? ad.image_url}
        alt={ad.title}
        className="h-32 w-full object-cover"
      />
      {ad.title && <p className="px-3 py-2 text-sm font-medium text-slate-800">{ad.title}</p>}
    </div>
  );

  const onClick = () => trackAdClick(ad.id, placement);

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
