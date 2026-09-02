import { getDb, parseJson } from '../db/database.js';

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

export function getMonetizationSettings(): MonetizationSettings {
  const db = getDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(SETTINGS_KEY) as
    | { value: string }
    | undefined;
  if (!row) return { ...DEFAULT_MONETIZATION };
  return { ...DEFAULT_MONETIZATION, ...parseJson(row.value, DEFAULT_MONETIZATION) };
}

export function setMonetizationSettings(patch: Partial<MonetizationSettings>): MonetizationSettings {
  const db = getDb();
  const current = getMonetizationSettings();
  const next = { ...current, ...patch };
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function seedAppSettings(db: ReturnType<typeof getDb>) {
  const exists = db.prepare('SELECT key FROM app_settings WHERE key = ?').get(SETTINGS_KEY);
  if (!exists) {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
      SETTINGS_KEY,
      JSON.stringify(DEFAULT_MONETIZATION)
    );
  }
}

type PremiumProfileRow = {
  is_premium?: number | boolean;
  premium_until?: string | null;
};

export function isPremiumProfile(profile: PremiumProfileRow | undefined): boolean {
  const settings = getMonetizationSettings();
  if (!settings.premium_profile_enabled) return false;
  if (!profile?.is_premium) return false;
  if (profile.premium_until && new Date(profile.premium_until) < new Date()) return false;
  return true;
}
