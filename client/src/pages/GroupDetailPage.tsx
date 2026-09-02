import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Card, CardContent } from '@/components/ui/Card';
import { COUNTRY_LABELS } from '@/lib/utils';

type GroupDetail = {
  id: string;
  name: string;
  description: string;
  country: string;
  city: string;
  members_count: number;
  is_member: boolean;
  my_role: string | null;
  owner_name: string;
  members: Array<{ id: string; full_name: string; username: string; avatar_url: string | null; role: string }>;
};

type GroupPost = {
  id: string;
  content: string;
  created_at: string;
  author_snapshot: { full_name: string; username: string; avatar_url?: string };
};

export function GroupDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [content, setContent] = useState('');

  const { data: group, isLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: () => api<GroupDetail>(`/groups/${id}`),
    enabled: !!id,
  });

  const { data: posts = [] } = useQuery({
    queryKey: ['group-posts', id],
    queryFn: () => api<GroupPost[]>(`/groups/${id}/posts`),
    enabled: !!id && !!group?.is_member,
  });

  const join = useMutation({
    mutationFn: () => api(`/groups/${id}/join`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', id] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const leave = useMutation({
    mutationFn: () => api(`/groups/${id}/join`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', id] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const post = useMutation({
    mutationFn: () => api(`/groups/${id}/posts`, { method: 'POST', body: JSON.stringify({ content }) }),
    onSuccess: () => {
      setContent('');
      qc.invalidateQueries({ queryKey: ['group-posts', id] });
    },
  });

  if (isLoading || !group) {
    return <p className="py-12 text-center text-slate-500">{t('common.loading')}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/groups')}>
        <ArrowLeft className="h-4 w-4" />
        {t('groups.title')}
      </Button>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{group.name}</h1>
              <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                <MapPin className="h-3.5 w-3.5" />
                {group.city}, {COUNTRY_LABELS[group.country] || group.country}
              </p>
            </div>
            {group.is_member ? (
              group.my_role !== 'owner' && (
                <Button size="sm" variant="outline" onClick={() => leave.mutate()}>{t('groups.leave')}</Button>
              )
            ) : (
              <Button size="sm" onClick={() => join.mutate()}>{t('groups.join')}</Button>
            )}
          </div>
          {group.description && <p className="text-slate-600">{group.description}</p>}
          <p className="inline-flex items-center gap-1 text-sm text-slate-500">
            <Users className="h-4 w-4" />
            {t('groups.membersCount', { count: group.members_count })}
          </p>
        </CardContent>
      </Card>

      {group.is_member && (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('groups.writePost')}
              rows={3}
            />
            <Button disabled={!content.trim() || post.isPending} onClick={() => post.mutate()}>
              {t('groups.publish')}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {group.is_member ? (
          posts.length === 0 ? (
            <p className="py-8 text-center text-slate-500">{t('groups.noPosts')}</p>
          ) : (
            posts.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex gap-3 pt-4">
                  <Avatar name={p.author_snapshot.full_name} src={p.author_snapshot.avatar_url} className="h-10 w-10" />
                  <div>
                    <p className="font-medium text-slate-900">{p.author_snapshot.full_name}</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{p.content}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          )
        ) : (
          <p className="py-8 text-center text-slate-500">{t('groups.joinToSee')}</p>
        )}
      </div>
    </div>
  );
}
