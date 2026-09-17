const base = (process.argv[2] ?? 'https://brpelomundo.vercel.app').replace(/\/$/, '');

const probes: Array<[string, string]> = [
  ['GET', '/api/health'],
  ['GET', '/api/settings/public'],
  ['GET', '/api/countries'],
  ['POST', '/api/auth/login'],
  ['GET', '/api/auth/me'],
  ['GET', '/api/rota-inexistente'],
];

for (const [method, path] of probes) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
    body: method === 'POST' ? JSON.stringify({ email: 'ana@demo.com', password: 'demo123' }) : undefined,
  });
  const body = (await res.text()).replace(/\s+/g, ' ').trim();
  console.log(`${method.padEnd(4)} ${path}`);
  console.log(`     ${res.status} ${res.headers.get('content-type') ?? ''}`);
  console.log(`     id: ${res.headers.get('x-vercel-id') ?? '-'}`);
  console.log(`     ${body.slice(0, 300)}`);
  console.log('');
}
