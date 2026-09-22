import { v4 as uuid } from 'uuid';
import { db } from './sql.js';

const EXTRA_PLANS = [
  {
    code: 'classified_extra',
    product_type: 'classified_extra',
    name: 'Anúncio extra',
    description: 'Publique mais um classificado ativo além do limite gratuito.',
    price_cents: 299,
    currency: 'USD',
    duration_days: 365,
    sort_order: 6,
  },
  {
    code: 'classified_featured_7d',
    product_type: 'classified_featured',
    name: 'Classificado em destaque (7 dias)',
    description: 'Seu anúncio aparece no topo da lista da sua região.',
    price_cents: 999,
    currency: 'USD',
    duration_days: 7,
    sort_order: 7,
  },
  {
    code: 'promoted_job_7d',
    product_type: 'promoted_job',
    name: 'Vaga promovida (7 dias)',
    description: 'Sua vaga sobe no feed com selo Contratando.',
    price_cents: 1499,
    currency: 'USD',
    duration_days: 7,
    sort_order: 8,
  },
  {
    code: 'sponsored_event_14d',
    product_type: 'sponsored_event',
    name: 'Evento patrocinado (14 dias)',
    description: 'Seu evento aparece em destaque na lista da cidade.',
    price_cents: 2499,
    currency: 'USD',
    duration_days: 14,
    sort_order: 9,
  },
  {
    code: 'local_business_30d',
    product_type: 'local_business',
    name: 'Destaque local no mapa (30 dias)',
    description: 'Seu negócio aparece primeiro no mapa da sua cidade.',
    price_cents: 3499,
    currency: 'USD',
    duration_days: 30,
    sort_order: 10,
  },
] as const;

async function migrateBillingPlans() {
  for (const plan of EXTRA_PLANS) {
    const exists = await db.get<{ id: string }>('SELECT id FROM billing_plans WHERE code = ?', [plan.code]);
    if (exists) continue;
    await db.run(
      `INSERT INTO billing_plans (
         id, code, product_type, name, description, price_cents, currency, duration_days, is_active, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [uuid(), plan.code, plan.product_type, plan.name, plan.description, plan.price_cents, plan.currency, plan.duration_days, plan.sort_order]
    );
  }
}

/** Colunas novas em bancos já existentes; idempotente para rodar a cada cold start. */
export async function migrateSchema() {
  await db.exec(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;

    ALTER TABLE classifieds ADD COLUMN IF NOT EXISTS is_featured INTEGER DEFAULT 0;
    ALTER TABLE classifieds ADD COLUMN IF NOT EXISTS featured_until TEXT;

    ALTER TABLE community_events ADD COLUMN IF NOT EXISTS is_sponsored INTEGER DEFAULT 0;
    ALTER TABLE community_events ADD COLUMN IF NOT EXISTS sponsored_until TEXT;

    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS featured_city TEXT;

    ALTER TABLE public_profiles ADD COLUMN IF NOT EXISTS extra_classified_slots INTEGER DEFAULT 0;

    CREATE TABLE IF NOT EXISTS profile_views (
      id TEXT PRIMARY KEY,
      profile_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      viewed_at TEXT NOT NULL DEFAULT utc_now()
    );

    CREATE INDEX IF NOT EXISTS idx_profile_views_profile ON profile_views(profile_user_id, viewed_at);
  `);
  await migrateBillingPlans();
  await restoreSmokeTestBio();
}

/** Bios sobrescritas pelo smoke test antigo — restaura texto demo. */
async function restoreSmokeTestBio() {
  const rows = await db.all<{ user_id: string; full_name: string }>(
    `SELECT p.user_id, u.full_name
     FROM public_profiles p
     JOIN users u ON u.id = p.user_id
     WHERE TRIM(p.bio) = 'smoke'`
  );
  for (const row of rows) {
    await db.run('UPDATE public_profiles SET bio = ? WHERE user_id = ?', [
      `Brasileiro(a) vivendo no exterior. Perfil demo de ${row.full_name}.`,
      row.user_id,
    ]);
  }
}
