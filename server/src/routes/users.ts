import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import { db } from '../db/sql.js';
import { parseJson, UserRow } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  getMonetizationSettings,
  isPremiumProfile,
  type MonetizationSettings,
} from '../lib/settings.js';
import { paramId } from '../lib/params.js';

const router = Router();

function formatUser(
  settings: MonetizationSettings,
  user: UserRow,
  profile?: Record<string, unknown>,
  extra?: Record<string, unknown>
) {
  const social = parseJson(profile?.social_links as string, {});
  const premiumActive = isPremiumProfile(
    settings,
    profile as { is_premium?: number; premium_until?: string | null }
  );
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    avatar_url: user.avatar_url,
    cover_url: profile?.cover_url || '',
    created_at: user.created_at,
    bio: profile?.bio || '',
    current_country: profile?.current_country || 'BR',
    current_city: profile?.current_city || '',
    current_state: profile?.current_state || '',
    origin_city: profile?.origin_city || '',
    origin_state: profile?.origin_state || '',
    primary_skill: profile?.primary_skill || '',
    is_premium: premiumActive,
    is_verified: !!user.is_verified,
    email_verified: !!user.email_verified,
    show_city_on_profile: !!(profile?.show_city_on_profile ?? 1),
    show_whatsapp_on_profile: !!profile?.show_whatsapp_on_profile,
    social_links: social,
    languages: parseJson(profile?.languages as string, ['pt-BR']),
    ...extra,
  };
}

async function profileStats(userId: string) {
  const [followers, following, friends, posts, rating, views30] = await Promise.all([
    db.get<{ c: number }>('SELECT COUNT(*) as c FROM follows WHERE following_id = ?', [userId]),
    db.get<{ c: number }>('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?', [userId]),
    db.get<{ c: number }>(
      `SELECT COUNT(*) as c FROM friendships
       WHERE status = 'accepted' AND (requester_id = ? OR receiver_id = ?)`,
      [userId, userId]
    ),
    db.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM posts WHERE author_id = ? AND is_active = 1',
      [userId]
    ),
    db.get<{ avg_rating: number | null; rating_count: number }>(
      `SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS rating_count
       FROM reviews WHERE target_type = 'user' AND target_id = ? AND is_active = 1`,
      [userId]
    ),
    db.get<{ c: number }>(
      `SELECT COUNT(DISTINCT viewer_id) AS c FROM profile_views
       WHERE profile_user_id = ? AND viewed_at >= utc_now(interval '-30 days')`,
      [userId]
    ),
  ]);
  return {
    followers_count: followers?.c ?? 0,
    following_count: following?.c ?? 0,
    friends_count: friends?.c ?? 0,
    posts_count: posts?.c ?? 0,
    rating_avg: Number(rating?.avg_rating || 0),
    rating_count: rating?.rating_count || 0,
    profile_views_30d: views30?.c ?? 0,
  };
}

async function recordProfileView(profileUserId: string, viewerId: string) {
  if (profileUserId === viewerId) return;
  const recent = await db.get(
    `SELECT id FROM profile_views
     WHERE profile_user_id = ? AND viewer_id = ?
       AND viewed_at >= utc_now(interval '-24 hours')
     LIMIT 1`,
    [profileUserId, viewerId]
  );
  if (recent) return;
  await db.run(
    'INSERT INTO profile_views (id, profile_user_id, viewer_id) VALUES (?, ?, ?)',
    [uuid(), profileUserId, viewerId]
  );
}

async function friendshipStatus(viewerId: string, profileId: string) {
  if (viewerId === profileId) return { status: 'self' as const };
  const row = await db.get<{ id: string; requester_id: string; receiver_id: string; status: string }>(
    `SELECT * FROM friendships WHERE
     (requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?)`,
    [viewerId, profileId, profileId, viewerId]
  );
  if (!row) return { status: 'none' as const };
  if (row.status === 'accepted') return { status: 'friends' as const, friendship_id: row.id };
  if (row.status === 'pending' && row.requester_id === viewerId) {
    return { status: 'pending_sent' as const, friendship_id: row.id };
  }
  if (row.status === 'pending' && row.receiver_id === viewerId) {
    return { status: 'pending_received' as const, friendship_id: row.id };
  }
  return { status: 'none' as const };
}

