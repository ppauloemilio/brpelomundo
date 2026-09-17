/** Sonda temporária: função sem dependências, um segmento de caminho. */
import type { IncomingMessage, ServerResponse } from 'http';

export default function (req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true, from: 'api/ping.ts', url: req.url }));
}
