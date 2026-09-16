import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';

const FLAG = 'local_validation_seed_v1';

async function findUserId(username: string) {
  const row = await db.get<{ id: string }>('SELECT id FROM users WHERE username = ?', [username]);
  return row?.id;
}

export async function seedLocalValidation() {
  const done = await db.get('SELECT key FROM app_settings WHERE key = ?', [FLAG]);
  if (done) return;

  const anaId = await findUserId('ana_silva');
  const carlosId = await findUserId('carlos_mendes');
  if (!anaId) {
    await db.run('INSERT INTO app_settings (key, value) VALUES (?, ?)', [FLAG, '1']);
    return;
  }

  const groupCount = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM community_groups');
  if ((groupCount?.c ?? 0) === 0) {
    const g1 = uuid();
    const g2 = uuid();
    await db.run(
      `INSERT INTO community_groups (id, name, description, country, city, owner_id, members_count)
       VALUES (?, ?, ?, 'US', 'New York', ?, 2)`,
      [
        g1,
        'Brasileiros em New York',
        'Grupo para brasileiros que vivem em Nova York trocarem dicas, eventos e oportunidades.',
        anaId,
      ]
    );
    await db.run(
      `INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, 'owner')`,
      [uuid(), g1, anaId]
    );
    if (carlosId) {
      await db.run(
        `INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, 'member')`,
        [uuid(), g1, carlosId]
      );
    }

    await db.run(
      `INSERT INTO community_groups (id, name, description, country, city, owner_id, members_count)
       VALUES (?, ?, ?, 'US', 'New York', ?, 1)`,
      [
        g2,
        'Empreendedores brasileiros em NY',
        'Networking e divulgação de negócios brasileiros em Nova York.',
        anaId,
      ]
    );
    await db.run(
      `INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, 'owner')`,
      [uuid(), g2, anaId]
    );

    await db.run(
      `INSERT INTO group_posts (id, group_id, author_id, content, author_snapshot)
       VALUES (?, ?, ?, ?, ?)`,
      [
        uuid(),
        g1,
        anaId,
        'Bem-vindos! Compartilhem recomendações de mercados, médicos e eventos da cidade.',
        JSON.stringify({
          id: anaId,
          username: 'ana_silva',
          full_name: 'Ana Silva',
          city: 'New York',
          country: 'US',
        }),
      ]
    );
  }

  const eventCount = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM community_events');
  if ((eventCount?.c ?? 0) === 0) {
    const nextSaturday = new Date();
    nextSaturday.setDate(nextSaturday.getDate() + ((6 - nextSaturday.getDay() + 7) % 7 || 7));
    const dateStr = nextSaturday.toISOString().slice(0, 10);

    await db.run(
      `INSERT INTO community_events (
         id, title, description, event_date, event_time, location_name, address,
         city, country, organizer_id, whatsapp, interest_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'New York', 'US', ?, ?, 1)`,
      [
        uuid(),
        'Encontro da comunidade brasileira',
        'Café da manhã e networking para brasileiros em Nova York. Traga um amigo!',
        dateStr,
        '10:00',
        'Bryant Park',
        'Bryant Park, New York, NY',
        anaId,
        '+12125550100',
      ]
    );

    const biz = await db.get<{ social_links: string }>(
      `SELECT social_links FROM businesses WHERE name = 'Sabor do Brasil'`
    );
    if (biz) {
      let links: Record<string, string> = {};
      try { links = JSON.parse(biz.social_links || '{}'); } catch { /* ok */ }
      if (!links.whatsapp) {
        links.whatsapp = '+12125550199';
        links.instagram = links.instagram || '@sabordobrasil';
        await db.run('UPDATE businesses SET social_links = ? WHERE name = ?', [
          JSON.stringify(links),
          'Sabor do Brasil',
        ]);
      }
    }
  }

  await db.run('INSERT INTO app_settings (key, value) VALUES (?, ?)', [FLAG, '1']);
  console.log('✅ Seed de validação local (grupos e eventos) aplicado');
}

const TRUST_FLAG = 'trust_seed_v1';

export async function seedTrustFeatures() {
  const done = await db.get('SELECT key FROM app_settings WHERE key = ?', [TRUST_FLAG]);
  if (done) return;

  const anaId = await findUserId('ana_silva');
  const carlosId = await findUserId('carlos_mendes');
  if (!anaId) {
    await db.run('INSERT INTO app_settings (key, value) VALUES (?, ?)', [TRUST_FLAG, '1']);
    return;
  }

  const count = await db.get<{ c: number }>('SELECT COUNT(*) as c FROM classifieds');
  if ((count?.c ?? 0) === 0) {
    const c1 = uuid();
    const c2 = uuid();
    await db.run(
      `INSERT INTO classifieds (
         id, title, description, category, price, currency, condition_label,
         city, country, contact_whatsapp, seller_id
       ) VALUES (?, ?, ?, 'furniture', 180, 'USD', 'used', 'New York', 'US', ?, ?)`,
      [c1, 'Sofá 2 lugares', 'Sofá confortável, pouco uso. Retirada em Manhattan.', '+12125550100', anaId]
    );
    await db.run(
      `INSERT INTO classifieds (
         id, title, description, category, price, currency, condition_label,
         city, country, contact_whatsapp, seller_id
       ) VALUES (?, ?, ?, 'electronics', 450, 'USD', 'like_new', 'New York', 'US', ?, ?)`,
      [
        c2,
        'iPhone 13 128GB',
        'Aparelho em ótimo estado, com caixa e carregador. Sem arranhões.',
        '+12125550111',
        carlosId || anaId,
      ]
    );

    if (carlosId) {
      await db.run(
        `INSERT INTO reviews (id, target_type, target_id, author_id, rating, comment)
         VALUES (?, 'classified', ?, ?, 5, ?)`,
        [uuid(), c1, carlosId, 'Vendedora rápida e honesta. Recomendo!']
      );
    }

    const biz = await db.get<{ id: string }>(
      `SELECT id FROM businesses WHERE name = 'Sabor do Brasil'`
    );
    if (biz && carlosId) {
      await db.run(
        `INSERT INTO reviews (id, target_type, target_id, author_id, rating, comment)
         VALUES (?, 'business', ?, ?, 5, ?)`,
        [uuid(), biz.id, carlosId, 'Comida brasileira deliciosa. Ambiente acolhedor.']
      );
    }
  }

  await db.run('INSERT INTO app_settings (key, value) VALUES (?, ?)', [TRUST_FLAG, '1']);
  console.log('✅ Seed de confiança (classificados e avaliações) aplicado');
}
