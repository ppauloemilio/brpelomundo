import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { setMonetizationSettings } from './settings.js';

export type BillingPlan = {
  id: string;
  code: string;
  product_type:
    | 'premium'
    | 'featured_business'
    | 'promoted_post'
    | 'ad_campaign'
    | 'classified_extra'
    | 'classified_featured'
    | 'promoted_job'
    | 'sponsored_event'
    | 'local_business';
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  duration_days: number;
  is_active: number;
  sort_order: number;
  promo_price_cents?: number | null;
  promo_label?: string | null;
  promo_until?: string | null;
};

export type PublicPlan = BillingPlan & {
  effective_price_cents: number;
  original_price_cents: number;
  has_promo: boolean;
  promo_badge?: string | null;
};

export type AdCreativeInput = {
  title: string;
  image_url: string;
  link_url?: string;
  description?: string;
};

export type CheckoutInput = {
  userId: string;
  planCode: string;
  targetId?: string;
  paymentProvider?: 'demo' | 'admin_comp';
  cardLast4?: string;
  promoCode?: string;
  adCreative?: AdCreativeInput;
};

const AD_PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=800&q=80';

export type Promotion = {
  id: string;
  code: string;
  label: string;
  plan_id: string | null;
  discount_percent: number;
  discount_cents: number;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  is_active: number;
};

const PLANS_SEED: Array<Omit<BillingPlan, 'id' | 'is_active'> & { is_active?: number }> = [
  {
    code: 'premium_monthly',
    product_type: 'premium',
    name: 'Premium Mensal',
    description: 'Badge Premium, prioridade no Explorar e destaque no perfil.',
    price_cents: 999,
    currency: 'USD',
    duration_days: 30,
    sort_order: 1,
  },
  {
    code: 'premium_yearly',
    product_type: 'premium',
    name: 'Premium Anual',
    description: '12 meses de Premium com desconto.',
    price_cents: 8999,
    currency: 'USD',
    duration_days: 365,
    sort_order: 2,
  },
  {
    code: 'featured_business_30d',
    product_type: 'featured_business',
    name: 'Negócio em destaque (30 dias)',
    description: 'Seu negócio aparece primeiro no mapa e nas listas.',
    price_cents: 2999,
    currency: 'USD',
    duration_days: 30,
    sort_order: 3,
  },
  {
    code: 'promoted_post_7d',
    product_type: 'promoted_post',
    name: 'Post promovido (7 dias)',
    description: 'Sua publicação sobe no feed com selo Promovido.',
    price_cents: 1499,
    currency: 'USD',
    duration_days: 7,
    sort_order: 4,
  },
  {
    code: 'ad_campaign_30d',
    product_type: 'ad_campaign',
    name: 'Campanha de anúncio (30 dias)',
    description: 'Banner patrocinado no feed com relatório de impressões e cliques.',
    price_cents: 19900,
    currency: 'USD',
    duration_days: 30,
    sort_order: 5,
  },
];

