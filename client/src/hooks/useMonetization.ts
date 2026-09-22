import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type MonetizationSettings = {
  ads_enabled: boolean;
  featured_business_enabled: boolean;
  paid_posts_enabled: boolean;
  premium_profile_enabled: boolean;
  classifieds_paid_enabled: boolean;
  sponsored_events_enabled: boolean;
};

export function useMonetization() {
  return useQuery({
    queryKey: ['monetization-settings'],
    queryFn: () => api<MonetizationSettings>('/settings/public'),
    staleTime: 60_000,
  });
}
