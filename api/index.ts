/**
 * Ponto de entrada serverless da Vercel para toda a API.
 *
 * O rewrite `/api/(.*)` -> `/api` no vercel.json manda qualquer profundidade de
 * caminho para cá, e a Vercel preserva a `req.url` original, que é o que o app
 * Express espera para casar as rotas montadas em `/api/...`.
 *
 * Não use um catch-all `api/[...path].ts`: fora do Next.js a Vercel só casa um
 * segmento com ele, e `/api/auth/login` morre num 404 na borda.
 *
 * Carrega o JS já compilado (`npm run build -w server`) para não depender de
 * como o bundler da Vercel resolve TypeScript fora do diretório `api/`. O
 * import é dinâmico e protegido porque um erro em tempo de carga viraria um
 * FUNCTION_INVOCATION_FAILED opaco, sem pista nenhuma. Também normaliza o
 * `default`: dependendo da interop ESM/CJS, o import estático entrega o
 * namespace do módulo em vez do app, que então não é invocável.
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
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'API indisponível', detail: loadError.message }));
    return;
  }

  return handler!(req, res);
}