export async function seedBillingPlans() {
  const count = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM billing_plans');
  if ((count?.c ?? 0) > 0) return;

  for (const plan of PLANS_SEED) {
    await db.run(
      `INSERT INTO billing_plans (
         id, code, product_type, name, description, price_cents, currency, duration_days, is_active, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        uuid(),
        plan.code,
        plan.product_type,
        plan.name,
        plan.description,
        plan.price_cents,
        plan.currency,
        plan.duration_days,
        plan.sort_order,
      ]
    );
  }
  console.log('✅ Planos de cobrança seedados');
}

function addDays(days: number, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

function addDaysIso(days: number, from = new Date()) {
  return addDays(days, from).toISOString();
}

/** `YYYY-MM-DD` — formato usado em advertisements.start_date/end_date. */
function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function ensureToggleForProduct(productType: string) {
  const patch: Record<string, boolean> = {};
  if (productType === 'premium') patch.premium_profile_enabled = true;
  if (productType === 'featured_business' || productType === 'local_business') {
    patch.featured_business_enabled = true;
  }
  if (productType === 'promoted_post' || productType === 'promoted_job') {
    patch.paid_posts_enabled = true;
  }
  if (productType === 'ad_campaign') patch.ads_enabled = true;
  if (productType === 'classified_extra' || productType === 'classified_featured') {
    patch.classifieds_paid_enabled = true;
  }
  if (productType === 'sponsored_event') patch.sponsored_events_enabled = true;
  if (Object.keys(patch).length) await setMonetizationSettings(patch);
}

async function activateEntitlement(
  userId: string,
  plan: BillingPlan,
  targetId: string | undefined,
  endsAt: string,
  adCreative?: AdCreativeInput
) {
  await ensureToggleForProduct(plan.product_type);

  if (plan.product_type === 'premium') {
    const profile = await db.get<{ user_id: string; premium_until: string | null }>(
      'SELECT user_id, premium_until FROM public_profiles WHERE user_id = ?',
      [userId]
    );
    if (!profile) {
      await db.run(
        'INSERT INTO public_profiles (user_id, current_country) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING',
        [userId, 'BR']
      );
    }
    const currentUntil = profile?.premium_until ? new Date(profile.premium_until) : null;
    const base = currentUntil && currentUntil > new Date() ? currentUntil : new Date();
    const extended = addDaysIso(plan.duration_days, base);
    await db.run('UPDATE public_profiles SET is_premium = 1, premium_until = ? WHERE user_id = ?', [
      extended,
      userId,
    ]);
    return { target_type: 'user', target_id: userId, ends_at: extended };
  }

  if (plan.product_type === 'featured_business' || plan.product_type === 'local_business') {
    if (!targetId) throw new Error('Selecione um negócio para destacar');
    const biz = await db.get<{ id: string; owner_id: string; city: string }>(
      'SELECT id, owner_id, city FROM businesses WHERE id = ? AND is_active = 1',
      [targetId]
    );
    if (!biz || biz.owner_id !== userId) throw new Error('Negócio inválido');
    const featuredCity = plan.product_type === 'local_business' ? (biz.city || '').trim() : null;
    await db.run(
      `UPDATE businesses SET is_featured = 1, featured_until = ?, featured_order = 0, featured_city = ? WHERE id = ?`,
      [endsAt, featuredCity, targetId]
    );
    return { target_type: 'business', target_id: targetId, ends_at: endsAt };
  }

  if (plan.product_type === 'promoted_post' || plan.product_type === 'promoted_job') {
    if (!targetId) throw new Error('Selecione uma publicação para promover');
    const post = await db.get<{ id: string; author_id: string; type: string }>(
      'SELECT id, author_id, type FROM posts WHERE id = ? AND is_active = 1',
      [targetId]
    );
    if (!post || post.author_id !== userId) throw new Error('Publicação inválida');
    if (plan.product_type === 'promoted_job' && post.type !== 'job') {
      throw new Error('Selecione uma publicação do tipo vaga');
    }
    await db.run('UPDATE posts SET is_promoted = 1, promoted_until = ? WHERE id = ?', [
      endsAt,
      targetId,
    ]);
    return { target_type: 'post', target_id: targetId, ends_at: endsAt };
  }

  if (plan.product_type === 'classified_extra') {
    await db.run(
      `INSERT INTO public_profiles (user_id, current_country, extra_classified_slots)
       VALUES (?, 'BR', 1)
       ON CONFLICT (user_id) DO UPDATE SET extra_classified_slots = public_profiles.extra_classified_slots + 1`,
      [userId]
    );
    return { target_type: 'user', target_id: userId, ends_at: endsAt };
  }

  if (plan.product_type === 'classified_featured') {
    if (!targetId) throw new Error('Selecione um classificado para destacar');
    const listing = await db.get<{ id: string; seller_id: string }>(
      'SELECT id, seller_id FROM classifieds WHERE id = ? AND is_active = 1',
      [targetId]
    );
    if (!listing || listing.seller_id !== userId) throw new Error('Classificado inválido');
    await db.run(
      'UPDATE classifieds SET is_featured = 1, featured_until = ? WHERE id = ?',
      [endsAt, targetId]
    );
    return { target_type: 'classified', target_id: targetId, ends_at: endsAt };
  }

  if (plan.product_type === 'sponsored_event') {
    if (!targetId) throw new Error('Selecione um evento para patrocinar');
    const event = await db.get<{ id: string; organizer_id: string }>(
      'SELECT id, organizer_id FROM community_events WHERE id = ? AND is_active = 1',
      [targetId]
    );
    if (!event || event.organizer_id !== userId) throw new Error('Evento inválido');
    await db.run(
      'UPDATE community_events SET is_sponsored = 1, sponsored_until = ? WHERE id = ?',
      [endsAt, targetId]
    );
    return { target_type: 'event', target_id: targetId, ends_at: endsAt };
  }

  if (plan.product_type === 'ad_campaign') {
    const adId = targetId || uuid();
    const endDay = isoDay(addDays(plan.duration_days));
    const creative = adCreative;
    const configured = !!(creative?.title?.trim() && creative?.image_url?.trim());
    const title = configured ? creative!.title.trim() : 'Campanha patrocinada';
    const imageUrl = configured ? creative!.image_url.trim() : AD_PLACEHOLDER_IMAGE;
    const linkUrl = configured ? (creative!.link_url?.trim() || '') : '';
    const description = configured
      ? (creative!.description?.trim() || '')
      : 'Configure seu banner em Planos e cobrança.';

    const existing = await db.get('SELECT id FROM advertisements WHERE id = ?', [adId]);
    if (!existing) {
      await db.run(
        `INSERT INTO advertisements (
           id, title, image_url, link_url, description, owner_id, creative_configured,
           is_active, order_num, start_date, end_date
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        [
          adId,
          title,
          imageUrl,
          linkUrl,
          description,
          userId,
          configured ? 1 : 0,
          isoDay(new Date()),
          endDay,
        ]
      );
    } else {
      await db.run(
        `UPDATE advertisements SET is_active = 1, end_date = ?, owner_id = COALESCE(owner_id, ?)
         WHERE id = ?`,
        [endDay, userId, adId]
      );
    }
    return { target_type: 'advertisement', target_id: adId, ends_at: endsAt, needs_creative: !configured };
  }

  throw new Error('Tipo de plano não suportado');
}

