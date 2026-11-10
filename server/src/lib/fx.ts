type FxRate = {
  pair: 'USD-BRL';
  /** How many BRL equal 1 USD (ex.: 5.58). */
  usd_brl: number;
  source: 'awesomeapi' | 'cache';
  updated_at: string;
};

type CacheEntry = {
  rate: FxRate;
  expiresAt: number;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const AWESOME_URL = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';

let cache: CacheEntry | null = null;

function parseBid(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const bid = (raw as { USDBRL?: { bid?: string } }).USDBRL?.bid;
  const n = Number(bid);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function fetchUsdBrl(): Promise<FxRate> {
  const res = await fetch(AWESOME_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`FX HTTP ${res.status}`);
  }
  const data = await res.json();
  const usd_brl = parseBid(data);
  if (!usd_brl) {
    throw new Error('FX bid missing');
  }
  return {
    pair: 'USD-BRL',
    usd_brl,
    source: 'awesomeapi',
    updated_at: new Date().toISOString(),
  };
}

/** Cotação USD→BRL com cache em memória (~1h). */
export async function getUsdBrlRate(): Promise<FxRate> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return { ...cache.rate, source: 'cache' };
  }

  try {
    const rate = await fetchUsdBrl();
    cache = { rate, expiresAt: now + CACHE_TTL_MS };
    return rate;
  } catch (err) {
    if (cache) {
      return { ...cache.rate, source: 'cache' };
    }
    throw err;
  }
}
