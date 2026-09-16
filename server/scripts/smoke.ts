/**
 * Exercita a API inteira contra o banco configurado em DATABASE_URL.
 * Serve para pegar erros de dialeto SQL que o TypeScript não vê.
 *
 *   npm run smoke -w server
 */
import 'dotenv/config';
import app from '../src/app.js';

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;

type Check = {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Status aceitos além de 2xx. */
  allow?: number[];
};

let token = '';
const failures: string[] = [];
let passed = 0;

async function call(check: Check) {
  const method = check.method ?? 'GET';
  const res = await fetch(`${BASE}${check.path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(check.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: check.body ? JSON.stringify(check.body) : undefined,
  });

  const text = await res.text();
  const ok = res.ok || (check.allow ?? []).includes(res.status);
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${method} ${check.path} -> ${res.status} ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function main() {
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));

  const login = await call({
    path: '/api/auth/login',
    method: 'POST',
    body: { email: 'ana@demo.com', password: 'demo123' },
  });
  token = login?.token ?? '';
  if (!token) {
    console.error('❌ Login falhou — o resto dos testes não roda sem token.');
    console.error(failures.join('\n'));
    server.close();
    process.exit(1);
  }

  const me = await call({ path: '/api/auth/me' });
  const userId: string = me?.id ?? '';

  const feed = await call({ path: '/api/posts?scope=city' });
  const firstPostId: string = feed?.[0]?.id ?? '';

  const users = await call({ path: '/api/users' });

  const businesses = await call({ path: '/api/businesses' });
  const businessId: string = businesses?.[0]?.id ?? '';

  const events = await call({ path: '/api/events' });
  const eventId: string = events?.[0]?.id ?? '';

  const groups = await call({ path: '/api/groups' });
  const groupId: string = groups?.[0]?.id ?? '';

  const classifieds = await call({ path: '/api/classifieds' });
  const classifiedId: string = classifieds?.[0]?.id ?? '';

  const conversations = await call({ path: '/api/conversations' });
  const conversationId: string = conversations?.[0]?.id ?? '';

  const checks: Check[] = [
    { path: '/api/health' },
    { path: '/api/settings/public' },
    { path: '/api/countries' },
    { path: '/api/skills' },
    { path: '/api/advertisements' },
    { path: '/api/posts?scope=country' },
    { path: '/api/posts?scope=abroad' },
    { path: '/api/explore?type=people&q=ana' },
    { path: '/api/explore?type=people&country=US&city=New%20York&area=Gastronomia' },
    { path: '/api/explore?type=businesses&q=sabor&city=New%20York&state=New%20York&area=rest' },
    { path: '/api/search?q=brasil' },
    { path: '/api/feed/sidebar' },
    { path: '/api/users' },
    { path: '/api/users?q=ana&country=US' },
    { path: '/api/users?country=US' },
    { path: '/api/businesses?q=sabor&country=US&city=New%20York&state=New%20York&category=restaurant' },
    { path: '/api/businesses/mine' },
    { path: '/api/community' },
    { path: '/api/groups' },
    { path: '/api/events' },
    { path: '/api/classifieds' },
    { path: '/api/classifieds?q=sofa' },
    { path: '/api/classifieds/categories' },
    { path: '/api/conversations' },
    { path: '/api/conversations/unread-count' },
    { path: '/api/social/friendships' },
    { path: '/api/social/notifications' },
    { path: '/api/social/notifications/unread-count' },
    { path: '/api/moderation/blocks' },
    { path: '/api/geo/used-countries' },
    { path: '/api/geo/used-states?country=US' },
    { path: '/api/geo/used-cities?country=US&state=New%20York' },
    { path: '/api/geo/used-categories' },
    { path: '/api/geo/countries' },
    { path: '/api/geo/states?country=US' },
    { path: '/api/geo/cities?country=US&state=NY' },
    { path: '/api/billing/plans' },
    { path: '/api/billing/orders' },
    // admin (ana@demo.com é promovida a admin no setup)
    { path: '/api/admin/stats' },
    { path: '/api/admin/settings' },
    { path: '/api/admin/advertisements' },
    { path: '/api/admin/businesses?q=sabor&status=active' },
    { path: '/api/admin/posts?q=brasil&status=active' },
    { path: '/api/admin/posts/promotions' },
    { path: '/api/admin/users?q=ana&status=active' },
    { path: '/api/admin/users?status=admin' },
    { path: '/api/admin/reports?status=all' },
    { path: '/api/admin/billing/revenue' },
    { path: '/api/admin/billing/plans' },
    { path: '/api/admin/billing/promotions' },
    { path: '/api/admin/ads/metrics' },
  ];

  if (userId) {
    checks.push(
      { path: `/api/users/${userId}` },
      { path: `/api/users/${userId}/posts` },
      { path: `/api/users/${userId}/businesses` },
      { path: `/api/reviews?target_type=user&target_id=${userId}` },
      { path: `/api/moderation/blocks/check/${userId}` },
    );
  }
  if (businessId) {
    checks.push(
      { path: `/api/businesses/${businessId}` },
      { path: `/api/reviews?target_type=business&target_id=${businessId}` },
    );
  }
  if (eventId) checks.push({ path: `/api/events/${eventId}` });
  if (groupId) {
    checks.push({ path: `/api/groups/${groupId}` }, { path: `/api/groups/${groupId}/posts` });
  }
  if (classifiedId) {
    checks.push(
      { path: `/api/classifieds/${classifiedId}` },
      { path: `/api/reviews?target_type=classified&target_id=${classifiedId}` },
    );
  }
  if (conversationId) checks.push({ path: `/api/conversations/${conversationId}/messages` });
  if (firstPostId) checks.push({ path: `/api/posts/${firstPostId}/comments` });

  for (const check of checks) await call(check);

  // Escritas: cobrem INSERT/UPDATE/DELETE e os gatilhos de notificação.
  const created = await call({
    path: '/api/posts',
    method: 'POST',
    body: { content: 'smoke test', type: 'text', images: [] },
  });
  const newPostId: string = created?.id ?? '';
  if (newPostId) {
    await call({ path: `/api/posts/${newPostId}/like`, method: 'POST', allow: [409] });
    await call({ path: `/api/posts/${newPostId}/like`, method: 'DELETE' });
    await call({
      path: `/api/posts/${newPostId}/comments`,
      method: 'POST',
      body: { content: 'smoke comment' },
    });
    await call({ path: `/api/posts/${newPostId}/share`, method: 'POST' });
    await call({ path: `/api/posts/${newPostId}`, method: 'DELETE' });
  }

  // Conversas não têm seed, então o fluxo de mensagens só é exercitado aqui.
  // É o caminho com o filtro jsonb `@>`, o mais sensível da migração.
  const others = (users ?? []).filter((u: { id: string }) => u.id !== userId);
  const otherId: string = others[0]?.id ?? '';
  if (otherId) {
    const convo = await call({
      path: '/api/conversations',
      method: 'POST',
      body: { participant_ids: [otherId], type: 'user_user' },
    });
    const convoId: string = convo?.id ?? '';
    if (!convoId) {
      failures.push('POST /api/conversations não devolveu id');
    } else {
      await call({
        path: `/api/conversations/${convoId}/messages`,
        method: 'POST',
        body: { content: 'olá do smoke test' },
      });

      const list = await call({ path: '/api/conversations' });
      if (!Array.isArray(list) || !list.some((c: { id: string }) => c.id === convoId)) {
        failures.push('filtro jsonb participant_ids não devolveu a conversa criada');
      }

      const msgs = await call({ path: `/api/conversations/${convoId}/messages` });
      if (!Array.isArray(msgs) || msgs.length === 0) {
        failures.push('mensagens da conversa vieram vazias');
      }

      await call({ path: '/api/conversations/unread-count' });

      const again = await call({
        path: '/api/conversations',
        method: 'POST',
        body: { participant_ids: [otherId], type: 'user_user' },
      });
      if (again?.id !== convoId) {
        failures.push('conversa duplicada — dedupe por participantes falhou');
      }
    }
  }

  await call({ path: '/api/users/me/profile', method: 'PATCH', body: { bio: 'smoke' } });
  await call({
    path: '/api/users/me/skills',
    method: 'POST',
    body: { skill_name: 'SmokeSkill', proficiency_level: 'advanced', years_experience: 1 },
  });
  await call({ path: '/api/social/notifications/read-all', method: 'PATCH' });
  await call({ path: '/api/admin/settings', method: 'PATCH', body: { ads_enabled: true } });
  await call({ path: '/api/admin/monetization-examples', method: 'POST' });

  server.close();

  console.log(`\n${passed} verificações OK, ${failures.length} falha(s).`);
  if (failures.length) {
    console.error('\nFalhas:');
    for (const f of failures) console.error('  ' + f);
    process.exit(1);
  }
  console.log('✅ Smoke test passou');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Erro no smoke test:', err);
  process.exit(1);
});