function planPromoActive(plan: BillingPlan) {
  if (plan.promo_price_cents == null || plan.promo_price_cents < 0) return false;
  if (plan.promo_until && new Date(plan.promo_until) < new Date()) return false;
  return plan.promo_price_cents < plan.price_cents;
}

export function toPublicPlan(plan: BillingPlan): PublicPlan {
  const hasPromo = planPromoActive(plan);
  return {
    ...plan,
    original_price_cents: plan.price_cents,
    effective_price_cents: hasPromo ? Number(plan.promo_price_cents) : plan.price_cents,
    has_promo: hasPromo,
    promo_badge: hasPromo ? (plan.promo_label || 'Promo') : null,
  };
}

async function findActiveCoupon(code: string, planId: string): Promise<Promotion | null> {
  const promo = await db.get<Promotion>(
    `SELECT * FROM billing_promotions
     WHERE UPPER(code) = UPPER(?) AND is_active = 1`,
    [code.trim()]
  );
  if (!promo) return null;
  if (promo.plan_id && promo.plan_id !== planId) return null;
  if (promo.starts_at && new Date(promo.starts_at) > new Date()) return null;
  if (promo.ends_at && new Date(promo.ends_at) < new Date()) return null;
  if (promo.max_uses != null && promo.used_count >= promo.max_uses) return null;
  return promo;
}

