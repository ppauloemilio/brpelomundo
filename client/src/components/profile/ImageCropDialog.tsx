import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import type { CropAreaPixels } from '@/lib/prepareProfileImage';
import { cn } from '@/lib/utils';

type Kind = 'avatar' | 'cover';

type Props = {
  kind: Kind;
  file: File;
  onCancel: () => void;
  onConfirm: (area: CropAreaPixels) => void;
};

const ASPECT: Record<Kind, number> = {
  avatar: 1,
  cover: 1600 / 600,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function ImageCropDialog({ kind, file, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState('');
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [frame, setFrame] = useState({ w: 320, h: 320 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const centeredKeyRef = useRef('');

  const aspect = ASPECT[kind];

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setZoom(1);
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const maxW = Math.min(el.parentElement?.clientWidth || 360, 520);
      const w = maxW;
      const h = Math.round(w / aspect);
      setFrame({ w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (el.parentElement) ro.observe(el.parentElement);
    return () => ro.disconnect();
  }, [aspect]);

  const baseScale =
    natural.w > 0 && natural.h > 0
      ? Math.max(frame.w / natural.w, frame.h / natural.h)
      : 1;
  const scale = baseScale * zoom;
  const displayW = natural.w * scale;
  const displayH = natural.h * scale;
  const minX = Math.min(0, frame.w - displayW);
  const minY = Math.min(0, frame.h - displayH);

  useEffect(() => {
    if (!natural.w || !frame.w) return;
    const key = `${natural.w}x${natural.h}-${frame.w}x${frame.h}-${file.name}`;
    if (centeredKeyRef.current === key) {
      setOffset((o) => ({
        x: clamp(o.x, minX, 0),
        y: clamp(o.y, minY, 0),
      }));
      return;
    }
    centeredKeyRef.current = key;
    const s = Math.max(frame.w / natural.w, frame.h / natural.h);
    const dw = natural.w * s;
    const dh = natural.h * s;
    setOffset({
      x: (frame.w - dw) / 2,
      y: (frame.h - dh) / 2,
    });
  }, [natural.w, natural.h, frame.w, frame.h, file.name, minX, minY]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setOffset({
      x: clamp(dragRef.current.ox + dx, minX, 0),
      y: clamp(dragRef.current.oy + dy, minY, 0),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handleConfirm = () => {
    if (!natural.w) return;
    onConfirm({
      x: -offset.x / scale,
      y: -offset.y / scale,
      width: frame.w / scale,
      height: frame.h / scale,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
      >
        <h2 id="crop-title" className="text-lg font-semibold text-slate-900">
          {kind === 'avatar' ? t('editProfile.cropAvatarTitle') : t('editProfile.cropCoverTitle')}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{t('editProfile.cropHint')}</p>

        <div className="mt-4 flex justify-center">
          <div
            ref={frameRef}
            className={cn(
              'relative touch-none overflow-hidden bg-slate-200',
              kind === 'avatar' ? 'rounded-full ring-2 ring-slate-300' : 'rounded-xl ring-2 ring-slate-300'
            )}
            style={{ width: frame.w, height: frame.h, cursor: 'grab' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {url && natural.w > 0 && (
              <img
                src={url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
                style={{
                  width: displayW,
                  height: displayH,
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                }}
              />
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="flex items-center justify-between text-sm text-slate-600">
            <span>{t('editProfile.cropZoom')}</span>
            <span className="tabular-nums text-slate-400">{zoom.toFixed(1)}×</span>
          </label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => {
              const next = Number(e.target.value);
              setZoom(next);
              const nextScale = baseScale * next;
              const nextW = natural.w * nextScale;
              const nextH = natural.h * nextScale;
              const nextMinX = Math.min(0, frame.w - nextW);
              const nextMinY = Math.min(0, frame.h - nextH);
              setOffset((o) => ({
                x: clamp(o.x, nextMinX, 0),
                y: clamp(o.y, nextMinY, 0),
              }));
            }}
            className="w-full accent-brand-700"
          />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!natural.w}>
            {t('editProfile.cropApply')}
          </Button>
        </div>
      </div>
    </div>
  );
}
