import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Building2, ChevronRight, MapPin, User, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { categoryLabel } from '@/components/map/MapBusinessFilters';
import { cn } from '@/lib/utils';

type CommunityUser = {
  id: string;
  full_name: string;
  username: string;
  avatar_url: string | null;
  bio: string;
  current_country: string;
  current_city: string;
  primary_skill: string;
  is_following: boolean;
  is_premium?: boolean;
};

type CommunityBusiness = {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  address: string;
  city: string;
  state: string;
  country: string;
  owner_id: string;
  owner_name: string;
};

type CountryGroup = {
  code: string;
  name: string;
  people_count: number;
  business_count: number;
  users: CommunityUser[];
  businesses: CommunityBusiness[];
};

type CommunityData = {
  stats: { people_count: number; business_count: number; country_count: number };
  current_country: string;
  current_country_name: string;
  current_country_people: number;
  top_countries: Array<{ code: string; name: string; people_count: number; business_count: number }>;
  countries: CountryGroup[];
};

export function CommunityPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [countryFilter, setCountryFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['community', countryFilter],
    queryFn: () => api<CommunityData>(`/community${countryFilter ? `?country=${countryFilter}` : ''}`),
  });

  const followMutation = useMutation({
    mutationFn: ({ userId, unfollow }: { userId: string; unfollow: boolean }) =>
      api(`/social/follow/${userId}`, { method: unfollow ? 'DELETE' : 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community'] }),
  });

  const goToProfile = (userId: string) => navigate(`/user/${userId}`);
  const goToBusiness = (businessId: string) => navigate(`/business-map?business=${businessId}`);

  const businessLocation = (b: CommunityBusiness) => b.city || b.address;
  const businessSubtitle = (b: CommunityBusiness) => b.tagline || b.description;

  if (isLoading) {
    return <p className="py-12 text-center text-slate-500">{t('common.loading')}</p>;
  }

  const stats = data?.stats;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('community.title')}</h1>
        {stats && (
          <p className="mt-1 text-slate-500">
            {t('community.subtitle', {
              people: stats.people_count,
              businesses: stats.business_count,
              countries: stats.country_count,
            })}
          </p>
        )}
      </div>

      {data?.current_country && data.current_country_people > 0 && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          {t('community.inYourCountry', {
            count: data.current_country_people,
            country: data.current_country_name,
          })}
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 space-y-5 lg:w-64">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-900">
              {t('community.filterByCountry')}
            </label>
            <select
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
            >
              <option value="">{t('community.allCountries')}</option>
              {(data?.top_countries || []).map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">{t('community.topCommunities')}</h2>
            <ol className="space-y-2">
              {(data?.top_countries || []).map((c, i) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => setCountryFilter(c.code)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-slate-50',
                      countryFilter === c.code && 'bg-slate-100'
                    )}
                  >
                    <span className="font-medium text-slate-800">
                      {i + 1}. {c.name}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-0.5">
                        <User className="h-3.5 w-3.5" />
                        {c.people_count}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <Building2 className="h-3.5 w-3.5" />
                        {c.business_count}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-6">
          {(data?.countries || []).length === 0 ? (
            <p className="py-12 text-center text-slate-500">{t('community.noMembers')}</p>
          ) : (
            data!.countries.map((group) => (
              <section key={group.code}>
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl bg-sky-50 px-4 py-3">
                  <MapPin className="h-5 w-5 text-sky-600" />
                  <span className="font-semibold text-slate-900">{group.name}</span>
                  <span className="flex items-center gap-3 text-sm text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {t('community.peopleCount', { count: group.people_count })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      {t('community.businessCount', { count: group.business_count })}
                    </span>
                  </span>
                </div>

                <div className="space-y-3">
                  {group.users.map((user) => (
                    <article
                      key={user.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex gap-3">
                        <button type="button" onClick={() => goToProfile(user.id)} className="shrink-0">
                          <Avatar name={user.full_name} src={user.avatar_url} className="h-14 w-14" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => goToProfile(user.id)}
                              className="text-left"
                            >
                              <p className="font-semibold text-slate-900 hover:underline">
                                {user.full_name}
                                {user.is_premium && (
                                  <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800">
                                    {t('admin.premium')}
                                  </span>
                                )}
                              </p>
                            </button>
                            <Button
                              size="sm"
                              variant={user.is_following ? 'outline' : 'default'}
                              className="shrink-0 rounded-full"
                              onClick={() => followMutation.mutate({
                                userId: user.id,
                                unfollow: user.is_following,
                              })}
                            >
                              {user.is_following ? (
                                t('community.following')
                              ) : (
                                <>
                                  <UserPlus className="h-4 w-4" />
                                  {t('community.follow')}
                                </>
                              )}
                            </Button>
                          </div>

                          {user.current_city && (
                            <p className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              {user.current_city}
                            </p>
                          )}

                          {user.primary_skill && (
                            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                              <Briefcase className="h-3.5 w-3.5" />
                              {user.primary_skill}
                            </span>
                          )}

                          {user.bio && (
                            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                              {user.bio}
                            </p>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}

                  {(group.businesses || []).map((biz) => (
                    <article
                      key={biz.id}
                      className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-brand-200 hover:bg-brand-50/30"
                      onClick={() => goToBusiness(biz.id)}
                      onKeyDown={(e) => e.key === 'Enter' && goToBusiness(biz.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="flex gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                          <Building2 className="h-7 w-7" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-slate-900">{biz.name}</p>
                            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                          </div>

                          {businessLocation(biz) && (
                            <p className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              {businessLocation(biz)}
                            </p>
                          )}

                          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                            <Briefcase className="h-3.5 w-3.5" />
                            {categoryLabel(biz.category)}
                          </span>

                          {businessSubtitle(biz) && (
                            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
                              {businessSubtitle(biz)}
                            </p>
                          )}

                          <p className="mt-2 text-xs text-slate-500">
                            {t('map.owner')}: {biz.owner_name}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}

                  {group.users.length === 0 && (group.businesses?.length ?? 0) === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                      {t('community.noMembers')}
                    </p>
                  )}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
