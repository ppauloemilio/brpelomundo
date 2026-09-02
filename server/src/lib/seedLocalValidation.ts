import type { DatabaseSync } from 'node:sqlite';
import { v4 as uuid } from 'uuid';

const FLAG = 'local_validation_seed_v1';

export function seedLocalValidation(db: DatabaseSync) {
  const done = db.prepare('SELECT key FROM app_settings WHERE key = ?').get(FLAG);
  if (done) return;

  const ana = db.prepare('SELECT id FROM users WHERE username = ?').get('ana_silva') as { id: string } | undefined;
  const carlos = db.prepare('SELECT id FROM users WHERE username = ?').get('carlos_mendes') as { id: string } | undefined;
  if (!ana) {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(FLAG, '1');
    return;
  }

  const groupCount = db.prepare('SELECT COUNT(*) as c FROM community_groups').get() as { c: number };
  if (groupCount.c === 0) {
    const g1 = uuid();
    const g2 = uuid();
    db.prepare(
      `INSERT INTO community_groups (id, name, description, country, city, owner_id, members_count)
       VALUES (?, ?, ?, 'US', 'New York', ?, 2)`
    ).run(g1, 'Brasileiros em New York', 'Grupo para brasileiros que vivem em Nova York trocarem dicas, eventos e oportunidades.', ana.id);
    db.prepare(`INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, 'owner')`).run(uuid(), g1, ana.id);
    if (carlos) {
      db.prepare(`INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, 'member')`).run(uuid(), g1, carlos.id);
    }

    db.prepare(
      `INSERT INTO community_groups (id, name, description, country, city, owner_id, members_count)
       VALUES (?, ?, ?, 'US', 'New York', ?, 1)`
    ).run(g2, 'Empreendedores brasileiros em NY', 'Networking e divulgação de negócios brasileiros em Nova York.', ana.id);
    db.prepare(`INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, 'owner')`).run(uuid(), g2, ana.id);

    db.prepare(
      `INSERT INTO group_posts (id, group_id, author_id, content, author_snapshot)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      uuid(),
      g1,
      ana.id,
      'Bem-vindos! Compartilhem recomendações de mercados, médicos e eventos da cidade.',
      JSON.stringify({ id: ana.id, username: 'ana_silva', full_name: 'Ana Silva', city: 'New York', country: 'US' })
    );
  }

  const eventCount = db.prepare('SELECT COUNT(*) as c FROM community_events').get() as { c: number };
  if (eventCount.c === 0) {
    const nextSaturday = new Date();
    nextSaturday.setDate(nextSaturday.getDate() + ((6 - nextSaturday.getDay() + 7) % 7 || 7));
    const dateStr = nextSaturday.toISOString().slice(0, 10);

    db.prepare(
      `INSERT INTO community_events (
         id, title, description, event_date, event_time, location_name, address,
         city, country, organizer_id, whatsapp, interest_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'New York', 'US', ?, ?, 1)`
    ).run(
      uuid(),
      'Encontro da comunidade brasileira',
      'Café da manhã e networking para brasileiros em Nova York. Traga um amigo!',
      dateStr,
      '10:00',
      'Bryant Park',
      'Bryant Park, New York, NY',
      ana.id,
      '+12125550100'
    );

    const biz = db.prepare(`SELECT social_links FROM businesses WHERE name = 'Sabor do Brasil'`).get() as
      | { social_links: string }
      | undefined;
    if (biz) {
      let links: Record<string, string> = {};
      try { links = JSON.parse(biz.social_links || '{}'); } catch { /* ok */ }
      if (!links.whatsapp) {
        links.whatsapp = '+12125550199';
        links.instagram = links.instagram || '@sabordobrasil';
        db.prepare('UPDATE businesses SET social_links = ? WHERE name = ?').run(JSON.stringify(links), 'Sabor do Brasil');
      }
    }
  }

  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(FLAG, '1');
  console.log('✅ Seed de validação local (grupos e eventos) aplicado');
}

const TRUST_FLAG = 'trust_seed_v1';

export function seedTrustFeatures(db: DatabaseSync) {
  const done = db.prepare('SELECT key FROM app_settings WHERE key = ?').get(TRUST_FLAG);
  if (done) return;

  const ana = db.prepare('SELECT id FROM users WHERE username = ?').get('ana_silva') as { id: string } | undefined;
  const carlos = db.prepare('SELECT id FROM users WHERE username = ?').get('carlos_mendes') as { id: string } | undefined;
  if (!ana) {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(TRUST_FLAG, '1');
    return;
  }

  const count = db.prepare('SELECT COUNT(*) as c FROM classifieds').get() as { c: number };
  if (count.c === 0) {
    const c1 = uuid();
    const c2 = uuid();
    db.prepare(
      `INSERT INTO classifieds (
         id, title, description, category, price, currency, condition_label,
         city, country, contact_whatsapp, seller_id
       ) VALUES (?, ?, ?, 'furniture', 180, 'USD', 'used', 'New York', 'US', ?, ?)`
    ).run(
      c1,
      'Sofá 2 lugares',
      'Sofá confortável, pouco uso. Retirada em Manhattan.',
      '+12125550100',
      ana.id
    );
    db.prepare(
      `INSERT INTO classifieds (
         id, title, description, category, price, currency, condition_label,
         city, country, contact_whatsapp, seller_id
       ) VALUES (?, ?, ?, 'electronics', 450, 'USD', 'like_new', 'New York', 'US', ?, ?)`
    ).run(
      c2,
      'iPhone 13 128GB',
      'Aparelho em ótimo estado, com caixa e carregador. Sem arranhões.',
      '+12125550111',
      carlos?.id || ana.id
    );

    if (carlos) {
      db.prepare(
        `INSERT INTO reviews (id, target_type, target_id, author_id, rating, comment)
         VALUES (?, 'classified', ?, ?, 5, ?)`
      ).run(uuid(), c1, carlos.id, 'Vendedora rápida e honesta. Recomendo!');
    }

    const biz = db.prepare(`SELECT id FROM businesses WHERE name = 'Sabor do Brasil'`).get() as
      | { id: string }
      | undefined;
    if (biz && carlos) {
      db.prepare(
        `INSERT INTO reviews (id, target_type, target_id, author_id, rating, comment)
         VALUES (?, 'business', ?, ?, 5, ?)`
      ).run(uuid(), biz.id, carlos.id, 'Comida brasileira deliciosa. Ambiente acolhedor.');
    }
  }

  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(TRUST_FLAG, '1');
  console.log('✅ Seed de confiança (classificados e avaliações) aplicado');
}

