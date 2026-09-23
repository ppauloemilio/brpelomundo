export type AdPlacement = 'feed' | 'sidebar';

export const AD_PLACEMENT_SPECS: Record<
  AdPlacement,
  { pixels: string; ratio: string; i18nSize: string; i18nLabel: string }
> = {
  feed: {
    pixels: '1200×240',
    ratio: '5:1',
    i18nSize: 'billing.adSizeFeed',
    i18nLabel: 'billing.adPlacementFeed',
  },
  sidebar: {
    pixels: '768×256',
    ratio: '3:1',
    i18nSize: 'billing.adSizeSidebar',
    i18nLabel: 'billing.adPlacementSidebar',
  },
};

export type AdCampaignPlanMode = 'feed' | 'sidebar' | 'combo';

export function adCampaignModeFromPlanCode(code: string): AdCampaignPlanMode | null {
  if (code === 'ad_campaign_feed_30d') return 'feed';
  if (code === 'ad_campaign_sidebar_30d') return 'sidebar';
  if (code === 'ad_campaign_30d' || code === 'ad_campaign_combo_30d') return 'combo';
  return null;
}

export function isAdCampaignPlan(productType: string, planCode: string): boolean {
  return productType === 'ad_campaign' || adCampaignModeFromPlanCode(planCode) != null;
}
