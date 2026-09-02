import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Image, Calendar, Building2, Plus, PenLine } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';

export function CreatePostCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = user?.full_name?.split(' ')[0] || '';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <Card className="overflow-hidden border-slate-200/80 shadow-sm">
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 text-left transition-colors hover:bg-slate-50"
            onClick={() => navigate('/create-post')}
          >
            <Avatar name={user?.full_name || 'U'} src={user?.avatar_url} className="h-10 w-10 shrink-0" />
            <span className="truncate text-slate-400">
              {t('feed.whatsHappening', { name: firstName })}
            </span>
          </button>
          <Button size="sm" className="shrink-0 rounded-full" onClick={() => navigate('/create-post')}>
            <PenLine className="h-4 w-4" />
            <span className="hidden sm:inline">{t('nav.post')}</span>
          </Button>
        </div>

        <div className="relative mt-3 flex items-center justify-between border-t border-slate-100 pt-3" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
            {t('feed.moreOptions')}
          </button>

          {menuOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => { setMenuOpen(false); navigate('/create-post?type=image'); }}
              >
                <Image className="h-4 w-4 text-brand-600" />
                {t('feed.photo')}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => { setMenuOpen(false); navigate('/create-post?type=event'); }}
              >
                <Calendar className="h-4 w-4 text-brand-600" />
                {t('feed.event')}
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => { setMenuOpen(false); navigate('/promote-business'); }}
              >
                <Building2 className="h-4 w-4 text-brand-600" />
                {t('feed.promoteBusiness')}
              </button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
