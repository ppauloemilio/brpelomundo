type FxRate = {
  pair: 'USD-BRL';
  /** How many BRL equal 1 USD (ex.: 5.58). */
  usd_brl: number;
  source: 'awesomeapi' | 'frankfurter' | 'fallback' | 'cache';
  updated_at: string;
};

type CacheEntry = {
  rate: FxRate;
  expiresAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
/** Usado só se todas as APIs externas falharem (marketing aproximado). */
const FALLBACK_USD_BRL = 5.55;

let cache: CacheEntry | null = null;

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`FX HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fromAwesomeApi(): Promise<FxRate> {
  const data = (await fetchJson(
    'https://economia.awesomeapi.com.br/json/last/USD-BRL'
  )) as { USDBRL?: { bid?: string } };
  const n = Number(data.USDBRL?.bid);
  if (!Number.isFinite(n) || n <= 0) throw new Error('AwesomeAPI bid missing');
  return {
    pair: 'USD-BRL',
    usd_brl: n,
    source: 'awesomeapi',
    updated_at: new Date().toISOString(),
  };
}

async function fromFrankfurter(): Promise<FxRate> {
  const data = (await fetchJson(
    'https://api.frankfurter.app/latest?from=USD&to=BRL'
  )) as { rates?: { BRL?: number } };
  const n = Number(data.rates?.BRL);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Frankfurter BRL missing');
  return {
    pair: 'USD-BRL',
    usd_brl: n,
    source: 'frankfurter',
    updated_at: new Date().toISOString(),
  };
}

function fallbackRate(): FxRate {
  return {
    pair: 'USD-BRL',
    usd_brl: FALLBACK_USD_BRL,
    source: 'fallback',
    updated_at: new Date().toISOString(),
  };
}

/** Cotação USD→BRL com cache (~1h), backup e fallback fixo. */
export async function getUsdBrlRate(): Promise<FxRate> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return { ...cache.rate, source: 'cache' };
  }

  const providers = [fromAwesomeApi, fromFrankfurter];
  for (const provider of providers) {
    try {
      const rate = await provider();
      cache = { rate, expiresAt: now + CACHE_TTL_MS };
      return rate;
    } catch {
      // tenta o próximo
    }
  }

  if (cache) {
    return { ...cache.rate, source: 'cache' };
  }

  const rate = fallbackRate();
  cache = { rate, expiresAt: now + Math.min(CACHE_TTL_MS, 15 * 60 * 1000) };
  return rate;
}