function applyCoupon(baseCents: number, promo: Promotion) {
  let price = baseCents;
  if (promo.discount_percent > 0) {
    price = Math.round(price * (1 - Math.min(100, promo.discount_percent) / 100));
  }
  if (promo.discount_cents > 0) {
    price = Math.max(0, price - promo.discount_cents);
  }
  return price;
}

export async function checkoutPlan(input: CheckoutInput) {
  const plan = await db.get<BillingPlan>(
    'SELECT * FROM billing_plans WHERE code = ? AND is_active = 1',
    [input.planCode]
  );
  if (!plan) throw Object.assign(new Error('Plano não encontrado'), { status: 404 });

  const publicPlan = toPublicPlan(plan);
  let amountCents = publicPlan.effective_price_cents;
  let appliedPromo: Promotion | null = null;

  if (input.promoCode?.trim()) {
    appliedPromo = await findActiveCoupon(input.promoCode, plan.id);
    if (!appliedPromo) {
      throw Object.assign(new Error('Cupom inválido ou expirado'), { status: 400 });
    }
    amountCents = applyCoupon(amountCents, appliedPromo);
  }

  const orderId = uuid();
  const startsAt = new Date().toISOString();
  const endsAt = addDaysIso(plan.duration_days);
  const isComp = input.paymentProvider === 'admin_comp';
  const paymentRef = isComp
    ? `comp_${Date.now()}`
    : `demo_${Date.now()}_${(input.cardLast4 || '4242').slice(-4)}`;

  let activation: { target_type: string; target_id: string; ends_at: string };
  try {
    activation = await activateEntitlement(
      input.userId,
      plan,
      input.targetId,
      endsAt,
      input.adCreative
    );
  } catch (err) {
    throw Object.assign(err instanceof Error ? err : new Error('Falha ao ativar'), { status: 400 });
  }

  if (appliedPromo) {
    await db.run('UPDATE billing_promotions SET used_count = used_count + 1 WHERE id = ?', [
      appliedPromo.id,
    ]);
  }

  await db.run(
    `INSERT INTO billing_orders (
       id, user_id, plan_id, plan_code, product_type, amount_cents, currency, status,
       payment_provider, payment_ref, target_type, target_id, starts_at, ends_at, paid_at, metadata
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, utc_now(), ?)`,
    [
      orderId,
      input.userId,
      plan.id,
      plan.code,
      plan.product_type,
      isComp ? 0 : amountCents,
      plan.currency,
      input.paymentProvider || 'demo',
      paymentRef,
      activation.target_type,
      activation.target_id,
      startsAt,
      activation.ends_at,
      JSON.stringify({
        card_last4: isComp ? null : (input.cardLast4 || '4242'),
        simulated: !isComp,
        complimentary: isComp,
        list_price_cents: plan.price_cents,
        plan_promo: publicPlan.has_promo,
        coupon: appliedPromo?.code || null,
        discount_from_list: plan.price_cents - (isComp ? 0 : amountCents),
      }),
    ]
  );

  const order = await db.get('SELECT * FROM billing_orders WHERE id = ?', [orderId]);
  return { order, plan: publicPlan, activated: activation, amount_cents: isComp ? 0 : amountCents };
}

