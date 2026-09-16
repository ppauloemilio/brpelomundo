import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from './sql.js';

const DEMO_PASSWORD = 'demo123';

export async function seedDatabase() {
  const userCount = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM users');
  if ((userCount?.c ?? 0) > 0) return;

  const countries = [
    { id: 'br', name: 'Brasil', code: 'BR' },
    { id: 'us', name: 'Estados Unidos', code: 'US' },
    { id: 'pt', name: 'Portugal', code: 'PT' },
    { id: 'ca', name: 'Canadá', code: 'CA' },
    { id: 'uk', name: 'Reino Unido', code: 'UK' },
    { id: 'de', name: 'Alemanha', code: 'DE' },
  ];

  for (const c of countries) {
    await db.run('INSERT INTO countries (id, name, code) VALUES (?, ?, ?)', [c.id, c.name, c.code]);
  }

  const skills = ['Culinária', 'Direito', 'Contabilidade', 'TI', 'Marketing', 'Saúde', 'Educação', 'Construção'];
  for (const s of skills) {
    await db.run('INSERT INTO skills (id, name) VALUES (?, ?)', [uuid(), s]);
  }

  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);

  const demoUsers = [
    { username: 'ana_silva', full_name: 'Ana Silva', email: 'ana@demo.com', country: 'US', city: 'New York' },
    { username: 'carlos_mendes', full_name: 'Carlos Mendes', email: 'carlos@demo.com', country: 'US', city: 'New York' },
    { username: 'julia_costa', full_name: 'Júlia Costa', email: 'julia@demo.com', country: 'BR', city: 'São Paulo' },
    { username: 'pedro_lima', full_name: 'Pedro Lima', email: 'pedro@demo.com', country: 'PT', city: 'Lisboa' },
    { username: 'beatriz_paes', full_name: 'Beatriz Paes Barreto', email: 'beatriz@demo.com', country: 'DE', city: 'Berlin' },
  ];

  const userIds: string[] = [];
  for (const u of demoUsers) {
    const id = uuid();
    userIds.push(id);
    await db.run(
      'INSERT INTO users (id, email, password_hash, username, full_name, avatar_url) VALUES (?, ?, ?, ?, ?, ?)',
      [id, u.email, hash, u.username, u.full_name, null]
    );
    await db.run(
      `INSERT INTO public_profiles (user_id, bio, current_country, current_city, origin_city, social_links, languages)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        `Brasileiro(a) vivendo no exterior. Perfil demo de ${u.full_name}.`,
        u.country,
        u.city,
        u.username === 'ana_silva' ? 'Salvador, Bahia' : '',
        JSON.stringify({ instagram: `@${u.username}` }),
        JSON.stringify(['pt-BR', 'en']),
      ]
    );
    await db.run(
      'INSERT INTO user_country_history (id, user_id, country, joined_at) VALUES (?, ?, ?, ?)',
      [uuid(), id, u.country, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()]
    );
  }

  const businessId = uuid();
  await db.run(
    `INSERT INTO businesses (id, name, category, country, owner_id, latitude, longitude, address, state, city, tagline, description, skills, photos, social_links)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      businessId,
      'Sabor do Brasil',
      'restaurant',
      'US',
      userIds[0],
      40.7128,
      -74.006,
      '123 Main St, New York, NY',
      'New York',
      'New York',
      'Restaurante típico de comida brasileira',
      'Restaurante com comidas boas e baratas, aquelas que você sabe, matar aquela fome por um preço justo!',
      JSON.stringify(['Culinária']),
      JSON.stringify([]),
      JSON.stringify({ instagram: '@sabordobrasil' }),
    ]
  );

  const posts = [
    { content: 'Acabei de chegar em Nova York! Alguém indica mercado brasileiro?', type: 'text', author: 0, country: 'US', daysAgo: 5 },
    { content: 'Promoção especial neste fim de semana no Sabor do Brasil!', type: 'business_promo', author: 0, country: 'US', daysAgo: 3, business: businessId },
    { content: 'Procurando contador que entenda de imposto para brasileiro nos EUA.', type: 'job', author: 1, country: 'US', daysAgo: 10 },
    { content: 'Encontro da comunidade brasileira no sábado!', type: 'event', author: 1, country: 'US', daysAgo: 1 },
    { content: 'Dica: documentação para visto — compartilhando minha experiência.', type: 'text', author: 0, country: 'US', daysAgo: 45 },
    { content: 'Saudades de café brasileiro ☕', type: 'text', author: 2, country: 'BR', daysAgo: 2 },
    { content: 'Comunidade em Lisboa está crescendo!', type: 'text', author: 3, country: 'PT', daysAgo: 4 },
  ];

  for (const p of posts) {
    const authorId = userIds[p.author];
    const user = await db.get<{
      id: string; username: string; full_name: string; avatar_url: string | null;
    }>('SELECT * FROM users WHERE id = ?', [authorId]);
    const profile = await db.get<{ current_city: string; current_country: string }>(
      'SELECT current_city, current_country FROM public_profiles WHERE user_id = ?',
      [authorId]
    );
    const createdAt = new Date(Date.now() - p.daysAgo * 24 * 60 * 60 * 1000).toISOString();
    await db.run(
      `INSERT INTO posts (id, content, type, images, author_id, business_id, country, city, likes_count, comments_count, author_snapshot, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        p.content,
        p.type,
        JSON.stringify([]),
        authorId,
        (p as { business?: string }).business || null,
        p.country,
        profile?.current_city || '',
        Math.floor(Math.random() * 20),
        Math.floor(Math.random() * 8),
        JSON.stringify({
          id: user!.id,
          username: user!.username,
          full_name: user!.full_name,
          avatar_url: user!.avatar_url,
          city: profile?.current_city || '',
          country: profile?.current_country || p.country,
        }),
        createdAt,
      ]
    );
  }

  await db.run(
    `INSERT INTO advertisements (id, title, image_url, link_url, description, is_active, order_num)
     VALUES (?, ?, ?, ?, ?, 1, 1)`,
    [
      uuid(),
      'Comunidade Brasil',
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800',
      '#',
      'Conectando brasileiros pelo mundo',
    ]
  );

  await db.run(
    `INSERT INTO follows (id, follower_id, following_id, follower_snapshot, created_at)
     VALUES (?, ?, ?, ?, utc_now())`,
    [
      uuid(),
      userIds[1],
      userIds[0],
      JSON.stringify({ id: userIds[1], username: 'carlos_mendes', full_name: 'Carlos Mendes', avatar_url: null }),
    ]
  );

  console.log('✅ Dados demo inseridos');
  console.log('   Login demo: ana@demo.com / demo123');
}
