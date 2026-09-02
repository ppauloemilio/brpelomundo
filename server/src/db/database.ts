import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import { seedDatabase } from './seed.js';
import { seedAppSettings } from '../lib/settings.js';
import { seedMonetizationExamples } from '../lib/seedMonetizationExamples.js';
import { seedLocalValidation, seedTrustFeatures } from '../lib/seedLocalValidation.js';
import { seedBillingPlans } from '../lib/billing.js';
import { ensureAdminUser } from '../lib/adminUser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');
const dbPath = path.join(dataDir, 'comunidade.db');

let db: DatabaseSync;

export function getDb(): DatabaseSync {
  if (!db) {
    fs.mkdirSync(dataDir, { recursive: true });
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    migrate(db);
    seedDatabase(db);
    seedAppSettings(db);
    seedMonetizationExamples(db);
    seedLocalValidation(db);
    seedTrustFeatures(db);
    seedBillingPlans(db);
    patchProfileCities(db);
    ensureAdminUser(db).catch((err) => console.error('Admin setup:', err));
  }
  return db;
}

function patchProfileCities(database: DatabaseSync) {
  const patches: Array<[string, string, string]> = [
    ['ana_silva', 'New York', 'US'],
    ['carlos_mendes', 'New York', 'US'],
    ['julia_costa', 'São Paulo', 'BR'],
    ['pedro_lima', 'Lisboa', 'PT'],
    ['beatriz_paes', 'Berlin', 'DE'],
  ];
  const stmt = database.prepare(
    `UPDATE public_profiles SET current_city = ?, current_country = ?
     WHERE user_id = (SELECT id FROM users WHERE username = ?)`
  );
  for (const [username, city, country] of patches) {
    if (country) stmt.run(city, country, username);
  }

  database.prepare(
    `UPDATE public_profiles SET origin_city = ? WHERE user_id = (SELECT id FROM users WHERE username = 'ana_silva')`
  ).run('Salvador, Bahia');

  const ana = database.prepare(`SELECT id FROM users WHERE username = 'ana_silva'`).get() as { id: string } | undefined;
  if (ana) {
    const skillExists = database.prepare('SELECT id FROM user_skills WHERE user_id = ? LIMIT 1').get(ana.id);
    if (!skillExists) {
      database.prepare(
        'INSERT INTO user_skills (id, user_id, skill_name, proficiency_level, years_experience) VALUES (?, ?, ?, ?, ?)'
      ).run(uuid(), ana.id, 'Gastronomia', 'advanced', 5);
    }
  }
}

