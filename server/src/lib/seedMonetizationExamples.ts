import type { DatabaseSync } from 'node:sqlite';
import { v4 as uuid } from 'uuid';
import { setMonetizationSettings } from './settings.js';

const DEMO_FLAG = 'monetization_examples_v1';

export function applyMonetizationExamples(db: DatabaseSync) {
  setMonetizationSettings({
    ads_enabled: true,
    featured_business_enabled: true,
    paid_posts_enabled: true,
    premium_profile_enabled: true,
  });

  db.prepare(
    `UPDATE businesses
     SET is_featured = 1, featured_order = 0, featured_until = datetime('now', '+1 year')
     WHERE name = 'Sabor do Brasil'`
  ).run();

  db.prepare(
    `UPDATE posts
     SET is_promoted = 1, promoted_until = datetime('now', '+1 year')
     WHERE type = 'business_promo' OR content LIKE '%Promoção especial%'`
  ).run();

  const premiumUsernames = ['ana_silva', 'beatriz_paes'];
  for (const username of premiumUsernames) {
    const premiumUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as
      | { id: string }
      | undefined;
    if (premiumUser) {
      db.prepare(
        `UPDATE public_profiles
         SET is_premium = 1, premium_until = datetime('now', '+1 year')
         WHERE user_id = ?`
      ).run(premiumUser.id);
    }
  }

  const activeAds = db.prepare('SELECT COUNT(*) as c FROM advertisements WHERE is_active = 1').get() as { c: number };
  if (activeAds.c === 0) {
    db.prepare(
      `INSERT INTO advertisements (id, title, image_url, link_url, description, is_active, order_num)
       VALUES (?, ?, ?, ?, ?, 1, 1)`
    ).run(
      uuid(),
      'Patrocinado — Comunidade Brasil',
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800',
      'https://comunidadebrasil.com',
      'Exemplo de banner publicitário no feed'
    );
  } else {
    db.prepare(
      `UPDATE advertisements SET title = 'Patrocinado — Comunidade Brasil', is_active = 1
       WHERE id = (SELECT id FROM advertisements ORDER BY order_num ASC LIMIT 1)`
    ).run();
  }
}

export function seedMonetizationExamples(db: DatabaseSync) {
  const done = db.prepare('SELECT key FROM app_settings WHERE key = ?').get(DEMO_FLAG);
  if (done) return;

  applyMonetizationExamples(db);

  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(DEMO_FLAG, '1');

  console.log('✅ Exemplos de monetização aplicados:');
  console.log('   • Anúncios → Feed (/) — banner no topo e na sidebar (telas xl+)');
  console.log('   • Empresa em destaque → Mapa (/map) — marcador dourado “Sabor do Brasil”');
  console.log('   • Post promovido → Feed (/) — badge “Promovido” no post de promoção');
  console.log('   • Perfil premium → seu perfil (/profile), Configurações, Explorar (Beatriz)');
}
