import type { ReactNode } from 'react';
import { assetUrl } from '@/lib/api';

export type ImageAlign = 'left' | 'center' | 'right' | 'full';

export const IMAGE_ALIGNS: ImageAlign[] = ['left', 'center', 'right', 'full'];

/**
 * Imagem no meio do texto: `![alinhamento|largura](url)` em uma linha própria.
 * Fica legível no textarea e reaproveita o parser de blocos que já existia, em
 * vez de introduzir HTML no conteúdo (que abriria espaço para XSS).
 */
const IMAGE_LINE = /^!\[(left|center|right|full)\|(\d{1,3})\]\(([^\s)]+)\)$/;
const IMAGE_TOKEN_GLOBAL = /!\[(left|center|right|full)\|(\d{1,3})\]\(([^\s)]+)\)/g;

export type InlineImage = {
  url: string;
  align: ImageAlign;
  width: number;
  /** Posição do marcador no texto, para poder reescrever só ele. */
  start: number;
  end: number;
};

export function buildImageToken(url: string, align: ImageAlign = 'center', width = 100) {
  return `![${align}|${clampWidth(width)}](${url})`;
}

function clampWidth(width: number) {
  return Math.min(100, Math.max(10, Math.round(width)));
}

/** Todas as imagens inline do conteúdo, na ordem em que aparecem. */
export function findInlineImages(content: string): InlineImage[] {
  const found: InlineImage[] = [];
  for (const m of content.matchAll(IMAGE_TOKEN_GLOBAL)) {
    found.push({
      align: m[1] as ImageAlign,
      width: clampWidth(Number(m[2])),
      url: m[3],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return found;
}

/** Substitui um marcador específico (por posição) preservando o resto do texto. */
export function replaceInlineImage(
  content: string,
  image: InlineImage,
  patch: Partial<Pick<InlineImage, 'align' | 'width'>>
) {
  const token = buildImageToken(image.url, patch.align ?? image.align, patch.width ?? image.width);
  return content.slice(0, image.start) + token + content.slice(image.end);
}

export function removeInlineImage(content: string, image: InlineImage) {
  const before = content.slice(0, image.start).replace(/\n+$/, '');
  const after = content.slice(image.end).replace(/^\n+/, '');
  if (!before) return after;
  if (!after) return before;
  return `${before}\n\n${after}`;
}

/** Insere o marcador em linha própria na posição do cursor. */
export function insertImageToken(content: string, cursor: number, token: string) {
  const before = content.slice(0, cursor);
  const after = content.slice(cursor);
  const prefix = before && !before.endsWith('\n') ? '\n\n' : '';
  const suffix = after && !after.startsWith('\n') ? '\n\n' : '';
  const inserted = `${prefix}${token}${suffix}`;
  return {
    value: before + inserted + after,
    cursor: cursor + inserted.length,
  };
}

/** Corta o texto sem partir um marcador de imagem no meio. */
export function truncateContent(content: string, limit: number) {
  if (content.length <= limit) return content;
  const straddling = findInlineImages(content).find(
    (img) => img.start < limit && img.end > limit
  );
  return content.slice(0, straddling ? straddling.start : limit);
}

type MatchRule = {
  regex: RegExp;
  render: (match: RegExpMatchArray, key: number) => ReactNode;
};

const INLINE_RULES: MatchRule[] = [
  {
    regex: /\[([^\]]+)\]\(([^)]+)\)/,
    render: (m, key) => (
      <a
        key={key}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-brand-700 underline hover:text-brand-800"
        onClick={(e) => e.stopPropagation()}
      >
        {m[1]}
      </a>
    ),
  },
  {
    regex: /\*\*([^*]+)\*\*/,
    render: (m, key) => <strong key={key} className="font-semibold">{m[1]}</strong>,
  },
  {
    regex: /~~([^~]+)~~/,
    render: (m, key) => <span key={key} className="line-through opacity-80">{m[1]}</span>,
  },
  {
    regex: /\+\+([^+]+)\+\+/,
    render: (m, key) => <span key={key} className="underline">{m[1]}</span>,
  },
  {
    regex: /`([^`]+)`/,
    render: (m, key) => (
      <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">
        {m[1]}
      </code>
    ),
  },
  {
    regex: /\*([^*]+)\*/,
    render: (m, key) => <em key={key}>{m[1]}</em>,
  },
];

function parseInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let index = 0;

  while (remaining.length > 0) {
    let best: { match: RegExpMatchArray; rule: MatchRule; pos: number } | null = null;

    for (const rule of INLINE_RULES) {
      const match = rule.regex.exec(remaining);
      if (match && (best === null || match.index! < best.pos)) {
        best = { match, rule, pos: match.index! };
      }
    }

    if (!best) {
      nodes.push(remaining);
      break;
    }

    if (best.pos > 0) nodes.push(remaining.slice(0, best.pos));
    nodes.push(best.rule.render(best.match, index));
    index += 1;
    remaining = remaining.slice(best.pos + best.match[0].length);
  }

  return nodes.length ? nodes : [text];
}

type Block =
  | { type: 'heading'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'image'; url: string; align: ImageAlign; width: number }
  | { type: 'p'; text: string };

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const image = IMAGE_LINE.exec(line.trim());
    if (image) {
      blocks.push({
        type: 'image',
        align: image[1] as ImageAlign,
        width: clampWidth(Number(image[2])),
        url: image[3],
      });
      i += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      blocks.push({ type: 'heading', text: line.slice(3) });
      i += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      blocks.push({ type: 'quote', text: line.slice(2) });
      i += 1;
      continue;
    }

    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        items.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\d+\.\s+(.*)$/);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    blocks.push({ type: 'p', text: line });
    i += 1;
  }

  return blocks;
}

/** `left`/`right` flutuam para o texto correr ao lado; `center`/`full` ocupam a linha. */
function imageBlockClass(align: ImageAlign) {
  switch (align) {
    case 'left':
      return 'float-left mr-3 mb-2 max-w-[70%]';
    case 'right':
      return 'float-right ml-3 mb-2 max-w-[70%]';
    case 'center':
      return 'mx-auto my-2';
    default:
      return 'my-2';
  }
}

export function FormattedText({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  const hasFloat = blocks.some((b) => b.type === 'image' && (b.align === 'left' || b.align === 'right'));

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'image':
            return (
              <span key={i} className={`block ${imageBlockClass(block.align)}`} style={{ width: `${block.width}%` }}>
                <img
                  src={assetUrl(block.url) ?? block.url}
                  alt=""
                  loading="lazy"
                  className="w-full rounded-xl border border-slate-100"
                />
              </span>
            );
          case 'heading':
            return (
              <p key={i} className="mb-1 text-base font-bold text-slate-900">
                {parseInline(block.text)}
              </p>
            );
          case 'quote':
            return (
              <blockquote
                key={i}
                className="my-1 border-l-4 border-brand-300 bg-brand-50/50 py-1 pl-3 text-slate-700 italic"
              >
                {parseInline(block.text)}
              </blockquote>
            );
          case 'ul':
            return (
              <ul key={i} className="my-1 list-disc space-y-0.5 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{parseInline(item)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i} className="my-1 list-decimal space-y-0.5 pl-5">
                {block.items.map((item, j) => (
                  <li key={j}>{parseInline(item)}</li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={i} className={i > 0 ? 'mt-1' : ''}>
                {parseInline(block.text)}
              </p>
            );
        }
      })}
      {/* Encerra os floats para a imagem não vazar do card. */}
      {hasFloat && <span className="block clear-both" />}
    </div>
  );
}

export function wrapTextareaSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  before: string,
  after: string,
  placeholder = ''
) {
  const selected = value.slice(selectionStart, selectionEnd) || placeholder;
  const newValue = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd);
  const cursorStart = selectionStart + before.length;
  const cursorEnd = cursorStart + selected.length;
  return { newValue, cursorStart, cursorEnd };
}

export function prefixSelectedLines(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  numbered = false
) {
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEndRaw = value.indexOf('\n', selectionEnd);
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');

  const prefixed = lines.map((line, idx) => {
    const trimmed = line.trimStart();
    const indent = line.slice(0, line.length - trimmed.length);
    if (numbered) return `${indent}${idx + 1}. ${trimmed || ''}`;
    return `${indent}${prefix}${trimmed || ''}`;
  }).join('\n');

  const newValue = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  return {
    newValue,
    cursorStart: lineStart,
    cursorEnd: lineStart + prefixed.length,
  };
}
