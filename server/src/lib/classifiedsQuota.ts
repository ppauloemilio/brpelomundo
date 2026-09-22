import { db } from '../db/sql.js';
import { getMonetizationSettings, isPremiumProfile, type MonetizationSettings } from './settings.js';

const BASE_FREE = 1;
const PREMIUM_FREE = 3;

export async function getClassifiedQuota(userId: string) {
  const [profile, settings, active] = await Promise.all([
    db.get<{ is_premium: number; premium_until: string | null; extra_classified_slots: number }>(
      'SELECT is_premium, premium_until, extra_classified_slots FROM public_profiles WHERE user_id = ?',
      [userId]
    ),
    getMonetizationSettings(),
    db.get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM classifieds
       WHERE seller_id = ? AND is_active = 1 AND status = 'active'`,
      [userId]
    ),
  ]);

  const premium = isPremiumProfile(settings, profile);
  const base = premium ? PREMIUM_FREE : BASE_FREE;
  const extra = profile?.extra_classified_slots ?? 0;
  const max = settings.classifieds_paid_enabled ? base + extra : base;
  const used = active?.c ?? 0;

  return {
    used,
    max,
    can_create: used < max,
    premium,
    paid_enabled: settings.classifieds_paid_enabled,
  };
}

export function classifiedLimitMessage(
  settings: MonetizationSettings,
  quota: Awaited<ReturnType<typeof getClassifiedQuota>>
) {
  if (!settings.classifieds_paid_enabled) {
    return 'Limite de anúncios ativos atingido.';
  }
  if (quota.premium) {
    return 'Limite de anúncios ativos atingido. Compre um anúncio extra em Planos.';
  }
  return 'Limite gratuito atingido. Assine Premium (até 3 anúncios) ou compre um anúncio extra em Planos.';
}
