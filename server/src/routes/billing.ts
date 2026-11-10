import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { authMiddleware, AuthRequest, optionalAuth } from '../middleware/auth.js';
import {
  capturePaypalCheckout,
  checkoutPlan,
  confirmMercadoPagoPayment,
  createMercadoPagoCheckout,
  createPaypalCheckout,
  getMercadoPagoOrderStatus,
  getPaymentConfig,
  listPlans,
  listUserAdCampaigns,
  listUserBillingOrders,
  updateAdCampaignCreative,
} from '../lib/billing.js';
import { mercadopagoConfigured } from '../lib/mercadopago.js';
import { paramId } from '../lib/params.js';

const router = Router();

router.get('/payment-config', authMiddleware, async (_req, res) => {
  res.json(getPaymentConfig());
});

router.get('/plans', authMiddleware, async (_req, res) => {
  res.json(await listPlans());
});

router.get('/orders', authMiddleware, async (req: AuthRequest, res) => {
  res.json(await listUserBillingOrders(req.user!.id));
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

function parseAdCreative(raw: unknown) {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  return {
    title: String(c.title || ''),
    image_url: String(c.image_url || ''),
    link_url: c.link_url ? String(c.link_url) : undefined,
    description: c.description ? String(c.description) : undefined,
  };
}

function parseCheckoutBody(body: Record<string, unknown>) {
  const plan_code = typeof body.plan_code === 'string' ? body.plan_code.trim() : '';
  const target_id = typeof body.target_id === 'string' ? body.target_id : undefined;
  const card_last4 = typeof body.card_last4 === 'string' ? body.card_last4 : undefined;
  const promo_code = typeof body.promo_code === 'string' ? body.promo_code : undefined;
  const ad_creative = parseAdCreative(body.ad_creative);
  const creativesRaw =
    body.ad_creatives && typeof body.ad_creatives === 'object'
      ? (body.ad_creatives as Record<string, unknown>)
      : {};
  const adCreatives = {
    feed: parseAdCreative(body.ad_creative_feed ?? creativesRaw.feed),
    sidebar: parseAdCreative(body.ad_creative_sidebar ?? creativesRaw.sidebar),
  };
  const hasCreatives = !!(adCreatives.feed || adCreatives.sidebar);

  return {
    planCode: plan_code,
    targetId: target_id || undefined,
    cardLast4: card_last4,
    promoCode: promo_code || undefined,
    adCreative: ad_creative,
    adCreatives: hasCreatives
      ? { feed: adCreatives.feed, sidebar: adCreatives.sidebar }
      : undefined,
  };
}

router.post('/checkout', authMiddleware, async (req: AuthRequest, res) => {
  const parsed = parseCheckoutBody(req.body || {});
  if (!parsed.planCode) return res.status(400).json({ error: 'plan_code é obrigatório' });

  try {
    const result = await checkoutPlan({
      userId: req.user!.id,
      planCode: parsed.planCode,
      targetId: parsed.targetId,
      paymentProvider: 'demo',
      cardLast4: parsed.cardLast4 || '4242',
      promoCode: parsed.promoCode,
      adCreative: parsed.adCreative,
      adCreatives: parsed.adCreatives,
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

router.post('/paypal/create-order', authMiddleware, async (req: AuthRequest, res) => {
  const parsed = parseCheckoutBody(req.body || {});
  if (!parsed.planCode) return res.status(400).json({ error: 'plan_code é obrigatório' });

  try {
    const result = await createPaypalCheckout({
      userId: req.user!.id,
      planCode: parsed.planCode,
      targetId: parsed.targetId,
      promoCode: parsed.promoCode,
      adCreative: parsed.adCreative,
      adCreatives: parsed.adCreatives,
      paymentProvider: 'paypal',
    });

    if (result.free) {
      return res.status(201).json({
        ok: true,
        free: true,
        message: 'Cupom aplicado. Benefício ativado sem cobrança.',
        activated: result.activated,
        order: result.order,
        amount_cents: result.amount_cents,
      });
    }

    res.status(201).json({
      ok: true,
      free: false,
      orderId: result.orderId,
      paypalOrderId: result.paypalOrderId,
      amount_cents: result.amount_cents,
      currency: result.currency,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Falha ao criar pedido PayPal' });
  }
});

router.post('/paypal/capture', authMiddleware, async (req: AuthRequest, res) => {
  const paypalOrderId =
    typeof req.body?.paypal_order_id === 'string' ? req.body.paypal_order_id.trim() : '';
  if (!paypalOrderId) {
    return res.status(400).json({ error: 'paypal_order_id é obrigatório' });
  }

  try {
    const result = await capturePaypalCheckout(req.user!.id, paypalOrderId);
    res.json({
      ok: true,
      message: 'Pagamento confirmado. Benefício ativado!',
      ...result,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Falha ao capturar pagamento PayPal' });
  }
});

router.post('/mercadopago/create', authMiddleware, async (req: AuthRequest, res) => {
  const parsed = parseCheckoutBody(req.body || {});
  if (!parsed.planCode) return res.status(400).json({ error: 'plan_code é obrigatório' });

  try {
    const result = await createMercadoPagoCheckout({
      userId: req.user!.id,
      planCode: parsed.planCode,
      targetId: parsed.targetId,
      promoCode: parsed.promoCode,
      adCreative: parsed.adCreative,
      adCreatives: parsed.adCreatives,
      paymentProvider: 'mercadopago',
      payerEmail: req.user!.email,
      payerName: req.user!.full_name || 'Cliente',
    });

    if (result.free) {
      return res.status(201).json({
        ok: true,
        free: true,
        message: 'Cupom aplicado. Benefício ativado sem cobrança.',
        activated: result.activated,
        order: result.order,
        amount_cents: result.amount_cents,
      });
    }

    res.status(201).json({
      ok: true,
      free: false,
      orderId: result.orderId,
      mpPaymentId: result.mpPaymentId,
      pixCopyPaste: result.pixCopyPaste,
      qrDataUrl: result.qrDataUrl,
      amount_cents: result.amount_cents,
      currency: result.currency,
      status: result.status,
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Falha ao criar cobrança PIX' });
  }
});

router.get('/mercadopago/status/:orderId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await getMercadoPagoOrderStatus(req.user!.id, paramId(req.params.orderId));
    res.json({ ok: true, ...result });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Falha ao consultar status' });
  }
});

async function handleMercadoPagoWebhook(req: AuthRequest, res: import('express').Response) {
  if (!mercadopagoConfigured()) {
    return res.status(503).json({ error: 'Mercado Pago não configurado' });
  }

  let paymentId: string | undefined;
  const body = req.body as { type?: string; action?: string; data?: { id?: string | number } };
  if (body?.type === 'payment' && body.data?.id != null) {
    paymentId = String(body.data.id);
  }
  if (!paymentId) {
    const topic = typeof req.query.topic === 'string' ? req.query.topic : '';
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (topic === 'payment' && id) paymentId = id;
  }

  if (!paymentId) {
    return res.status(400).json({ error: 'payment id é obrigatório' });
  }

  try {
    const result = await confirmMercadoPagoPayment(paymentId);
    res.json({ ok: true, ...result });
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status || 500).json({ error: e.message || 'Webhook Mercado Pago falhou' });
  }
}

router.post('/webhooks/mercadopago', handleMercadoPagoWebhook);
router.get('/webhooks/mercadopago', handleMercadoPagoWebhook);

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
