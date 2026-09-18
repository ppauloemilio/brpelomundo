import { useTranslation } from 'react-i18next';
import { AlignCenter, AlignLeft, AlignRight, Maximize2, X } from 'lucide-react';
import { assetUrl } from '@/lib/api';
import {
  findInlineImages,
  removeInlineImage,
  replaceInlineImage,
  type ImageAlign,
} from '@/lib/formatPostText';
import { cn } from '@/lib/utils';

type Props = {
  content: string;
  onChange: (value: string) => void;
};

/**
 * Ajusta posição e tamanho de cada imagem inserida no texto.
 *
 * As posições dos marcadores são derivadas do conteúdo a cada render: editar um
 * marcador muda seu comprimento e deslocaria os índices dos seguintes.
 */
export function PostImageControls({ content, onChange }: Props) {
  const { t } = useTranslation();
  const images = findInlineImages(content);

  if (images.length === 0) return null;

  const alignOptions: { value: ImageAlign; icon: typeof AlignLeft; label: string }[] = [
    { value: 'left', icon: AlignLeft, label: t('post.imageAlignLeft') },
    { value: 'center', icon: AlignCenter, label: t('post.imageAlignCenter') },
    { value: 'right', icon: AlignRight, label: t('post.imageAlignRight') },
    { value: 'full', icon: Maximize2, label: t('post.imageAlignFull') },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">{t('post.imageSettings')}</p>
      <p className="text-xs text-slate-400">{t('post.imageOrderHint')}</p>

      {images.map((image, index) => (
        <div
          key={`${image.start}-${image.url}`}
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-2"
        >
          <img
            src={assetUrl(image.url) ?? image.url}
            alt=""
            className="h-14 w-14 shrink-0 rounded-md border border-slate-200 object-cover"
          />

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-1">
              {alignOptions.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={image.align === value}
                  onClick={() => onChange(replaceInlineImage(content, image, { align: value }))}
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-md border',
                    image.align === value
                      ? 'border-brand-300 bg-brand-100 text-brand-800'
                      : 'border-transparent text-slate-500 hover:bg-slate-200/70'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
              <span className="ml-auto text-xs text-slate-400">
                {t('post.imageNumber', { number: index + 1 })}
              </span>
            </div>

            <label className="flex items-center gap-2">
              <span className="sr-only">{t('post.imageWidth')}</span>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={image.width}
                onChange={(e) =>
                  onChange(replaceInlineImage(content, image, { width: Number(e.target.value) }))
                }
                className="h-1.5 flex-1 accent-brand-600"
              />
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">
                {image.width}%
              </span>
            </label>
          </div>

          <button
            type="button"
            title={t('post.imageRemove')}
            aria-label={t('post.imageRemove')}
            onClick={() => onChange(removeInlineImage(content, image))}
            className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
