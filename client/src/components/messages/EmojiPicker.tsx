import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  WHATSAPP_EMOJI_CATEGORIES,
  loadRecentEmojis,
  pushRecentEmoji,
  type EmojiCategoryId,
} from '@/lib/whatsappEmojis';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function EmojiPicker({ open, onClose, onPick, anchorRef }: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<EmojiCategoryId | 'recent'>('smileys');
  const [recent, setRecent] = useState<string[]>(loadRecentEmojis);

  useEffect(() => {
    if (!open) return;
    setRecent(loadRecentEmojis());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const emojis =
    category === 'recent'
      ? recent
      : WHATSAPP_EMOJI_CATEGORIES.find((c) => c.id === category)?.emojis ?? [];

  const pick = (emoji: string) => {
    pushRecentEmoji(emoji);
    onPick(emoji);
  };

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full left-0 z-50 mb-2 flex w-[min(100vw-2rem,22rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
    >
      <div className="max-h-52 overflow-y-auto p-2">
        {category === 'recent' && emojis.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400">{t('messages.emojiRecentEmpty')}</p>
        ) : (
          <div className="grid grid-cols-8 gap-0.5">
            {emojis.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-md text-xl hover:bg-slate-100"
                onClick={() => pick(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex border-t border-slate-100 bg-slate-50/80 px-1 py-1">
        <button
          type="button"
          title={t('messages.emojiRecent')}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md text-lg',
            category === 'recent' ? 'bg-white shadow-sm' : 'hover:bg-white/80'
          )}
          onClick={() => setCategory('recent')}
        >
          🕘
        </button>
        {WHATSAPP_EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            title={t(`messages.emoji.${cat.id}`)}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-md text-lg',
              category === cat.id ? 'bg-white shadow-sm' : 'hover:bg-white/80'
            )}
            onClick={() => setCategory(cat.id)}
          >
            {cat.icon}
          </button>
        ))}
      </div>
    </div>
  );
}
