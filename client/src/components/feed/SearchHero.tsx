import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Send } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

type SearchResults = {
  businesses: Array<{ id: string; name: string; category: string; address: string }>;
  users: Array<{ id: string; full_name: string; username: string }>;
  posts: Array<{ id: string; content: string }>;
};

export function SearchHero() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const data = await api<SearchResults>(`/search?q=${encodeURIComponent(query.trim())}`);
      setResults(data);
    } catch {
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const handleNearMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => navigate(`/business-map?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&near=1`),
        () => navigate('/business-map?near=1')
      );
    } else {
      navigate('/business-map?near=1');
    }
  };

  return (
    <section className="rounded-2xl bg-brand-700 px-6 py-7 text-white">
      <h2 className="text-2xl font-bold">{t('search.title')}</h2>
      <p className="mt-1 text-brand-100">{t('search.subtitle')}</p>
      <form onSubmit={handleSearch} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setResults(null); }}
            placeholder={t('search.placeholder')}
            className="h-12 rounded-full border-0 pl-12 text-base shadow-sm"
          />
        </div>
        <Button type="button" variant="hero" size="lg" onClick={handleNearMe} className="shrink-0 rounded-full">
          <Send className="h-4 w-4" />
          {t('search.nearMe')}
        </Button>
      </form>

      {searching && <p className="mt-3 text-sm text-brand-100">{t('common.loading')}</p>}

      {results && (
        <div className="mt-4 rounded-xl bg-white/10 p-4 backdrop-blur">
          {results.businesses.length === 0 && results.users.length === 0 && results.posts.length === 0 ? (
            <p className="text-sm">{t('search.noResults')}</p>
          ) : (
            <div className="space-y-3 text-sm">
              {results.businesses.slice(0, 3).map((b) => (
                <button key={b.id} type="button" className="block w-full text-left hover:underline" onClick={() => navigate('/business-map')}>
                  🏢 {b.name} — {b.category}
                </button>
              ))}
              {results.users.slice(0, 3).map((u) => (
                <button key={u.id} type="button" className="block w-full text-left hover:underline" onClick={() => navigate(`/user/${u.id}`)}>
                  👤 {u.full_name} (@{u.username})
                </button>
              ))}
              {results.posts.slice(0, 2).map((p) => (
                <p key={p.id} className="line-clamp-1 opacity-90">📝 {p.content}</p>
              ))}
              <button type="button" className="font-medium underline" onClick={() => navigate(`/explore?q=${encodeURIComponent(query)}`)}>
                {t('search.seeAll')}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