function migrate(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS public_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      bio TEXT DEFAULT '',
      current_country TEXT DEFAULT 'BR',
      current_city TEXT DEFAULT '',
      origin_city TEXT DEFAULT '',
      origin_state TEXT DEFAULT '',
      current_state TEXT DEFAULT '',
      cover_url TEXT DEFAULT '',
      primary_skill TEXT DEFAULT '',
      show_city_on_profile INTEGER DEFAULT 1,
      show_whatsapp_on_profile INTEGER DEFAULT 0,
      social_links TEXT DEFAULT '{}',
      languages TEXT DEFAULT '["pt-BR"]'
    );

    CREATE TABLE IF NOT EXISTS user_country_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      country TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      UNIQUE(user_id, country)
    );

    CREATE TABLE IF NOT EXISTS countries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS states (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      country_id TEXT NOT NULL REFERENCES countries(id)
    );

    CREATE TABLE IF NOT EXISTS cities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      state_id TEXT REFERENCES states(id),
      country_id TEXT NOT NULL REFERENCES countries(id)
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_skills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      skill_name TEXT NOT NULL,
      proficiency_level TEXT DEFAULT 'intermediate',
      years_experience INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      country TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      latitude REAL,
      longitude REAL,
      address TEXT DEFAULT '',
      skills TEXT DEFAULT '[]',
      photos TEXT DEFAULT '[]',
      social_links TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      images TEXT DEFAULT '[]',
      author_id TEXT NOT NULL REFERENCES users(id),
      business_id TEXT REFERENCES businesses(id),
      country TEXT NOT NULL,
      likes_count INTEGER DEFAULT 0,
      comments_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      author_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      author_snapshot TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(post_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES posts(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      post_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      follower_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(follower_id, following_id)
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(requester_id, receiver_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      is_read INTEGER DEFAULT 0,
      actor_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS advertisements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL,
      link_url TEXT,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      order_num INTEGER DEFAULT 0,
      start_date TEXT,
      end_date TEXT
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'user_user',
      business_id TEXT REFERENCES businesses(id),
      participant_ids TEXT NOT NULL,
      last_message TEXT,
      unread_count TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      attachment_url TEXT,
      is_read INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_posts_country ON posts(country, created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
  `);

  try {
    database.exec(`ALTER TABLE public_profiles ADD COLUMN current_city TEXT DEFAULT ''`);
  } catch { /* coluna já existe */ }
  try {
    database.exec(`ALTER TABLE public_profiles ADD COLUMN origin_city TEXT DEFAULT ''`);
  } catch { /* coluna já existe */ }
  const alters = [
    `ALTER TABLE public_profiles ADD COLUMN origin_state TEXT DEFAULT ''`,
    `ALTER TABLE public_profiles ADD COLUMN current_state TEXT DEFAULT ''`,
    `ALTER TABLE public_profiles ADD COLUMN cover_url TEXT DEFAULT ''`,
    `ALTER TABLE public_profiles ADD COLUMN primary_skill TEXT DEFAULT ''`,
    `ALTER TABLE public_profiles ADD COLUMN show_city_on_profile INTEGER DEFAULT 1`,
    `ALTER TABLE public_profiles ADD COLUMN show_whatsapp_on_profile INTEGER DEFAULT 0`,
  ];
  for (const sql of alters) {
    try { database.exec(sql); } catch { /* ok */ }
  }
  const businessAlters = [
    `ALTER TABLE businesses ADD COLUMN state TEXT DEFAULT ''`,
    `ALTER TABLE businesses ADD COLUMN city TEXT DEFAULT ''`,
    `ALTER TABLE businesses ADD COLUMN tagline TEXT DEFAULT ''`,
    `ALTER TABLE businesses ADD COLUMN description TEXT DEFAULT ''`,
  ];
  for (const sql of businessAlters) {
    try { database.exec(sql); } catch { /* ok */ }
  }
  const monetizationAlters = [
    `ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN password_set INTEGER DEFAULT 1`,
    `ALTER TABLE businesses ADD COLUMN is_featured INTEGER DEFAULT 0`,
    `ALTER TABLE businesses ADD COLUMN featured_until TEXT`,
    `ALTER TABLE businesses ADD COLUMN featured_order INTEGER DEFAULT 0`,
    `ALTER TABLE posts ADD COLUMN is_promoted INTEGER DEFAULT 0`,
    `ALTER TABLE posts ADD COLUMN promoted_until TEXT`,
    `ALTER TABLE posts ADD COLUMN city TEXT DEFAULT ''`,
    `ALTER TABLE public_profiles ADD COLUMN is_premium INTEGER DEFAULT 0`,
    `ALTER TABLE public_profiles ADD COLUMN premium_until TEXT`,
    `ALTER TABLE public_profiles ADD COLUMN interests TEXT DEFAULT '[]'`,
    `ALTER TABLE public_profiles ADD COLUMN onboarding_completed INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`,
  ];
  for (const sql of monetizationAlters) {
    try { database.exec(sql); } catch { /* ok */ }
  }
  try {
    database.exec(
      `UPDATE posts SET city = json_extract(author_snapshot, '$.city')
       WHERE TRIM(COALESCE(city, '')) = ''
         AND json_extract(author_snapshot, '$.city') IS NOT NULL
         AND TRIM(json_extract(author_snapshot, '$.city')) != ''`
    );
  } catch { /* ok */ }
  try {
    database.exec(
      `UPDATE public_profiles SET onboarding_completed = 1
       WHERE onboarding_completed = 0
         AND TRIM(COALESCE(current_city, '')) != ''`
    );
  } catch { /* ok */ }
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS password_invites (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  try {
    database.exec(
      `UPDATE businesses SET city = 'New York', state = 'New York'
       WHERE TRIM(COALESCE(city, '')) = '' AND address LIKE '%New York%'`
    );
    database.exec(
      `UPDATE businesses SET
         tagline = 'Restaurante típico de comida brasileira',
         description = 'Restaurante com comidas boas e baratas, aquelas que você sabe, matar aquela fome por um preço justo!'
       WHERE name = 'Sabor do Brasil' AND TRIM(COALESCE(description, '')) = ''`
    );
  } catch { /* ok */ }

  database.exec(`
    CREATE TABLE IF NOT EXISTS community_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      country TEXT NOT NULL,
      city TEXT NOT NULL,
      cover_url TEXT DEFAULT '',
      owner_id TEXT NOT NULL REFERENCES users(id),
      is_public INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      members_count INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(group_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS group_posts (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      author_snapshot TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS community_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      event_date TEXT NOT NULL,
      event_time TEXT DEFAULT '',
      location_name TEXT DEFAULT '',
      address TEXT DEFAULT '',
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      image_url TEXT DEFAULT '',
      organizer_id TEXT NOT NULL REFERENCES users(id),
      whatsapp TEXT DEFAULT '',
      external_link TEXT DEFAULT '',
      interest_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS event_interests (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(event_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_groups_city ON community_groups(country, city);
    CREATE INDEX IF NOT EXISTS idx_events_city ON community_events(country, city, event_date);

    CREATE TABLE IF NOT EXISTS classifieds (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT NOT NULL,
      price REAL,
      currency TEXT DEFAULT 'USD',
      condition_label TEXT DEFAULT 'used',
      city TEXT NOT NULL,
      country TEXT NOT NULL,
      photos TEXT DEFAULT '[]',
      contact_whatsapp TEXT DEFAULT '',
      seller_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active',
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL,
      comment TEXT DEFAULT '',
      owner_reply TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(target_type, target_id, author_id)
    );
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id),
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      admin_notes TEXT DEFAULT '',
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS user_blocks (
      id TEXT PRIMARY KEY,
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(blocker_id, blocked_id)
    );
    CREATE INDEX IF NOT EXISTS idx_classifieds_city ON classifieds(country, city, status);
    CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
  `);

  const trustAlters = [
    `ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0`,
    `ALTER TABLE businesses ADD COLUMN is_verified INTEGER DEFAULT 0`,
  ];
  for (const sql of trustAlters) {
    try { database.exec(sql); } catch { /* ok */ }
  }
  try {
    database.exec(`UPDATE users SET email_verified = 1 WHERE email LIKE '%@demo.com' OR email LIKE '%@comunidade.br'`);
    database.exec(`UPDATE users SET is_verified = 1 WHERE username = 'ana_silva'`);
    database.exec(`UPDATE businesses SET is_verified = 1 WHERE name = 'Sabor do Brasil'`);
  } catch { /* ok */ }

  database.exec(`
    CREATE TABLE IF NOT EXISTS billing_plans (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      product_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      duration_days INTEGER NOT NULL DEFAULT 30,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS billing_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      plan_id TEXT NOT NULL REFERENCES billing_plans(id),
      plan_code TEXT NOT NULL,
      product_type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'pending',
      payment_provider TEXT NOT NULL DEFAULT 'demo',
      payment_ref TEXT DEFAULT '',
      target_type TEXT,
      target_id TEXT,
      starts_at TEXT,
      ends_at TEXT,
      paid_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ad_events (
      id TEXT PRIMARY KEY,
      ad_id TEXT NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      placement TEXT DEFAULT 'feed',
      user_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_billing_orders_user ON billing_orders(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_billing_orders_status ON billing_orders(status, paid_at);
    CREATE INDEX IF NOT EXISTS idx_ad_events_ad ON ad_events(ad_id, event_type, created_at);
    CREATE TABLE IF NOT EXISTS billing_promotions (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      label TEXT DEFAULT '',
      plan_id TEXT REFERENCES billing_plans(id),
      discount_percent INTEGER DEFAULT 0,
      discount_cents INTEGER DEFAULT 0,
      starts_at TEXT,
      ends_at TEXT,
      max_uses INTEGER,
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const billingAlters = [
    `ALTER TABLE billing_plans ADD COLUMN promo_price_cents INTEGER`,
    `ALTER TABLE billing_plans ADD COLUMN promo_label TEXT DEFAULT ''`,
    `ALTER TABLE billing_plans ADD COLUMN promo_until TEXT`,
  ];
  for (const sql of billingAlters) {
    try { database.exec(sql); } catch { /* ok */ }
  }
}

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  is_admin?: number;
  password_set?: number;
  is_active?: number;
  email_verified?: number;
  is_verified?: number;
  created_at: string;
};

export function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function userSnapshot(user: {
  id: string; username: string; full_name: string; avatar_url: string | null;
  city?: string; country?: string;
}) {
  return JSON.stringify({
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    avatar_url: user.avatar_url,
    city: user.city || '',
    country: user.country || '',
  });
}

export function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    full_name: user.full_name,
    avatar_url: user.avatar_url,
    is_admin: !!user.is_admin,
    email_verified: !!user.email_verified,
    is_verified: !!user.is_verified,
    created_at: user.created_at,
  };
}
