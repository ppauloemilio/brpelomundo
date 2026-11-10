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
