import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { assetUrl } from '@/lib/api';

type Props = {
  url: string;
  type?: 'image' | 'video' | string | null;
};

function isVideo(type: string | null | undefined, url: string) {
  if (type === 'video') return true;
  return /\.(mp4|webm|mov|m4v|avi)(\?|$)/i.test(url);
}

export function MessageAttachment({ url, type }: Props) {
  const { t } = useTranslation();
  const fullUrl = assetUrl(url) ?? url;
  const video = isVideo(type, url);

  return (
    <div className="relative mb-1 inline-block max-w-[220px]">
      {video ? (
        <video
          src={fullUrl}
          className="max-h-40 max-w-[220px] rounded-lg object-cover"
          controls
          preload="metadata"
        />
      ) : (
        <a href={fullUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={fullUrl}
            alt=""
            className="max-h-40 max-w-[220px] rounded-lg object-cover"
            loading="lazy"
          />
        </a>
      )}
      <a
        href={fullUrl}
        download
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-center gap-1 rounded-md bg-black/5 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-black/10"
        onClick={(e) => e.stopPropagation()}
      >
        <Download className="h-3 w-3" />
        {t('messages.downloadOriginal')}
      </a>
    </div>
  );
}
