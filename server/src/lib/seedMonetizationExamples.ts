import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { setMonetizationSettings } from './settings.js';

const DEMO_FLAG = 'monetization_examples_v1';

export async function applyMonetizationExamples() {
  await setMonetizationSettings({
    ads_enabled: true,
    featured_business_enabled: true,
    paid_posts_enabled: true,
    premium_profile_enabled: true,
    classifieds_paid_enabled: true,
    sponsored_events_enabled: true,
  });

  await db.run(
    `UPDATE businesses
     SET is_featured = 1, featured_order = 0, featured_until = utc_now(interval '1 year')
     WHERE name = 'Sabor do Brasil'`
  );

  await db.run(
    `UPDATE posts
     SET is_promoted = 1, promoted_until = utc_now(interval '1 year')
     WHERE type = 'business_promo' OR content ILIKE '%Promoção especial%'`
  );

  for (const username of ['ana_silva', 'beatriz_paes']) {
    const premiumUser = await db.get<{ id: string }>('SELECT id FROM users WHERE username = ?', [
      username,
    ]);
    if (premiumUser) {
      await db.run(
        `UPDATE public_profiles
         SET is_premium = 1, premium_until = utc_now(interval '1 year')
         WHERE user_id = ?`,
        [premiumUser.id]
      );
    }
  }

  const activeAds = await db.get<{ c: number }>(
    'SELECT COUNT(*) as c FROM advertisements WHERE is_active = 1'
  );
  if ((activeAds?.c ?? 0) === 0) {
    await db.run(
      `INSERT INTO advertisements (
         id, title, image_url, link_url, description, creative_configured, is_active, order_num
       ) VALUES (?, ?, ?, ?, ?, 1, 1, 1)`,
      [
        uuid(),
        'Patrocinado — Comunidade Brasil',
        'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800',
        'https://comunidadebrasil.com',
        'Exemplo de banner publicitário no feed',
      ]
    );
  } else {
    await db.run(
      `UPDATE advertisements SET title = 'Patrocinado — Comunidade Brasil', is_active = 1
       WHERE id = (SELECT id FROM advertisements ORDER BY order_num ASC LIMIT 1)`
    );
  }
}

export async function seedMonetizationExamples() {
  const done = await db.get('SELECT key FROM app_settings WHERE key = ?', [DEMO_FLAG]);
  if (done) return;

  await applyMonetizationExamples();

  await db.run('INSERT INTO app_settings (key, value) VALUES (?, ?)', [DEMO_FLAG, '1']);

  console.log('✅ Exemplos de monetização aplicados');
}
