import { db } from '../db/sql.js';
import { parseJson } from '../db/database.js';

export type MonetizationSettings = {
  ads_enabled: boolean;
  featured_business_enabled: boolean;
  paid_posts_enabled: boolean;
  premium_profile_enabled: boolean;
};

export const DEFAULT_MONETIZATION: MonetizationSettings = {
  ads_enabled: false,
  featured_business_enabled: false,
  paid_posts_enabled: false,
  premium_profile_enabled: false,
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
