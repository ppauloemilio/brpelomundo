const DEV_FALLBACK = 'comunidade-br-dev-secret-change-in-production';
const WEAK = new Set([
  DEV_FALLBACK,
  'altere-em-producao',
  'change-me',
  'secret',
  'jwt_secret',
]);

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
}

/** Segredo JWT: em produção exige valor forte via env. */
export function getJwtSecret(): string {
  const raw = (process.env.JWT_SECRET || '').trim();
  if (isProductionRuntime()) {
    if (!raw || WEAK.has(raw) || raw.length < 24) {
      throw new Error(
        'JWT_SECRET inválido ou fraco em produção. Defina um segredo aleatório com pelo menos 24 caracteres nas variáveis de ambiente.'
      );
    }
    return raw;
  }
  if (!raw) {
    console.warn('[security] JWT_SECRET ausente — usando fallback só para desenvolvimento local.');
    return DEV_FALLBACK;
  }
  return raw;
}
