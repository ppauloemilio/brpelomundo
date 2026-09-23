import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Megaphone } from 'lucide-react';
import { api, assetUrl, uploadFile } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import {
  AD_PLACEMENT_SPECS,
  type AdPlacement,
} from '@/lib/adPlacements';

export type AdCampaign = {
  id: string;
  title: string;
  image_url: string;
  link_url?: string | null;
  description?: string | null;
  placement?: string | null;
  creative_configured: number;
  start_date?: string | null;
  end_date?: string | null;
  order_ends_at?: string | null;
  impressions?: number;
  clicks?: number;
};

export type CampaignForm = {
  title: string;
  image_url: string;
  link_url: string;
  description: string;
};

export function emptyAdCampaignForm(): CampaignForm {
  return { title: '', image_url: '', link_url: '', description: '' };
}

function placementOf(campaign: AdCampaign): AdPlacement {
  return campaign.placement === 'sidebar' ? 'sidebar' : 'feed';
}

function CampaignEditor({
  campaign,
  onSaved,
}: {
  campaign: AdCampaign;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const placement = placementOf(campaign);
  const spec = AD_PLACEMENT_SPECS[placement];
  const [form, setForm] = useState<CampaignForm>({
    title: campaign.title === 'Campanha patrocinada' ? '' : campaign.title,
    image_url: campaign.creative_configured ? campaign.image_url : '',
    link_url: campaign.link_url || '',
    description: campaign.description || '',
  });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      api(`/billing/ad-campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      setError(null);
      setSaved(true);
      onSaved();
    },
    onError: (err: Error) => {
      setSaved(false);
      setError(err.message || t('common.error'));
    },
  });

  const handleImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadFile(file);
      setForm((f) => ({ ...f, image_url: url }));
    } catch {
      setError(t('editProfile.uploadError_failed'));
    } finally {
      setUploading(false);
    }
  };

  const needsSetup = !campaign.creative_configured;
  const endsAt = campaign.order_ends_at || campaign.end_date;
  const previewClass =
    placement === 'feed' ? 'h-16 w-40 rounded-lg object-cover' : 'h-16 w-28 rounded-lg object-cover';

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        needsSetup ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'
      )}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            {t(spec.i18nLabel)}
          </p>
          <p className="font-medium text-slate-900">
            {needsSetup ? t('billing.adCampaignNeedsSetup') : campaign.title}
          </p>
          {endsAt && (
            <p className="text-xs text-slate-500">
              {t('billing.validUntil')} {new Date(endsAt).toLocaleDateString()}
            </p>
          )}
        </div>
        {!needsSetup && (
          <div className="text-right text-xs text-slate-500">
            <p>{t('billing.adImpressions', { count: campaign.impressions ?? 0 })}</p>
            <p>{t('billing.adClicks', { count: campaign.clicks ?? 0 })}</p>
          </div>
        )}
      </div>

      <p className="mb-3 text-xs text-slate-500">{t(spec.i18nSize)}</p>

      {needsSetup && (
        <p className="mb-3 text-sm text-amber-800">{t('billing.adCampaignSetupHint')}</p>
      )}

      <div className="space-y-3">
        <Input
          placeholder={t('billing.adTitle')}
          value={form.title}
          onChange={(e) => {
            setSaved(false);
            setForm({ ...form, title: e.target.value });
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          {form.image_url ? (
            <img
              src={assetUrl(form.image_url) ?? form.image_url}
              alt=""
              className={previewClass}
            />
          ) : (
            <div
              className={cn(
                'flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400',
                placement === 'feed' ? 'h-16 w-40' : 'h-16 w-28'
              )}
            >
              <ImagePlus className="h-6 w-6" />
            </div>
          )}
          <label className="cursor-pointer text-sm font-medium text-brand-700 hover:text-brand-800">
            {uploading ? t('common.loading') : t('billing.adUploadImage')}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])}
            />
          </label>
        </div>
        <Input
          placeholder={t('billing.adLink')}
          value={form.link_url}
          onChange={(e) => {
            setSaved(false);
            setForm({ ...form, link_url: e.target.value });
          }}
        />
        <Input
          placeholder={t('billing.adDescription')}
          value={form.description}
          onChange={(e) => {
            setSaved(false);
            setForm({ ...form, description: e.target.value });
          }}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-700">{t('billing.adCampaignSaved')}</p>}

        <Button
          size="sm"
          disabled={!form.title.trim() || !form.image_url.trim() || save.isPending || uploading}
          onClick={() => save.mutate()}
        >
          {save.isPending ? t('common.loading') : t('billing.adCampaignSave')}
        </Button>
      </div>
    </div>
  );
}

export function AdCampaignPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['billing-ad-campaigns'],
    queryFn: () => api<AdCampaign[]>('/billing/ad-campaigns'),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['billing-ad-campaigns'] });
    qc.invalidateQueries({ queryKey: ['advertisements'] });
  };

  if (isLoading) return null;
  if (campaigns.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          <Megaphone className="h-5 w-5 text-brand-600" />
          {t('billing.myAdCampaigns')}
        </h3>
        <p className="text-sm text-slate-500">{t('billing.myAdCampaignsHint')}</p>
        <div className="space-y-3">
          {campaigns.map((c) => (
            <CampaignEditor key={c.id} campaign={c} onSaved={refresh} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AdCampaignCheckoutFields({
  placement,
  form,
  onChange,
}: {
  placement: AdPlacement;
  form: CampaignForm;
  onChange: (next: CampaignForm) => void;
}) {
  const { t } = useTranslation();
  const spec = AD_PLACEMENT_SPECS[placement];
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImage = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const { url } = await uploadFile(file);
      onChange({ ...form, image_url: url });
    } catch {
      setError(t('editProfile.uploadError_failed'));
    } finally {
      setUploading(false);
    }
  };

  const previewClass =
    placement === 'feed' ? 'h-14 w-32 rounded-lg object-cover' : 'h-14 w-24 rounded-lg object-cover';

  return (
    <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <p className="text-sm font-medium text-slate-800">{t(spec.i18nLabel)}</p>
      <p className="text-xs text-slate-500">{t(spec.i18nSize)}</p>
      <p className="text-xs text-slate-500">{t('billing.adCampaignOptionalHint')}</p>
      <Input
        placeholder={t('billing.adTitle')}
        value={form.title}
        onChange={(e) => onChange({ ...form, title: e.target.value })}
      />
      <div className="flex flex-wrap items-center gap-3">
        {form.image_url ? (
          <img src={assetUrl(form.image_url) ?? form.image_url} alt="" className={previewClass} />
        ) : null}
        <label className="cursor-pointer text-sm font-medium text-brand-700">
          {uploading ? t('common.loading') : t('billing.adUploadImage')}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && handleImage(e.target.files[0])}
          />
        </label>
      </div>
      <Input
        placeholder={t('billing.adLink')}
        value={form.link_url}
        onChange={(e) => onChange({ ...form, link_url: e.target.value })}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