export async function grantComplimentary(opts: {
  userId: string;
  planCode: string;
  targetId?: string;
  durationDays?: number;
  note?: string;
  adminId: string;
}) {
  const plan = await db.get<BillingPlan>('SELECT * FROM billing_plans WHERE code = ?', [
    opts.planCode,
  ]);
  if (!plan) throw Object.assign(new Error('Plano não encontrado'), { status: 404 });

  const days = opts.durationDays && opts.durationDays > 0 ? opts.durationDays : plan.duration_days;
  const planWithDays = { ...plan, duration_days: days };
  const endsAt = addDaysIso(days);
  const startsAt = new Date().toISOString();

  let activation: { target_type: string; target_id: string; ends_at: string };
  try {
    activation = await activateEntitlement(opts.userId, planWithDays, opts.targetId, endsAt);
  } catch (err) {
    throw Object.assign(err instanceof Error ? err : new Error('Falha ao ativar'), { status: 400 });
  }

  const orderId = uuid();
  await db.run(
    `INSERT INTO billing_orders (
       id, user_id, plan_id, plan_code, product_type, amount_cents, currency, status,
       payment_provider, payment_ref, target_type, target_id, starts_at, ends_at, paid_at, metadata
     ) VALUES (?, ?, ?, ?, ?, 0, ?, 'paid', 'admin_comp', ?, ?, ?, ?, ?, utc_now(), ?)`,
    [
      orderId,
      opts.userId,
      plan.id,
      plan.code,
      plan.product_type,
      plan.currency,
      `comp_${Date.now()}`,
      activation.target_type,
      activation.target_id,
      startsAt,
      activation.ends_at,
      JSON.stringify({
        complimentary: true,
        granted_by: opts.adminId,
        note: opts.note || '',
        duration_days: days,
      }),
    ]
  );

  return {
    order: await db.get('SELECT * FROM billing_orders WHERE id = ?', [orderId]),
    activated: activation,
  };
}

export async function listPlans() {
  const rows = await db.all<BillingPlan>(
    'SELECT * FROM billing_plans WHERE is_active = 1 ORDER BY sort_order ASC, price_cents ASC'
  );
  return rows.map(toPublicPlan);
}

export function listAllPlans() {
  return db.all<BillingPlan>('SELECT * FROM billing_plans ORDER BY sort_order ASC, price_cents ASC');
}

export async function updatePlan(id: string, patch: Partial<{
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  duration_days: number;
  is_active: boolean;
  sort_order: number;
  promo_price_cents: number | null;
  promo_label: string | null;
  promo_until: string | null;
}>) {
  const plan = await db.get<BillingPlan>('SELECT * FROM billing_plans WHERE id = ?', [id]);
  if (!plan) throw Object.assign(new Error('Plano não encontrado'), { status: 404 });

  await db.run(
    `UPDATE billing_plans SET
       name = COALESCE(?, name),
       description = COALESCE(?, description),
       price_cents = COALESCE(?, price_cents),
       currency = COALESCE(?, currency),
       duration_days = COALESCE(?, duration_days),
       is_active = COALESCE(?, is_active),
       sort_order = COALESCE(?, sort_order),
       promo_price_cents = CASE WHEN ? THEN ? ELSE promo_price_cents END,
       promo_label = CASE WHEN ? THEN ? ELSE promo_label END,
       promo_until = CASE WHEN ? THEN ? ELSE promo_until END
     WHERE id = ?`,
    [
      patch.name?.trim() ?? null,
      patch.description?.trim() ?? null,
      patch.price_cents != null ? Math.max(0, Math.round(patch.price_cents)) : null,
      patch.currency?.trim() ?? null,
      patch.duration_days != null ? Math.max(1, Math.round(patch.duration_days)) : null,
      patch.is_active !== undefined ? (patch.is_active ? 1 : 0) : null,
      patch.sort_order != null ? patch.sort_order : null,
      patch.promo_price_cents !== undefined,
      patch.promo_price_cents !== undefined ? patch.promo_price_cents : null,
      patch.promo_label !== undefined,
      patch.promo_label !== undefined ? (patch.promo_label || '') : null,
      patch.promo_until !== undefined,
      patch.promo_until !== undefined ? patch.promo_until : null,
      id,
    ]
  );

  return db.get('SELECT * FROM billing_plans WHERE id = ?', [id]);
}

export function listPromotions() {
  return db.all(
    `SELECT pr.*, bp.code AS plan_code, bp.name AS plan_name
     FROM billing_promotions pr
     LEFT JOIN billing_plans bp ON bp.id = pr.plan_id
     ORDER BY pr.created_at DESC`
  );
}

