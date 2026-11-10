type PaypalMode = 'sandbox' | 'live';

type PaypalAccessToken = {
  access_token: string;
  expires_in: number;
};

type PaypalOrder = {
  id: string;
  status: string;
  links?: Array<{ rel: string; href: string }>;
};

type PaypalCaptureResult = {
  id: string;
  status: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id: string; status: string; amount?: { value: string; currency_code: string } }>;
    };
    custom_id?: string;
  }>;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

export function paypalMode(): PaypalMode {
  const mode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase();
  return mode === 'live' ? 'live' : 'sandbox';
}

export function paypalClientId(): string {
  return (process.env.PAYPAL_CLIENT_ID || '').trim();
}

function paypalClientSecret(): string {
  return (process.env.PAYPAL_CLIENT_SECRET || '').trim();
}

export function paypalConfigured(): boolean {
  return !!(paypalClientId() && paypalClientSecret());
}

function paypalApiBase(): string {
  return paypalMode() === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getAccessToken(): Promise<string> {
  if (!paypalConfigured()) {
    throw Object.assign(new Error('PayPal não configurado'), { status: 503 });
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const auth = Buffer.from(`${paypalClientId()}:${paypalClientSecret()}`).toString('base64');
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('PayPal token error:', res.status, text);
    throw Object.assign(new Error('Falha ao autenticar no PayPal'), { status: 502 });
  }

  const data = (await res.json()) as PaypalAccessToken;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function paypalFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${paypalApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('PayPal API error:', path, res.status, text);
    throw Object.assign(new Error('Falha na API do PayPal'), { status: 502 });
  }

  return (await res.json()) as T;
}

/** amountCents → string "9.99" for PayPal */
export function formatPaypalAmount(amountCents: number): string {
  return (Math.max(0, amountCents) / 100).toFixed(2);
}

export async function createPaypalOrder(opts: {
  amountCents: number;
  currency: string;
  description: string;
  customId: string;
  softDescriptor?: string;
}): Promise<PaypalOrder> {
  if (opts.amountCents <= 0) {
    throw Object.assign(new Error('Valor inválido para PayPal'), { status: 400 });
  }

  return paypalFetch<PaypalOrder>('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          custom_id: opts.customId,
          description: opts.description.slice(0, 127),
          soft_descriptor: (opts.softDescriptor || 'BRPELOMUNDO').slice(0, 22),
          amount: {
            currency_code: (opts.currency || 'USD').toUpperCase(),
            value: formatPaypalAmount(opts.amountCents),
          },
        },
      ],
      application_context: {
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        brand_name: 'BR Pelo Mundo',
      },
    }),
  });
}

export async function capturePaypalOrder(paypalOrderId: string): Promise<PaypalCaptureResult> {
  return paypalFetch<PaypalCaptureResult>(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    body: '{}',
  });
}

export function isCaptureSuccessful(result: PaypalCaptureResult): boolean {
  if (result.status === 'COMPLETED') return true;
  const capture = result.purchase_units?.[0]?.payments?.captures?.[0];
  return capture?.status === 'COMPLETED' || capture?.status === 'PENDING';
}