router.get('/', authMiddleware, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const country = typeof req.query.country === 'string' ? req.query.country : undefined;
  let users: UserRow[];

  if (q) {
    users = await db.all<UserRow>(
      `SELECT u.* FROM users u
       LEFT JOIN public_profiles p ON p.user_id = u.id
       WHERE (u.full_name ILIKE ? OR u.username ILIKE ?)
       ${country ? 'AND p.current_country = ?' : ''}
       LIMIT 50`,
      country ? [`%${q}%`, `%${q}%`, country] : [`%${q}%`, `%${q}%`]
    );
  } else if (country) {
    users = await db.all<UserRow>(
      `SELECT u.* FROM users u
       JOIN public_profiles p ON p.user_id = u.id
       WHERE p.current_country = ? LIMIT 50`,
      [country]
    );
  } else {
    users = await db.all<UserRow>('SELECT * FROM users LIMIT 50');
  }

  const settings = await getMonetizationSettings();
  const profilesByUser = new Map<string, Record<string, unknown>>();
  if (users.length) {
    const ids = users.map((u) => u.id);
    const rows = await db.all<{ user_id: string }>(
      `SELECT * FROM public_profiles WHERE user_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    for (const row of rows) profilesByUser.set(row.user_id, row as Record<string, unknown>);
  }

  res.json(users.map((u) => formatUser(settings, u, profilesByUser.get(u.id))));
});

router.get('/:id/posts', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const [posts, likes, authorProfile, settings] = await Promise.all([
    db.all<{ id: string; images: string; author_snapshot: string }>(
      'SELECT * FROM posts WHERE author_id = ? AND is_active = 1 ORDER BY created_at DESC',
      [id]
    ),
    db.all<{ post_id: string }>('SELECT post_id FROM likes WHERE user_id = ?', [req.user!.id]),
    db.get<{ is_premium: number; premium_until: string | null }>(
      'SELECT is_premium, premium_until FROM public_profiles WHERE user_id = ?',
      [id]
    ),
    getMonetizationSettings(),
  ]);

  const likedSet = new Set(likes.map((l) => l.post_id));
  const authorIsPremium = isPremiumProfile(settings, authorProfile);

  res.json(
    posts.map((p) => {
      const row = p as Record<string, unknown>;
      const promotedInDb = !!(row.is_promoted && (
        !row.promoted_until || new Date(row.promoted_until as string) >= new Date()
      ));
      return {
        ...p,
        images: parseJson(p.images, []),
        is_promoted: settings.paid_posts_enabled && promotedInDb,
        author_snapshot: {
          ...parseJson(p.author_snapshot, {}),
          is_premium: authorIsPremium,
        },
        author_is_premium: authorIsPremium,
        liked_by_me: likedSet.has(p.id),
      };
    })
  );
});

router.get('/:id/businesses', authMiddleware, async (req, res) => {
  const businesses = await db.all(
    'SELECT id, name, category, address, country FROM businesses WHERE owner_id = ? AND is_active = 1 ORDER BY created_at DESC',
    [paramId(req.params.id)]
  );
  res.json(businesses);
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const user = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [paramId(req.params.id)]);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const [profile, skills, stats, settings] = await Promise.all([
    db.get<Record<string, unknown>>('SELECT * FROM public_profiles WHERE user_id = ?', [user.id]),
    db.all('SELECT * FROM user_skills WHERE user_id = ?', [user.id]),
    profileStats(user.id),
    getMonetizationSettings(),
  ]);

  if (req.user!.id !== user.id) {
    await recordProfileView(user.id, req.user!.id);
    const [isFollowing, friendship] = await Promise.all([
      db.get('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?', [
        req.user!.id,
        user.id,
      ]),
      friendshipStatus(req.user!.id, user.id),
    ]);
    const publicProfile = {
      ...formatUser(settings, user, profile, stats),
      skills,
      is_following: !!isFollowing,
      friendship_status: friendship.status,
      friendship_id: 'friendship_id' in friendship ? friendship.friendship_id : undefined,
    };
    if (!publicProfile.show_city_on_profile) {
      publicProfile.current_city = '';
      publicProfile.current_state = '';
    }
    if (!publicProfile.show_whatsapp_on_profile && publicProfile.social_links) {
      const links = { ...(publicProfile.social_links as Record<string, string>) };
      delete links.whatsapp;
      publicProfile.social_links = links;
    }
    res.json(publicProfile);
    return;
  }

  res.json({ ...formatUser(settings, user, profile, stats), skills });
});

router.patch('/me/profile', authMiddleware, async (req: AuthRequest, res) => {
  const {
    full_name, bio, username, avatar_url, cover_url,
    current_country, current_state, current_city,
    origin_state, origin_city, primary_skill,
    show_city_on_profile, show_whatsapp_on_profile,
    social_links, languages, interests, onboarding_completed,
  } = req.body;
  const userId = req.user!.id;

  if (full_name !== undefined) {
    await db.run('UPDATE users SET full_name = ? WHERE id = ?', [full_name, userId]);
  }
  if (avatar_url !== undefined) {
    await db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatar_url, userId]);
  }
  if (username) {
    const taken = await db.get('SELECT id FROM users WHERE username = ? AND id != ?', [
      username,
      userId,
    ]);
    if (taken) return res.status(409).json({ error: 'Username já em uso' });
    await db.run('UPDATE users SET username = ? WHERE id = ?', [username, userId]);
  }

  await db.run(
    'INSERT INTO public_profiles (user_id, current_country) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING',
    [userId, current_country || 'BR']
  );

  const profileUpdates: string[] = [];
  const profileParams: unknown[] = [];

  const setProfile = (column: string, value: unknown) => {
    if (value !== undefined) {
      profileUpdates.push(`${column} = ?`);
      profileParams.push(value);
    }
  };

  setProfile('bio', bio);
  setProfile('cover_url', cover_url);
  setProfile('current_country', current_country);
  setProfile('current_state', current_state);
  setProfile('current_city', current_city);
  setProfile('origin_state', origin_state);
  setProfile('origin_city', origin_city);
  setProfile('primary_skill', primary_skill);
  if (show_city_on_profile !== undefined) {
    setProfile('show_city_on_profile', show_city_on_profile ? 1 : 0);
  }
  if (show_whatsapp_on_profile !== undefined) {
    setProfile('show_whatsapp_on_profile', show_whatsapp_on_profile ? 1 : 0);
  }
  if (social_links !== undefined) setProfile('social_links', JSON.stringify(social_links));
  if (languages !== undefined) setProfile('languages', JSON.stringify(languages));
  if (interests !== undefined) setProfile('interests', JSON.stringify(interests));
  if (onboarding_completed !== undefined) {
    setProfile('onboarding_completed', onboarding_completed ? 1 : 0);
  }

  if (profileUpdates.length > 0) {
    await db.run(
      `UPDATE public_profiles SET ${profileUpdates.join(', ')} WHERE user_id = ?`,
      [...profileParams, userId]
    );
  }

  if (current_country) {
    await db.run(
      `INSERT INTO user_country_history (id, user_id, country, joined_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, country) DO NOTHING`,
      [uuid(), userId, current_country, new Date().toISOString()]
    );
  }

  const [user, updatedProfile, stats, settings] = await Promise.all([
    db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]),
    db.get<Record<string, unknown>>('SELECT * FROM public_profiles WHERE user_id = ?', [userId]),
    profileStats(userId),
    getMonetizationSettings(),
  ]);
  res.json(formatUser(settings, user!, updatedProfile, stats));
});

router.post('/me/skills', authMiddleware, async (req: AuthRequest, res) => {
  const { skill_name, proficiency_level = 'intermediate', years_experience = 0 } = req.body;
  if (!skill_name) return res.status(400).json({ error: 'Skill obrigatória' });
  const existing = await db.get<{ id: string }>(
    'SELECT id FROM user_skills WHERE user_id = ? AND skill_name = ?',
    [req.user!.id, skill_name]
  );
  if (existing) {
    await db.run(
      'UPDATE user_skills SET proficiency_level = ?, years_experience = ? WHERE id = ?',
      [proficiency_level, years_experience, existing.id]
    );
    return res.json({ ok: true });
  }
  const id = uuid();
  await db.run(
    'INSERT INTO user_skills (id, user_id, skill_name, proficiency_level, years_experience) VALUES (?, ?, ?, ?, ?)',
    [id, req.user!.id, skill_name, proficiency_level, years_experience]
  );
  res.status(201).json({ id, skill_name, proficiency_level, years_experience });
});

router.delete('/me/skills/:id', authMiddleware, async (req: AuthRequest, res) => {
  await db.run('DELETE FROM user_skills WHERE id = ? AND user_id = ?', [
    paramId(req.params.id),
    req.user!.id,
  ]);
  res.json({ ok: true });
});

router.delete('/me', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const deletedEmail = `deleted_${userId}@deleted.local`;
  const deletedUsername = `deleted_${userId.replace(/-/g, '').slice(0, 12)}`;
  const placeholderHash = bcrypt.hashSync(uuid(), 10);

  await db.run(
    `UPDATE users SET
       email = ?, username = ?, full_name = ?, avatar_url = NULL,
       password_hash = ?, is_active = 0, is_admin = 0
     WHERE id = ?`,
    [deletedEmail, deletedUsername, 'Conta excluída', placeholderHash, userId]
  );

  await db.run(
    `UPDATE public_profiles SET
       bio = '', cover_url = '', social_links = '{}', languages = '[]',
       primary_skill = '', show_whatsapp_on_profile = 0,
       is_premium = 0, premium_until = NULL, interests = '[]'
     WHERE user_id = ?`,
    [userId]
  );

  await db.run('UPDATE posts SET is_active = 0 WHERE author_id = ?', [userId]);
  await db.run('UPDATE businesses SET is_active = 0 WHERE owner_id = ?', [userId]);
  await db.run('UPDATE community_events SET is_active = 0 WHERE organizer_id = ?', [userId]);
  await db.run('UPDATE community_groups SET is_active = 0 WHERE owner_id = ?', [userId]);
  await db.run(`UPDATE classifieds SET is_active = 0, status = 'inactive' WHERE seller_id = ?`, [userId]);
  await db.run('DELETE FROM group_members WHERE user_id = ?', [userId]);
  await db.run('DELETE FROM event_interests WHERE user_id = ?', [userId]);
  await db.run('DELETE FROM follows WHERE follower_id = ? OR following_id = ?', [userId, userId]);
  await db.run('DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?', [userId, userId]);
  await db.run('DELETE FROM password_invites WHERE user_id = ?', [userId]);

  res.json({ ok: true });
});

export default router;
