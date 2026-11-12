import crypto from 'node:crypto';
import QRCode from 'qrcode';

type MercadoPagoPaymentResponse = {
  id?: number;
  status?: string;
  external_reference?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
  message?: string;
  error?: string;
  cause?: Array<{ description?: string }>;
};

function normalizeEnv(value: string | undefined): string {
  if (!value) return '';
  return value.trim().replace(/^['"]|['"]$/g, '');
}

export function getMercadoPagoAccessToken(): string {
  return normalizeEnv(process.env.MERCADOPAGO_ACCESS_TOKEN);
}

export function getMercadoPagoTestPayerEmail(): string {
  return normalizeEnv(process.env.MERCADOPAGO_TEST_PAYER_EMAIL);
}

export function mercadopagoConfigured(): boolean {
  const token = getMercadoPagoAccessToken();
  return token.startsWith('TEST-') || token.startsWith('APP_USR-');
}

export function isMercadoPagoTestToken(token = getMercadoPagoAccessToken()): boolean {
  return token.startsWith('TEST-');
}

function appPublicUrl(): string {
  const fromEnv = normalizeEnv(process.env.APP_URL) || normalizeEnv(process.env.CORS_ORIGIN)?.split(',')[0];
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/+$/, '')}`;
  return 'http://localhost:5173';
}

function extractError(data: MercadoPagoPaymentResponse): string {
  const causes = data.cause?.map((c) => c.description).filter(Boolean) as string[] | undefined;
  if (causes?.length) return causes.join('; ');
  return data.message || data.error || 'Falha ao criar cobrança PIX no Mercado Pago';
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'Cliente', lastName: 'BRPeloMundo' };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: 'BRPeloMundo' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

function resolvePayerEmail(accessToken: string, payerEmail: string): string {
  const testEmail = getMercadoPagoTestPayerEmail();
  if (isMercadoPagoTestToken(accessToken) && testEmail) return testEmail;
  const trimmed = payerEmail.trim();
  if (trimmed.includes('@')) return trimmed;
  return 'pagador@brpelomundo.app';
}

export async function createMercadoPagoPixCharge(opts: {
  amountCents: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  payerName: string;
  expirationMinutes?: number;
}): Promise<{ paymentId: string; pixCopyPaste: string; qrDataUrl: string; status: string }> {
  const accessToken = getMercadoPagoAccessToken();
  if (!mercadopagoConfigured()) {
    throw Object.assign(new Error('Mercado Pago não configurado'), { status: 503 });
  }

  const amount = Math.round(opts.amountCents) / 100;
  if (amount < 0.01) {
    throw Object.assign(new Error('Valor inválido para PIX'), { status: 400 });
  }

  const { firstName, lastName } = splitName(opts.payerName);
  const payerEmail = resolvePayerEmail(accessToken, opts.payerEmail);
  const expiresAt = new Date(Date.now() + (opts.expirationMinutes || 60) * 60 * 1000);
  const appUrl = appPublicUrl();

  const body: Record<string, unknown> = {
    transaction_amount: amount,
    description: opts.description.slice(0, 200),
    payment_method_id: 'pix',
    external_reference: opts.externalReference,
    date_of_expiration: expiresAt.toISOString(),
    notification_url: `${appUrl}/api/billing/webhooks/mercadopago`,
    payer: {
      email: payerEmail,
      first_name: firstName,
      last_name: lastName,
    },
  };

  // Sandbox do MP costuma exigir identificação de teste.
  if (isMercadoPagoTestToken(accessToken)) {
    (body.payer as Record<string, unknown>).identification = {
      type: 'CPF',
      number: '19119119100',
    };
  }

  const response = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': opts.externalReference,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as MercadoPagoPaymentResponse;
  if (!response.ok || !data.id) {
    const detail = extractError(data);
    console.error('Mercado Pago create payment error:', detail, data);
    throw Object.assign(new Error(detail), { status: 502 });
  }

  const pixCopyPaste = data.point_of_interaction?.transaction_data?.qr_code;
  if (!pixCopyPaste) {
    throw Object.assign(new Error('Mercado Pago não retornou o código PIX'), { status: 502 });
  }

  const qrFromMp = data.point_of_interaction?.transaction_data?.qr_code_base64;
  const qrDataUrl = qrFromMp
    ? `data:image/png;base64,${qrFromMp}`
    : await QRCode.toDataURL(pixCopyPaste, { width: 256, margin: 2 });

  return {
    paymentId: String(data.id),
    pixCopyPaste,
    qrDataUrl,
    status: data.status || 'pending',
  };
}

export async function fetchMercadoPagoPayment(paymentId: string): Promise<MercadoPagoPaymentResponse> {
  const accessToken = getMercadoPagoAccessToken();
  if (!mercadopagoConfigured()) {
    throw Object.assign(new Error('Mercado Pago não configurado'), { status: 503 });
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Mercado Pago fetch payment error:', response.status, text);
    throw Object.assign(new Error('Não foi possível consultar o pagamento no Mercado Pago'), { status: 502 });
  }

  return (await response.json()) as MercadoPagoPaymentResponse;
}

export function getMercadoPagoWebhookSecret(): string {
  return normalizeEnv(process.env.MERCADOPAGO_WEBHOOK_SECRET);
}

/**
 * Valida x-signature do webhook (HMAC-SHA256).
 * Docs MP: manifest `id:{data.id};request-id:{x-request-id};ts:{ts};`
 * data.id alfanumérico deve ir em minúsculas.
 */
export function verifyMercadoPagoWebhookSignature(opts: {
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
}): { ok: true } | { ok: false; reason: string } {
  const secret = getMercadoPagoWebhookSecret();
  if (!secret) {
    return { ok: false, reason: 'MERCADOPAGO_WEBHOOK_SECRET não configurado' };
  }
  if (!opts.xSignature || !opts.xRequestId || !opts.dataId) {
    return { ok: false, reason: 'Cabeçalhos/assinatura incompletos' };
  }

  const parts = Object.fromEntries(
    opts.xSignature.split(',').map((p) => {
      const idx = p.indexOf('=');
      if (idx === -1) return [p.trim(), ''];
      return [p.slice(0, idx).trim(), p.slice(idx + 1).trim()];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return { ok: false, reason: 'x-signature sem ts/v1' };

  // Rejeita timestamps muito antigos/futuros (~5 min).
  const tsNum = Number(ts);
  if (Number.isFinite(tsNum)) {
    const ageSec = Math.abs(Date.now() / 1000 - (tsNum > 1e12 ? tsNum / 1000 : tsNum));
    if (ageSec > 300) return { ok: false, reason: 'Assinatura expirada' };
  }

  let dataId = String(opts.dataId);
  if (/^[a-zA-Z0-9]+$/.test(dataId)) dataId = dataId.toLowerCase();

  const manifest = `id:${dataId};request-id:${opts.xRequestId};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(v1, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: 'Assinatura inválida' };
    }
  } catch {
    return { ok: false, reason: 'Assinatura inválida' };
  }

  return { ok: true };
}
