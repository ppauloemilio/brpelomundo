/**
 * Um 200 com lista vazia esconde query quebrada. Aqui conferimos que as
 * tabelas foram populadas e que os campos derivados (JSON, contadores,
 * timestamps) chegaram no formato que o client espera.
 */
import 'dotenv/config';
import app from '../src/app.js';
import { db } from '../src/db/sql.js';

const PORT = 3998;
const BASE = `http://127.0.0.1:${PORT}`;

const server = app.listen(PORT);
await new Promise((r) => server.once('listening', r));

const counts = await db.all<{ table_name: string; n: number }>(`
  SELECT 'users' AS table_name, count(*) AS n FROM users
  UNION ALL SELECT 'posts', count(*) FROM posts
  UNION ALL SELECT 'businesses', count(*) FROM businesses
  UNION ALL SELECT 'community_events', count(*) FROM community_events
  UNION ALL SELECT 'community_groups', count(*) FROM community_groups
  UNION ALL SELECT 'classifieds', count(*) FROM classifieds
  UNION ALL SELECT 'reviews', count(*) FROM reviews
  UNION ALL SELECT 'billing_plans', count(*) FROM billing_plans
  UNION ALL SELECT 'public_profiles', count(*) FROM public_profiles
  ORDER BY table_name
`);

console.log('Linhas por tabela:');
for (const c of counts) {
  const flag = c.n > 0 ? ' ' : '!';
  console.log(`  ${flag} ${c.table_name.padEnd(16)} ${c.n}`);
  if (typeof c.n !== 'number') throw new Error(`count veio como ${typeof c.n}, esperado number`);
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ana@demo.com', password: 'demo123' }),
});
const { token } = await login.json();
const auth = { Authorization: `Bearer ${token}` };

async function peek(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: auth });
  return res.json();
}

const posts = await peek('/api/posts?scope=city');
const users = await peek('/api/users');
const plans = await peek('/api/billing/plans');
const stats = await peek('/api/admin/stats');

console.log('\nAmostras:');
console.log(`  posts retornados: ${posts.length}`);
console.log(`  users retornados: ${users.length}`);
console.log(`  planos retornados: ${plans.length}`);

const post = posts[0];
console.log('\nPrimeiro post:');
console.log(
  `  autor:        ${post?.author_snapshot?.full_name} (@${post?.author_snapshot?.username})`
);
console.log(`  imagens:      ${JSON.stringify(post?.images)} (${typeof post?.images})`);
console.log(`  likes/coment: ${post?.likes_count} / ${post?.comments_count}`);
console.log(`  created_at:   ${post?.created_at}`);
console.log(`  data válida:  ${!Number.isNaN(new Date(post?.created_at).getTime())}`);

console.log('\nadmin/stats:', JSON.stringify(stats));

const problems: string[] = [];
if (!posts.length) problems.push('feed vazio');
if (!users.length) problems.push('lista de usuários vazia');
if (!plans.length) problems.push('planos vazios');
if (post && !post.author_snapshot?.username)
  problems.push('post sem author_snapshot (JSON quebrado)');
if (post && !Array.isArray(post.images)) problems.push('post.images não é array');
if (post && typeof post.likes_count !== 'number') problems.push('likes_count não é number');
if (post && Number.isNaN(new Date(post.created_at).getTime()))
  problems.push('created_at não é data válida');
for (const c of counts) if (c.n === 0) problems.push(`tabela ${c.table_name} vazia`);

server.close();

if (problems.length) {
  console.error('\n❌ Problemas:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('\n✅ Dados consistentes');
process.exit(0);
