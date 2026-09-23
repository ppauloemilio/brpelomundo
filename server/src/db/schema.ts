/**
 * Schema Postgres (Neon).
 *
 * Timestamps são TEXT em ISO-8601 UTC (`2026-09-16T16:29:00.123Z`), o mesmo
 * formato de `new Date().toISOString()` no código. Isso mantém as comparações
 * de string no SQL (`ends_at >= utc_now()`) coerentes com as datas gravadas
 * pelo Node, e o `new Date(...)` do client interpreta sem ambiguidade de fuso.
 */
export const UTC_NOW_FUNCTION = `
  CREATE OR REPLACE FUNCTION utc_now(shift interval DEFAULT interval '0')
    RETURNS text
    LANGUAGE sql
    STABLE
  AS $fn$
    SELECT to_char((now() + shift) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  $fn$;

  CREATE OR REPLACE FUNCTION utc_day(shift interval DEFAULT interval '0')
    RETURNS text
    LANGUAGE sql
    STABLE
  AS $fn$
    SELECT to_char((now() + shift) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  $fn$;
`;

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    is_admin INTEGER DEFAULT 0,
    password_set INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    email_verified INTEGER DEFAULT 0,
    is_verified INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS public_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio TEXT DEFAULT '',
    current_country TEXT DEFAULT 'BR',
    current_city TEXT DEFAULT '',
    current_state TEXT DEFAULT '',
    origin_city TEXT DEFAULT '',
    origin_state TEXT DEFAULT '',
    cover_url TEXT DEFAULT '',
    primary_skill TEXT DEFAULT '',
    show_city_on_profile INTEGER DEFAULT 1,
    show_whatsapp_on_profile INTEGER DEFAULT 0,
    social_links TEXT DEFAULT '{}',
    languages TEXT DEFAULT '["pt-BR"]',
    interests TEXT DEFAULT '[]',
    is_premium INTEGER DEFAULT 0,
    premium_until TEXT,
    extra_classified_slots INTEGER DEFAULT 0,
    onboarding_completed INTEGER DEFAULT 0
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
    state TEXT DEFAULT '',
    city TEXT DEFAULT '',
    owner_id TEXT NOT NULL REFERENCES users(id),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    address TEXT DEFAULT '',
    tagline TEXT DEFAULT '',
    description TEXT DEFAULT '',
    skills TEXT DEFAULT '[]',
    photos TEXT DEFAULT '[]',
    social_links TEXT DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    is_featured INTEGER DEFAULT 0,
    featured_until TEXT,
    featured_city TEXT,
    featured_order INTEGER DEFAULT 0,
    is_verified INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    images TEXT DEFAULT '[]',
    author_id TEXT NOT NULL REFERENCES users(id),
    business_id TEXT REFERENCES businesses(id),
    country TEXT NOT NULL,
    city TEXT DEFAULT '',
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    is_promoted INTEGER DEFAULT 0,
    promoted_until TEXT,
    author_snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    author_snapshot TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT utc_now(),
    UNIQUE(post_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS shares (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    post_snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS follows (
    id TEXT PRIMARY KEY,
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    follower_snapshot TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT utc_now(),
    UNIQUE(follower_id, following_id)
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT utc_now(),
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
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS advertisements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    link_url TEXT,
    description TEXT,
    owner_id TEXT REFERENCES users(id),
    creative_configured INTEGER DEFAULT 0,
    placement TEXT DEFAULT 'feed',
    campaign_group_id TEXT,
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
    created_at TEXT NOT NULL DEFAULT utc_now(),
    updated_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    attachment_url TEXT,
    attachment_type TEXT,
    is_read INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    edited_at TEXT,
    forwarded_from TEXT,
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS password_invites (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

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
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL DEFAULT utc_now(),
    UNIQUE(group_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS group_posts (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    author_snapshot TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT utc_now()
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
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    image_url TEXT DEFAULT '',
    organizer_id TEXT NOT NULL REFERENCES users(id),
    whatsapp TEXT DEFAULT '',
    external_link TEXT DEFAULT '',
    interest_count INTEGER DEFAULT 0,
    is_sponsored INTEGER DEFAULT 0,
    sponsored_until TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS event_interests (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT utc_now(),
    UNIQUE(event_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS classifieds (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT NOT NULL,
    price DOUBLE PRECISION,
    currency TEXT DEFAULT 'USD',
    condition_label TEXT DEFAULT 'used',
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    photos TEXT DEFAULT '[]',
    contact_whatsapp TEXT DEFAULT '',
    seller_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'active',
    is_featured INTEGER DEFAULT 0,
    featured_until TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT utc_now()
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
    created_at TEXT NOT NULL DEFAULT utc_now(),
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
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS user_blocks (
    id TEXT PRIMARY KEY,
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT utc_now(),
    UNIQUE(blocker_id, blocked_id)
  );

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
    promo_price_cents INTEGER,
    promo_label TEXT DEFAULT '',
    promo_until TEXT,
    created_at TEXT NOT NULL DEFAULT utc_now()
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
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

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
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE TABLE IF NOT EXISTS ad_events (
    id TEXT PRIMARY KEY,
    ad_id TEXT NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    placement TEXT DEFAULT 'feed',
    user_id TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE INDEX IF NOT EXISTS idx_posts_country ON posts(country, created_at);
  CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_groups_city ON community_groups(country, city);
  CREATE INDEX IF NOT EXISTS idx_events_city ON community_events(country, city, event_date);
  CREATE INDEX IF NOT EXISTS idx_classifieds_city ON classifieds(country, city, status);
  CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_type, target_id);
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_billing_orders_user ON billing_orders(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_billing_orders_status ON billing_orders(status, paid_at);
  CREATE INDEX IF NOT EXISTS idx_ad_events_ad ON ad_events(ad_id, event_type, created_at);

  CREATE TABLE IF NOT EXISTS profile_views (
    id TEXT PRIMARY KEY,
    profile_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TEXT NOT NULL DEFAULT utc_now()
  );

  CREATE INDEX IF NOT EXISTS idx_profile_views_profile ON profile_views(profile_user_id, viewed_at);
`;
