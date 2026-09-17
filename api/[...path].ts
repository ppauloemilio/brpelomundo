/**
 * Ponto de entrada serverless da Vercel. O nome `[...path]` faz a Vercel
 * encaminhar qualquer `/api/**` para cá preservando a URL original, que é o
 * que o app Express espera para casar as rotas montadas em `/api/...`.
 *
 * Carrega o JS já compilado (`npm run build -w server`) para não depender de
 * como o bundler da Vercel resolve TypeScript fora do diretório `api/`.
 *
 * O import é dinâmico e protegido de propósito: um erro em tempo de carga
 * viraria um FUNCTION_INVOCATION_FAILED opaco, sem pista nenhuma na resposta.
 */
import type { IncomingMessage, ServerResponse } from 'http';

type NodeHandler = (req: IncomingMessage, res: ServerResponse) => unknown;

let handler: NodeHandler | null = null;
let loadError: Error | null = null;

async function load() {
  if (handler || loadError) return;
  try {
    const mod: unknown = await import('../server/dist/app.js');
    const candidate = (mod as { default?: unknown })?.default ?? mod;
    if (typeof candidate !== 'function') {
      throw new Error(
        `O app importado não é uma função (recebi ${typeof candidate}). ` +
          `Chaves do módulo: ${Object.keys((mod as object) ?? {}).join(', ') || 'nenhuma'}`
      );
    }
    handler = candidate as NodeHandler;
  } catch (err) {
    loadError = err instanceof Error ? err : new Error(String(err));
  }
}

export default async function (req: IncomingMessage, res: ServerResponse) {
  await load();

  if (loadError) {
    console.error('Falha ao carregar o app Express:', loadError);
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(`FALHA AO CARREGAR O APP\n\n${loadError.stack ?? loadError.message}`);
    return;
  }

  return handler!(req, res);
}
