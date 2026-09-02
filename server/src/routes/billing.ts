import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/database.js';
import { authMiddleware, AuthRequest, optionalAuth } from '../middleware/auth.js';
import {
  checkoutPlan,
  listPlans,
  revenueSummary,
  adMetricsSummary,
} from '../lib/billing.js';

const router = Router();

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

router.get('/plans', authMiddleware, (_req, res) => {
  res.json(listPlans());
});

router.get('/orders', authMiddleware, (req: AuthRequest, res) => {
  const orders = getDb().prepare(
    `SELECT o.*, p.name AS plan_name
     FROM billing_orders o
     JOIN billing_plans p ON p.id = o.plan_id
     WHERE o.user_id = ?
     ORDER BY o.created_at DESC
     LIMIT 50`
  ).all(req.user!.id);
  res.json(orders);
});

router.post('/checkout', authMiddleware, (req: AuthRequest, res) => {
  const { plan_code, target_id, card_last4, promo_code } = req.body;
  if (!plan_code?.trim()) return res.status(400).json({ error: 'plan_code é obrigatório' });

  try {
    const result = checkoutPlan({
      userId: req.user!.id,
      planCode: plan_code.trim(),
      targetId: target_id || undefined,
      paymentProvider: 'demo',
      cardLast4: card_last4 || '4242',
      promoCode: promo_code || undefined,
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
router.post('/ads/:id/events', optionalAuth, (req: AuthRequest, res) => {
  const adId = paramId(req.params.id);
  const eventType = (req.body.event_type as string) || '';
  const placement = (req.body.placement as string) || 'feed';
  if (!['impression', 'click'].includes(eventType)) {
    return res.status(400).json({ error: 'event_type inválido' });
  }

  const db = getDb();
  const ad = db.prepare('SELECT id FROM advertisements WHERE id = ? AND is_active = 1').get(adId);
  if (!ad) return res.status(404).json({ error: 'Anúncio não encontrado' });

  // Light dedupe: same user+ad+type within 2 minutes counts once for impressions
  if (eventType === 'impression' && req.user?.id) {
    const recent = db.prepare(
      `SELECT id FROM ad_events
       WHERE ad_id = ? AND user_id = ? AND event_type = 'impression'
         AND created_at >= datetime('now', '-2 minutes')
       LIMIT 1`
    ).get(adId, req.user.id);
    if (recent) return res.json({ ok: true, deduped: true });
  }

  db.prepare(
    `INSERT INTO ad_events (id, ad_id, event_type, placement, user_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(uuid(), adId, eventType, placement, req.user?.id || null);

  res.status(201).json({ ok: true });
});

export default router;
