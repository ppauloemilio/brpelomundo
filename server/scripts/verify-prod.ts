/**
 * Verificação somente-leitura contra o ambiente publicado.
 *
 *   npx tsx scripts/verify-prod.ts https://brpelomundo.vercel.app
 *
 * Um login bem-sucedido já prova três coisas de uma vez: a função serverless
 * subiu, o DATABASE_URL aponta para o banco populado e o JWT_SECRET está lá.
 */
const base = (process.argv[2] ?? 'https://brpelomundo.vercel.app').replace(/\/$/, '');

async function probe(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init);
  const body = await res.text();
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, type, body };
}

console.log(`Verificando ${base}\n`);

const home = await probe('/');
const isHtml = home.type.includes('text/html');
console.log(`  /                 ${home.status} ${isHtml ? 'HTML' : home.type}`);

const health = await probe('/api/health');
const healthIsJson = health.type.includes('application/json');
console.log(
  `  /api/health       ${health.status} ${healthIsJson ? health.body.slice(0, 60) : `(${health.type || 'sem tipo'})`}`
);

const login = await probe('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ana@demo.com', password: 'demo123' }),
});
let token = '';
try {
  token = JSON.parse(login.body).token ?? '';
} catch {
  /* resposta não era JSON */
}
console.log(`  POST login        ${login.status} ${token ? 'token recebido' : login.body.slice(0, 120)}`);

let feedCount = -1;
if (token) {
  const feed = await probe('/api/posts?scope=city', {
    headers: { Authorization: `Bearer ${token}` },
  });
  try {
    feedCount = JSON.parse(feed.body).length;
  } catch {
    /* idem */
  }
  console.log(`  /api/posts        ${feed.status} ${feedCount >= 0 ? `${feedCount} posts` : feed.body.slice(0, 120)}`);
}

const problems: string[] = [];
if (home.status !== 200) problems.push(`home respondeu ${home.status}`);
if (!isHtml) problems.push('home não devolveu HTML — o client pode não ter sido publicado');
if (!healthIsJson) {
  problems.push(
    health.body.trimStart().startsWith('<')
      ? 'a API devolveu HTML — o rewrite de SPA está capturando /api/*'
      : `/api/health não devolveu JSON (${health.status})`
  );
}
if (!token) problems.push('login falhou — confira DATABASE_URL e JWT_SECRET');
if (token && feedCount <= 0) problems.push('feed vazio — o banco pode ser o errado');

console.log('');
if (problems.length) {
  for (const p of problems) console.error('  ❌ ' + p);
  process.exit(1);
}
console.log('✅ Produção respondendo corretamente');
