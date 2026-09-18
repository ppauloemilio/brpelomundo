import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, MapPin } from 'lucide-react';
import { api, uploadFile } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { PostFormatToolbar } from '@/components/post/PostFormatToolbar';
import { PostImageControls } from '@/components/post/PostImageControls';
import {
  FormattedText,
  buildImageToken,
  findInlineImages,
  insertImageToken,
} from '@/lib/formatPostText';
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  /** Onde o cursor estava quando o usuário pediu a imagem: o seletor de arquivo rouba o foco. */
  const cursorRef = useRef(0);

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
      // As imagens vivem nos marcadores do texto; `images` é derivado deles.
      const images = findInlineImages(content).map((img) => img.url);
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

  const openFilePicker = () => {
    const el = textareaRef.current;
    cursorRef.current = el ? el.selectionStart : content.length;
    setUploadError('');
    fileRef.current?.click();
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const { url } = await uploadFile(file);
      const at = Math.min(cursorRef.current, content.length);
      const { value, cursor } = insertImageToken(content, at, buildImageToken(url, 'center', 80));
      setContent(value);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('post.imageUploadFailed'));
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
                <FormattedText text={content} className="text-sm leading-relaxed text-slate-800" />
              </div>
            )}
          </div>

          <PostImageControls content={content} onChange={setContent} />

          {uploadError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</p>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={openFilePicker}
              disabled={uploading}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-brand-700 disabled:opacity-50"
            >
              <ImagePlus className="h-5 w-5" />
              {uploading ? t('common.loading') : t('post.insertPhotoAtCursor')}
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
