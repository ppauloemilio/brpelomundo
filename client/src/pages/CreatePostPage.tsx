import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, MapPin, X } from 'lucide-react';
import { api, uploadFile } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { PostFormatToolbar } from '@/components/post/PostFormatToolbar';
import { FormattedText } from '@/lib/formatPostText';
import { useCountryNameMap } from '@/components/explore/ExploreGeoFilters';
import { COUNTRY_LABELS } from '@/lib/utils';
type PostTypeOption = 'text' | 'job' | 'event';

type MeData = {
  full_name: string;
  avatar_url: string | null;
  profile?: {
    current_country: string;
    current_city: string;
    show_city_on_profile: boolean;
  };
};

const TYPE_FROM_PARAM: Record<string, PostTypeOption> = {
  text: 'text',
  image: 'text',
  job: 'job',
  event: 'event',
};

export function CreatePostPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const countryNames = useCountryNameMap();
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [searchParams] = useSearchParams();

  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<PostTypeOption>('text');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const param = searchParams.get('type');
    if (param && TYPE_FROM_PARAM[param]) setPostType(TYPE_FROM_PARAM[param]);
  }, [searchParams]);

  const { data: me } = useQuery({
    queryKey: ['me-create-post'],
    queryFn: () => api<MeData>('/auth/me'),
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const type = images.length > 0 && postType === 'text' ? 'image' : postType;
      return api('/posts', {
        method: 'POST',
        body: JSON.stringify({ content, type, images }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      navigate('/feed');
    },
  });

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadFile(file);
      setImages((prev) => [...prev, url]);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const displayName = me?.full_name || user?.full_name || '';
  const country = me?.profile?.current_country || '';
  const countryLabel = countryNames[country] || COUNTRY_LABELS[country] || country;
  const showCity = me?.profile?.show_city_on_profile !== false;
  const city = me?.profile?.current_city || '';
  const locationLabel = showCity && city ? `${city}, ${countryLabel}` : countryLabel;

  const postTypes: { value: PostTypeOption; label: string }[] = [
    { value: 'text', label: t('post.typeNormal') },
    { value: 'job', label: t('post.typeJob') },
    { value: 'event', label: t('post.typeEvent') },
  ];

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-slate-600 hover:bg-slate-100"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">{t('post.newPost')}</h1>
      </div>

      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-3">
            <Avatar name={displayName} src={me?.avatar_url ?? user?.avatar_url} className="h-12 w-12" />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{displayName}</p>
              {locationLabel && (
                <p className="flex items-center gap-1 text-sm text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{locationLabel}</span>
                </p>
              )}
            </div>
          </div>

          <select
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800"
            value={postType}
            onChange={(e) => setPostType(e.target.value as PostTypeOption)}
          >
            {postTypes.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <div className="space-y-2">
            <PostFormatToolbar
              value={content}
              onChange={setContent}
              textareaRef={textareaRef}
            />
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('post.placeholder')}
              className="min-h-[200px] w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm leading-relaxed outline-none ring-brand-500/30 focus:ring-2"
            />
            {content.trim() && (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-2">
                <p className="mb-1 text-xs font-medium text-slate-500">{t('post.preview')}</p>
                <p className="text-sm leading-relaxed text-slate-800">
                  <FormattedText text={content} />
                </p>
              </div>
            )}
          </div>
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((url) => (
                <div key={url} className="relative h-24 w-24 overflow-hidden rounded-lg border border-slate-200">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                    className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-brand-700 disabled:opacity-50"
            >
              <ImagePlus className="h-5 w-5" />
              {uploading ? t('common.loading') : t('post.addPhoto')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImagePick}
            />
            <Button
              className="rounded-lg px-6"
              onClick={() => mutation.mutate()}
              disabled={!content.trim() || mutation.isPending || uploading}
            >
              {t('post.publish')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
