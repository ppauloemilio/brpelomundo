import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string, locale = 'pt-BR') {
  return new Date(date).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(date: string, locale = 'pt-BR'): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);

  if (locale.startsWith('en')) {
    if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} min ago`;
    return 'just now';
  }
  if (months > 0) return `há ${months} ${months > 1 ? 'meses' : 'mês'}`;
  if (days > 0) return `há ${days} ${days > 1 ? 'dias' : 'dia'}`;
  if (hours > 0) return `há ${hours}h`;
  if (minutes > 0) return `há ${minutes} min`;
  return 'agora';
}

export const COUNTRY_LABELS: Record<string, string> = {
  BR: 'Brasil',
  US: 'Estados Unidos',
  PT: 'Portugal',
  CA: 'Canadá',
  UK: 'Reino Unido',
  DE: 'Alemanha',
};

export const POST_TYPE_LABELS: Record<string, string> = {
  text: 'Texto',
  image: 'Imagem',
  business_promo: 'Promoção',
  job: 'Vaga',
  event: 'Evento',
};

export const BUSINESS_CATEGORIES = [
  'restaurant', 'law', 'accounting', 'health', 'education', 'tech', 'retail', 'services',
] as const;

export type FeedFilter = 'all' | 'posts' | 'events' | 'jobs';

export function matchesFeedFilter(type: string, filter: FeedFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'posts') return type === 'text' || type === 'image' || type === 'business_promo';
  if (filter === 'events') return type === 'event';
  if (filter === 'jobs') return type === 'job';
  return true;
}
