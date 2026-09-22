import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { authMiddleware, AuthRequest, optionalAuth } from '../middleware/auth.js';
import {
  checkoutPlan,
  listPlans,
  listUserAdCampaigns,
  updateAdCampaignCreative,
} from '../lib/billing.js';
import { paramId } from '../lib/params.js';

const router = Router();

router.get('/plans', authMiddleware, async (_req, res) => {
  res.json(await listPlans());
});

router.get('/orders', authMiddleware, async (req: AuthRequest, res) => {
  const orders = await db.all(
    `SELECT o.*, p.name AS plan_name
     FROM billing_orders o
     JOIN billing_plans p ON p.id = o.plan_id
     WHERE o.user_id = ?
     ORDER BY o.created_at DESC
     LIMIT 50`,
    [req.user!.id]
  );
  res.json(orders);
});

router.get('/ad-campaigns', authMiddleware, async (req: AuthRequest, res) => {
  res.json(await listUserAdCampaigns(req.user!.id));
});

router.patch('/ad-campaigns/:id', authMiddleware, async (req: AuthRequest, res) => {
  const { title, image_url, link_url, description } = req.body;
  try {
    const ad = await updateAdCampaignCreative(req.user!.id, paramId(req.params.id), {
      title,
      image_url,
      link_url,
      description,
    });
    res.json(ad);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Falha ao salvar campanha' });
  }
});

router.post('/checkout', authMiddleware, async (req: AuthRequest, res) => {
  const { plan_code, target_id, card_last4, promo_code, ad_creative } = req.body;
  if (!plan_code?.trim()) return res.status(400).json({ error: 'plan_code é obrigatório' });

  const adCreative =
    ad_creative && typeof ad_creative === 'object'
      ? {
          title: String(ad_creative.title || ''),
          image_url: String(ad_creative.image_url || ''),
          link_url: ad_creative.link_url ? String(ad_creative.link_url) : undefined,
          description: ad_creative.description ? String(ad_creative.description) : undefined,
        }
      : undefined;

  try {
    const result = await checkoutPlan({
      userId: req.user!.id,
      planCode: plan_code.trim(),
      targetId: target_id || undefined,
      paymentProvider: 'demo',
      cardLast4: card_last4 || '4242',
      promoCode: promo_code || undefined,
      adCreative,
    });
    res.status(201).json({
      ok: true,
      message: 'Pagamento confirmado (modo demo). Benefício ativado.',
      ...result,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Falha no checkout' });
  }
});

/** Public-ish ad event tracking (auth optional) */
router.post('/ads/:id/events', optionalAuth, async (req: AuthRequest, res) => {
  const adId = paramId(req.params.id);
  const eventType = (req.body.event_type as string) || '';
  const placement = (req.body.placement as string) || 'feed';
  if (!['impression', 'click'].includes(eventType)) {
    return res.status(400).json({ error: 'event_type inválido' });
  }

  const ad = await db.get('SELECT id FROM advertisements WHERE id = ? AND is_active = 1', [adId]);
  if (!ad) return res.status(404).json({ error: 'Anúncio não encontrado' });

  // Light dedupe: same user+ad+type within 2 minutes counts once for impressions
  if (eventType === 'impression' && req.user?.id) {
    const recent = await db.get(
      `SELECT id FROM ad_events
       WHERE ad_id = ? AND user_id = ? AND event_type = 'impression'
         AND created_at >= utc_now(interval '-2 minutes')
       LIMIT 1`,
      [adId, req.user.id]
    );
    if (recent) return res.json({ ok: true, deduped: true });
  }

  await db.run(
    `INSERT INTO ad_events (id, ad_id, event_type, placement, user_id)
     VALUES (?, ?, ?, ?, ?)`,
    [uuid(), adId, eventType, placement, req.user?.id || null]
  );

  res.status(201).json({ ok: true });
});

export default router;
