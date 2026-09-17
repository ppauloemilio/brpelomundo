/** Sonda temporária: dois segmentos de caminho, para isolar o roteamento. */
import type { IncomingMessage, ServerResponse } from 'http';

export default function (req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: true, from: 'api/probe/deep.ts', url: req.url }));
}
