import { db } from '../db/sql.js';
import { parseJson } from '../db/database.js';

export type MonetizationSettings = {
  ads_enabled: boolean;
  featured_business_enabled: boolean;
  paid_posts_enabled: boolean;
  premium_profile_enabled: boolean;
  classifieds_paid_enabled: boolean;
  sponsored_events_enabled: boolean;
};

export const DEFAULT_MONETIZATION: MonetizationSettings = {
  ads_enabled: false,
  featured_business_enabled: false,
  paid_posts_enabled: false,
  premium_profile_enabled: false,
  classifieds_paid_enabled: false,
  sponsored_events_enabled: false,
};

const SETTINGS_KEY = 'monetization';

export async function getMonetizationSettings(): Promise<MonetizationSettings> {
  const row = await db.get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [
    SETTINGS_KEY,
  ]);
  if (!row) return { ...DEFAULT_MONETIZATION };
  return { ...DEFAULT_MONETIZATION, ...parseJson(row.value, DEFAULT_MONETIZATION) };
}

export async function setMonetizationSettings(
  patch: Partial<MonetizationSettings>
): Promise<MonetizationSettings> {
  const current = await getMonetizationSettings();
  const next = { ...current, ...patch };
  await db.run(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, utc_now())
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [SETTINGS_KEY, JSON.stringify(next)]
  );
  return next;
}

export async function seedAppSettings() {
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
    [SETTINGS_KEY, JSON.stringify(DEFAULT_MONETIZATION)]
  );
}

type PremiumProfileRow = {
  is_premium?: number | boolean;
  premium_until?: string | null;
};

/**
 * Recebe as settings já carregadas para poder ser chamado em loop sobre uma
 * lista de perfis sem disparar uma consulta por linha.
 */
export function isPremiumProfile(
  settings: MonetizationSettings,
  profile: PremiumProfileRow | undefined
): boolean {
  if (!settings.premium_profile_enabled) return false;
  if (!profile?.is_premium) return false;
  if (profile.premium_until && new Date(profile.premium_until) < new Date()) return false;
  return true;
}

export function isFeaturedClassified(
  settings: MonetizationSettings,
  row: { is_featured?: number | boolean; featured_until?: string | null }
) {
  if (!settings.classifieds_paid_enabled) return false;
  if (!row.is_featured) return false;
  if (row.featured_until && new Date(row.featured_until) < new Date()) return false;
  return true;
}

export function isSponsoredEvent(
  settings: MonetizationSettings,
  row: { is_sponsored?: number | boolean; sponsored_until?: string | null }
) {
  if (!settings.sponsored_events_enabled) return false;
  if (!row.is_sponsored) return false;
  if (row.sponsored_until && new Date(row.sponsored_until) < new Date()) return false;
  return true;
}

export function isLocalFeaturedBusiness(
  row: {
    is_featured?: number | boolean;
    featured_until?: string | null;
    featured_city?: string | null;
    city?: string | null;
  },
  viewerCity?: string
) {
  const featured = !!row.is_featured && (!row.featured_until || new Date(row.featured_until) >= new Date());
  if (!featured) return false;
  const scope = (row.featured_city || '').trim();
  if (!scope) return true;
  const city = (viewerCity || row.city || '').trim();
  return scope.toLowerCase() === city.toLowerCase();
}
