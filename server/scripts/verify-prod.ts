/**
 * Verificação somente-leitura contra o ambiente publicado.
 *
 *   npx tsx scripts/verify-prod.ts https://brpelomundo.vercel.app
 *
 * Um login bem-sucedido já prova três coisas de uma vez: a função serverless
 * subiu, o DATABASE_URL aponta para o banco populado e o JWT_SECRET está lá.
 * A lista cobre caminhos de 1, 2 e 3 segmentos de propósito — foi exatamente
 * nos mais profundos que o roteamento da Vercel falhou antes.
 */
const base = (process.argv[2] ?? 'https://brpelomundo.vercel.app').replace(/\/$/, '');

let token = '';
const failures: string[] = [];
let passed = 0;

async function get(path: string) {
  const res = await fetch(`${base}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.text();
  const json = res.headers.get('content-type')?.includes('application/json');
  if (res.ok && json) {
    passed += 1;
  } else {
    const why = body.trimStart().startsWith('<')
      ? 'devolveu HTML (rewrite de SPA capturando /api)'
      : `${res.headers.get('x-vercel-error') ?? ''} ${body.slice(0, 120)}`.trim();
    failures.push(`GET ${path} -> ${res.status} ${why}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

console.log(`Verificando ${base}\n`);

const home = await fetch(base);
const isHtml = (home.headers.get('content-type') ?? '').includes('text/html');
console.log(`  client:  ${home.status} ${isHtml ? 'HTML servido' : 'NÃO é HTML'}`);
if (home.status !== 200 || !isHtml) failures.push('a home não devolveu HTML');

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ana@demo.com', password: 'demo123' }),
});
const loginBody = await login.text();
try {
  token = JSON.parse(loginBody).token ?? '';
} catch {
  /* não era JSON */
}
console.log(`  login:   ${login.status} ${token ? 'token recebido' : loginBody.slice(0, 120)}`);
if (!token) {
  console.error('\n❌ Sem login não há como validar o resto. Confira DATABASE_URL e JWT_SECRET.');
  process.exit(1);
}

const paths = [
  // 1 segmento
  '/api/health',
  '/api/countries',
  '/api/skills',
  '/api/users',
  '/api/businesses',
  '/api/events',
  '/api/groups',
  '/api/classifieds',
  '/api/community',
  '/api/advertisements',
  '/api/conversations',
  // 2 segmentos
  '/api/auth/me',
  '/api/settings/public',
  '/api/posts?scope=city',
  '/api/billing/plans',
  '/api/billing/orders',
  '/api/admin/stats',
  '/api/admin/settings',
  '/api/social/friendships',
  '/api/moderation/blocks',
  '/api/businesses/mine',
  '/api/classifieds/categories',
  '/api/conversations/unread-count',
  '/api/geo/used-countries',
  // 3 segmentos
  '/api/social/notifications/unread-count',
  '/api/admin/billing/revenue',
  '/api/admin/posts/promotions',
  '/api/geo/used-states?country=US',
];

for (const p of paths) await get(p);

const feed = await get('/api/posts?scope=city');
const users = await get('/api/users');
console.log(`  feed:    ${Array.isArray(feed) ? feed.length + ' posts' : 'inesperado'}`);
console.log(`  users:   ${Array.isArray(users) ? users.length + ' usuários' : 'inesperado'}`);
if (!feed?.length) failures.push('feed vazio — o banco pode ser o errado');
if (!users?.length) failures.push('lista de usuários vazia');

console.log(`\n${passed} endpoints OK, ${failures.length} falha(s).`);
if (failures.length) {
  console.error('\nFalhas:');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log('✅ Produção validada');
