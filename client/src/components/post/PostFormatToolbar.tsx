import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bold, Italic, Link2, Strikethrough, Underline, Code, Quote, List, ListOrdered, Heading2,
} from 'lucide-react';
import { prefixSelectedLines, wrapTextareaSelection } from '@/lib/formatPostText';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (value: string) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
};

export function PostFormatToolbar({ value, onChange, textareaRef, className }: Props) {
  const { t } = useTranslation();
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;

  const apply = (before: string, after: string, placeholder: string) => {
    const el = ref.current;
    if (!el) return;
    const { newValue, cursorStart, cursorEnd } = wrapTextareaSelection(
      value,
      el.selectionStart,
      el.selectionEnd,
      before,
      after,
      placeholder
    );
    onChange(newValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const applyLine = (prefix: string, numbered = false) => {
    const el = ref.current;
    if (!el) return;
    const { newValue, cursorStart, cursorEnd } = prefixSelectedLines(
      value,
      el.selectionStart,
      el.selectionEnd,
      prefix,
      numbered
    );
    onChange(newValue);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const applyLink = () => {
    const url = window.prompt(t('post.linkUrl'));
    if (!url?.trim()) return;
    apply('[', `](${url.trim()})`, t('post.linkText'));
  };

  const btnClass = 'inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900';

  const inlineButtons = [
    { icon: Bold, label: t('post.bold'), action: () => apply('**', '**', t('post.boldPlaceholder')) },
    { icon: Italic, label: t('post.italic'), action: () => apply('*', '*', t('post.italicPlaceholder')) },
    { icon: Underline, label: t('post.underline'), action: () => apply('++', '++', t('post.underlinePlaceholder')) },
    { icon: Strikethrough, label: t('post.strikethrough'), action: () => apply('~~', '~~', t('post.strikePlaceholder')) },
    { icon: Code, label: t('post.code'), action: () => apply('`', '`', t('post.codePlaceholder')) },
    { icon: Link2, label: t('post.link'), action: applyLink },
  ];

  const blockButtons = [
    { icon: Heading2, label: t('post.heading'), action: () => applyLine('## ') },
    { icon: Quote, label: t('post.quote'), action: () => applyLine('> ') },
    { icon: List, label: t('post.bulletList'), action: () => applyLine('- ') },
    { icon: ListOrdered, label: t('post.numberedList'), action: () => applyLine('', true) },
  ];

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-0.5">
        {inlineButtons.map(({ icon: Icon, label, action }) => (
          <button
            key={label}
            type="button"
            className={btnClass}
            title={label}
            aria-label={label}
            onClick={action}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-slate-200" />
        {blockButtons.map(({ icon: Icon, label, action }) => (
          <button
            key={label}
            type="button"
            className={btnClass}
            title={label}
            aria-label={label}
            onClick={action}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-400">{t('post.formatHint')}</p>
    </div>
  );
}