export async function createPromotion(input: {
  code: string;
  label?: string;
  plan_id?: string | null;
  discount_percent?: number;
  discount_cents?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  max_uses?: number | null;
}) {
  const code = input.code.trim().toUpperCase();
  if (!code) throw Object.assign(new Error('Código obrigatório'), { status: 400 });
  const exists = await db.get('SELECT id FROM billing_promotions WHERE UPPER(code) = ?', [code]);
  if (exists) throw Object.assign(new Error('Código já existe'), { status: 409 });

  const id = uuid();
  await db.run(
    `INSERT INTO billing_promotions (
       id, code, label, plan_id, discount_percent, discount_cents, starts_at, ends_at, max_uses
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      code,
      input.label?.trim() || '',
      input.plan_id || null,
      Math.max(0, Math.min(100, input.discount_percent || 0)),
      Math.max(0, input.discount_cents || 0),
      input.starts_at || null,
      input.ends_at || null,
      input.max_uses ?? null,
    ]
  );
  return db.get('SELECT * FROM billing_promotions WHERE id = ?', [id]);
}

export async function updatePromotion(id: string, patch: Partial<{
  label: string;
  discount_percent: number;
  discount_cents: number;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  is_active: boolean;
  plan_id: string | null;
}>) {
  const row = await db.get('SELECT id FROM billing_promotions WHERE id = ?', [id]);
  if (!row) throw Object.assign(new Error('Promoção não encontrada'), { status: 404 });

  await db.run(
    `UPDATE billing_promotions SET
       label = COALESCE(?, label),
       discount_percent = COALESCE(?, discount_percent),
       discount_cents = COALESCE(?, discount_cents),
       starts_at = CASE WHEN ? THEN ? ELSE starts_at END,
       ends_at = CASE WHEN ? THEN ? ELSE ends_at END,
       max_uses = CASE WHEN ? THEN ? ELSE max_uses END,
       is_active = COALESCE(?, is_active),
       plan_id = CASE WHEN ? THEN ? ELSE plan_id END
     WHERE id = ?`,
    [
      patch.label?.trim() ?? null,
      patch.discount_percent != null ? Math.max(0, Math.min(100, patch.discount_percent)) : null,
      patch.discount_cents != null ? Math.max(0, patch.discount_cents) : null,
      patch.starts_at !== undefined,
      patch.starts_at !== undefined ? patch.starts_at : null,
      patch.ends_at !== undefined,
      patch.ends_at !== undefined ? patch.ends_at : null,
      patch.max_uses !== undefined,
      patch.max_uses !== undefined ? patch.max_uses : null,
      patch.is_active !== undefined ? (patch.is_active ? 1 : 0) : null,
      patch.plan_id !== undefined,
      patch.plan_id !== undefined ? patch.plan_id : null,
      id,
    ]
  );
  return db.get('SELECT * FROM billing_promotions WHERE id = ?', [id]);
}

export async function deletePromotion(id: string) {
  await db.run('DELETE FROM billing_promotions WHERE id = ?', [id]);
}

export async function revenueSummary() {
  const [paid, byProduct, recent] = await Promise.all([
    db.all<{ orders_count: number; revenue_cents: number; currency: string }>(
      `SELECT
         COUNT(*) AS orders_count,
         COALESCE(SUM(amount_cents), 0) AS revenue_cents,
         currency
       FROM billing_orders
       WHERE status = 'paid'
       GROUP BY currency`
    ),
    db.all(
      `SELECT product_type, COUNT(*) AS orders_count, COALESCE(SUM(amount_cents), 0) AS revenue_cents
       FROM billing_orders WHERE status = 'paid'
       GROUP BY product_type`
    ),
    db.all(
      `SELECT o.*, u.full_name AS user_name, u.email AS user_email, p.name AS plan_name
       FROM billing_orders o
       JOIN users u ON u.id = o.user_id
       JOIN billing_plans p ON p.id = o.plan_id
       ORDER BY o.created_at DESC
       LIMIT 30`
    ),
  ]);

  return { by_currency: paid, by_product: byProduct, recent_orders: recent };
}

export type AdCampaign = {
  id: string;
  title: string;
  image_url: string;
  link_url: string | null;
  description: string | null;
  is_active: number;
  creative_configured: number;
  start_date: string | null;
  end_date: string | null;
  order_ends_at: string | null;
  impressions: number;
  clicks: number;
};

export async function listUserAdCampaigns(userId: string) {
  const rows = await db.all<AdCampaign>(
    `SELECT a.id, a.title, a.image_url, a.link_url, a.description, a.is_active,
            a.creative_configured, a.start_date, a.end_date,
            (
              SELECT MAX(o.ends_at) FROM billing_orders o
              WHERE o.target_type = 'advertisement' AND o.target_id = a.id AND o.user_id = ?
            ) AS order_ends_at,
            COALESCE((
              SELECT COUNT(*) FROM ad_events e
              WHERE e.ad_id = a.id AND e.event_type = 'impression'
            ), 0) AS impressions,
            COALESCE((
              SELECT COUNT(*) FROM ad_events e
              WHERE e.ad_id = a.id AND e.event_type = 'click'
            ), 0) AS clicks
     FROM advertisements a
     WHERE a.owner_id = ?
     ORDER BY a.start_date DESC NULLS LAST, a.title ASC`,
    [userId, userId]
  );
  return rows;
}

export async function updateAdCampaignCreative(
  userId: string,
  adId: string,
  patch: AdCreativeInput
) {
  const title = patch.title?.trim();
  const imageUrl = patch.image_url?.trim();
  if (!title) throw Object.assign(new Error('Título é obrigatório'), { status: 400 });
  if (!imageUrl) throw Object.assign(new Error('Imagem é obrigatória'), { status: 400 });

  const ad = await db.get<{ id: string; owner_id: string | null }>(
    'SELECT id, owner_id FROM advertisements WHERE id = ?',
    [adId]
  );
  if (!ad || ad.owner_id !== userId) {
    throw Object.assign(new Error('Campanha não encontrada'), { status: 404 });
  }

  await db.run(
    `UPDATE advertisements SET
       title = ?,
       image_url = ?,
       link_url = ?,
       description = ?,
       creative_configured = 1
     WHERE id = ?`,
    [
      title,
      imageUrl,
      patch.link_url?.trim() || '',
      patch.description?.trim() || '',
      adId,
    ]
  );

  return db.get('SELECT * FROM advertisements WHERE id = ?', [adId]);
}

export async function adMetricsSummary() {
  const [totals, perAd] = await Promise.all([
    db.get<{ impressions: number | null; clicks: number | null }>(
      `SELECT
         SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END) AS impressions,
         SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
       FROM ad_events`
    ),
    db.all<{ id: string; title: string; is_active: number; impressions: number; clicks: number }>(
      `SELECT a.id, a.title, a.is_active,
         SUM(CASE WHEN e.event_type = 'impression' THEN 1 ELSE 0 END) AS impressions,
         SUM(CASE WHEN e.event_type = 'click' THEN 1 ELSE 0 END) AS clicks
       FROM advertisements a
       LEFT JOIN ad_events e ON e.ad_id = a.id
       GROUP BY a.id
       ORDER BY impressions DESC, a.order_num ASC`
    ),
  ]);

  const impressions = totals?.impressions || 0;
  const clicks = totals?.clicks || 0;
  return {
    impressions,
    clicks,
    ctr: impressions ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
    ads: perAd.map((a) => ({
      ...a,
      ctr: a.impressions ? Number(((a.clicks / a.impressions) * 100).toFixed(2)) : 0,
    })),
  };
}
