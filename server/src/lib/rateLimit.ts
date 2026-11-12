import rateLimit from 'express-rate-limit';

/**
 * Limites em memória (por instância). Em serverless resetam entre cold starts,
 * mas ainda cortam rajadas e abuso básico. Em produção, use IP real via trust proxy.
 */
function makeLimiter(opts: {
  windowMs: number;
  max: number;
  message: string;
}) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: opts.message },
  });
}

/** Login / cadastro: freia brute-force de senha e spam de contas. */
export const authStrictLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
});

/** Forgot / resend e-mail: evita bombardeio SMTP. */
export const authEmailLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: 'Muitos pedidos de e-mail. Tente novamente mais tarde.',
});

/** Upload autenticado: evita esgotar Blob/cota. */
export const uploadLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: 'Muitos uploads. Aguarde um pouco e tente de novo.',
});

/** Webhook MP: corta flood mesmo com assinatura. */
export const webhookLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Webhook rate limit',
});

/** Contagem de impressão/clique de ads. */
export const adEventsLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 90,
  message: 'Muitos eventos de anúncio. Aguarde um momento.',
});

/** API geral autenticada (fallback leve). */
export const apiGeneralLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Muitas requisições. Aguarde um momento.',
});
