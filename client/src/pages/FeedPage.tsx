import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { PostCard, Post } from '@/components/feed/PostCard';
import { SearchHero } from '@/components/feed/SearchHero';
import { CreatePostCard } from '@/components/feed/CreatePostCard';
import { FeedSidebar } from '@/components/feed/FeedSidebar';
import { AdBanner } from '@/components/feed/AdBanner';
import { Card, CardContent } from '@/components/ui/Card';
import { cn, matchesFeedFilter, COUNTRY_LABELS, type FeedFilter } from '@/lib/utils';

export type FeedScope = 'city' | 'country' | 'abroad';

const TYPE_FILTERS: { key: FeedFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'feed.filterAll' },
  { key: 'posts', labelKey: 'feed.filterPosts' },
  { key: 'events', labelKey: 'feed.filterEvents' },
  { key: 'jobs', labelKey: 'feed.filterJobs' },
];

const SCOPE_FILTERS: { key: FeedScope; labelKey: string }[] = [
  { key: 'city', labelKey: 'feed.scopeCity' },
  { key: 'country', labelKey: 'feed.scopeCountry' },
  { key: 'abroad', labelKey: 'feed.scopeAbroad' },
];

export function FeedPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const scopeParam = (searchParams.get('scope') as FeedScope) || 'city';
  const typeParam = (searchParams.get('type') as FeedFilter) || 'all';
  const [scope, setScope] = useState<FeedScope>(
    SCOPE_FILTERS.some((s) => s.key === scopeParam) ? scopeParam : 'city'
  );
  const [filter, setFilter] = useState<FeedFilter>(
    TYPE_FILTERS.some((f) => f.key === typeParam) ? typeParam : 'all'
  );

  useEffect(() => {
    const next = new URLSearchParams();
    if (scope !== 'city') next.set('scope', scope);
    if (filter !== 'all') next.set('type', filter);
    setSearchParams(next, { replace: true });
  }, [scope, filter, setSearchParams]);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['posts', scope],
    queryFn: () => api<Post[]>(`/posts?scope=${scope}`),
  });

  const filtered = posts.filter((p) => matchesFeedFilter(p.type, filter));
  const city = user?.profile?.current_city;
  const countryLabel = COUNTRY_LABELS[user?.profile?.current_country || ''] || user?.profile?.current_country;

  const scopeLabel = (key: FeedScope) => {
    if (key === 'city' && city) return t('feed.scopeCityNamed', { city });
    return t(SCOPE_FILTERS.find((s) => s.key === key)!.labelKey);
  };

  const emptyMessage =
    scope === 'city'
      ? t('feed.emptyCity', { city: city || t('home.yourArea') })
      : scope === 'country'
        ? t('feed.emptyCountry', { country: countryLabel || '' })
        : t('feed.emptyAbroad');

  return (
    <div className="space-y-5">
      <SearchHero />

      <div className="flex gap-5 lg:gap-6">
        <div className="min-w-0 flex-[1.85] space-y-4">
          <CreatePostCard />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex min-w-0 items-center gap-2 text-sm text-slate-600">
              <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="shrink-0 text-slate-500">{t('feed.showing')}</span>
              <span className="relative min-w-0">
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as FeedScope)}
                  className="w-full max-w-[220px] appearance-none truncate rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-slate-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  aria-label={t('feed.showing')}
                >
                  {SCOPE_FILTERS.map(({ key }) => (
                    <option key={key} value={key}>{scopeLabel(key)}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </span>
            </label>
          </div>

          <div className="flex gap-1 border-b border-slate-200">
            {TYPE_FILTERS.map(({ key, labelKey }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4',
                  filter === key
                    ? 'border-brand-700 text-brand-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-slate-500">{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <Card className="border-slate-200/80">
              <CardContent className="py-12 text-center text-slate-500">
                <p>{emptyMessage}</p>
                <p className="mt-2 text-sm text-slate-400">{t('feed.emptyHint')}</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((post, i) => (
              <div key={post.id} className="space-y-4">
                {i === 0 && <AdBanner />}
                <PostCard post={post} />
              </div>
            ))
          )}
        </div>

        <FeedSidebar />
      </div>
    </div>
  );
}
