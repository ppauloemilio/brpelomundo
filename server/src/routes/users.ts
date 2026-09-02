import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import type { SQLInputValue } from 'node:sqlite';
import { getDb, parseJson, UserRow } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { isPremiumProfile } from '../lib/settings.js';
import { paramId } from '../lib/params.js';

const router = Router();

function formatUser(user: UserRow, profile?: Record<string, unknown>, extra?: Record<string, unknown>) {
  const social = parseJson(profile?.social_links as string, {});
  const premiumActive = isPremiumProfile(profile as { is_premium?: number; premium_until?: string | null });
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

function profileStats(db: ReturnType<typeof getDb>, userId: string) {
  const followers = db.prepare('SELECT COUNT(*) as c FROM follows WHERE following_id = ?').get(userId) as { c: number };
  const following = db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').get(userId) as { c: number };
  const posts = db.prepare('SELECT COUNT(*) as c FROM posts WHERE author_id = ? AND is_active = 1').get(userId) as { c: number };
  const rating = db.prepare(
    `SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS rating_count
     FROM reviews WHERE target_type = 'user' AND target_id = ? AND is_active = 1`
  ).get(userId) as { avg_rating: number | null; rating_count: number };
  return {
    followers_count: followers.c,
    following_count: following.c,
    posts_count: posts.c,
    rating_avg: Number(rating.avg_rating || 0),
    rating_count: rating.rating_count || 0,
  };
}

router.get('/', authMiddleware, (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const country = typeof req.query.country === 'string' ? req.query.country : undefined;
  const db = getDb();
  let users: UserRow[];

  if (q) {
    users = db.prepare(
      `SELECT u.* FROM users u
       LEFT JOIN public_profiles p ON p.user_id = u.id
       WHERE u.full_name LIKE ? OR u.username LIKE ?
       ${country ? 'AND p.current_country = ?' : ''}
       LIMIT 50`
    ).all(...(country ? [`%${q}%`, `%${q}%`, country] : [`%${q}%`, `%${q}%`])) as UserRow[];
  } else if (country) {
    users = db.prepare(
      `SELECT u.* FROM users u
       JOIN public_profiles p ON p.user_id = u.id
       WHERE p.current_country = ? LIMIT 50`
    ).all(country) as UserRow[];
  } else {
    users = db.prepare('SELECT * FROM users LIMIT 50').all() as UserRow[];
  }

  res.json(
    users.map((u) => {
      const profile = db.prepare('SELECT * FROM public_profiles WHERE user_id = ?').get(u.id) as Record<string, unknown>;
      return formatUser(u, profile);
    })
  );
});

router.get('/:id/posts', authMiddleware, (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const db = getDb();
  const posts = db.prepare(
    'SELECT * FROM posts WHERE author_id = ? AND is_active = 1 ORDER BY created_at DESC'
  ).all(id);

  const likes = db.prepare('SELECT post_id FROM likes WHERE user_id = ?').all(req.user!.id) as { post_id: string }[];
  const likedSet = new Set(likes.map((l) => l.post_id));

  const authorProfile = db.prepare(
    'SELECT is_premium, premium_until FROM public_profiles WHERE user_id = ?'
  ).get(id) as { is_premium: number; premium_until: string | null } | undefined;
  const authorIsPremium = isPremiumProfile(authorProfile);

  res.json(
    posts.map((p) => ({
      ...p,
      images: parseJson((p as { images: string }).images, []),
      author_snapshot: {
        ...parseJson((p as { author_snapshot: string }).author_snapshot, {}),
        is_premium: authorIsPremium,
      },
      author_is_premium: authorIsPremium,
      liked_by_me: likedSet.has((p as { id: string }).id),
    }))
  );
});

router.get('/:id/businesses', authMiddleware, (req, res) => {
  const db = getDb();
  const businesses = db.prepare(
    'SELECT id, name, category, address, country FROM businesses WHERE owner_id = ? AND is_active = 1 ORDER BY created_at DESC'
  ).all(paramId(req.params.id));
  res.json(businesses);
});

router.get('/:id', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(paramId(req.params.id)) as UserRow | undefined;
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const profile = db.prepare('SELECT * FROM public_profiles WHERE user_id = ?').get(user.id) as Record<string, unknown>;
  const skills = db.prepare('SELECT * FROM user_skills WHERE user_id = ?').all(user.id);
  const stats = profileStats(db, user.id);

  if (req.user!.id !== user.id) {
    const isFollowing = db.prepare(
      'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?'
    ).get(req.user!.id, user.id);
    const publicProfile = { ...formatUser(user, profile, stats), skills, is_following: !!isFollowing };
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

  res.json({ ...formatUser(user, profile, stats), skills });
});

router.patch('/me/profile', authMiddleware, (req: AuthRequest, res) => {
  const {
    full_name, bio, username, avatar_url, cover_url,
    current_country, current_state, current_city,
    origin_state, origin_city, primary_skill,
    show_city_on_profile, show_whatsapp_on_profile,
    social_links, languages, interests, onboarding_completed,
  } = req.body;
  const db = getDb();
  const userId = req.user!.id;

  if (full_name !== undefined) db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(full_name, userId);
  if (avatar_url !== undefined) db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatar_url, userId);
  if (username) {
    const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, userId);
    if (taken) return res.status(409).json({ error: 'Username já em uso' });
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, userId);
  }

  let profile = db.prepare('SELECT * FROM public_profiles WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!profile) {
    db.prepare('INSERT INTO public_profiles (user_id, current_country) VALUES (?, ?)').run(userId, current_country || 'BR');
    profile = db.prepare('SELECT * FROM public_profiles WHERE user_id = ?').get(userId) as Record<string, unknown>;
  }

  const profileUpdates: string[] = [];
  const profileParams: SQLInputValue[] = [];

  const setProfile = (column: string, value: SQLInputValue | undefined) => {
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
    profileUpdates.push('show_city_on_profile = ?');
    profileParams.push(show_city_on_profile ? 1 : 0);
  }
  if (show_whatsapp_on_profile !== undefined) {
    profileUpdates.push('show_whatsapp_on_profile = ?');
    profileParams.push(show_whatsapp_on_profile ? 1 : 0);
  }
  if (social_links !== undefined) {
    profileUpdates.push('social_links = ?');
    profileParams.push(JSON.stringify(social_links));
  }
  if (languages !== undefined) {
    profileUpdates.push('languages = ?');
    profileParams.push(JSON.stringify(languages));
  }
  if (interests !== undefined) {
    profileUpdates.push('interests = ?');
    profileParams.push(JSON.stringify(interests));
  }
  if (onboarding_completed !== undefined) {
    profileUpdates.push('onboarding_completed = ?');
    profileParams.push(onboarding_completed ? 1 : 0);
  }

  if (profileUpdates.length > 0) {
    db.prepare(
      `UPDATE public_profiles SET ${profileUpdates.join(', ')} WHERE user_id = ?`
    ).run(...profileParams, userId);
  }

  if (current_country) {
    const existing = db.prepare(
      'SELECT id FROM user_country_history WHERE user_id = ? AND country = ?'
    ).get(userId, current_country);
    if (!existing) {
      db.prepare('INSERT INTO user_country_history (id, user_id, country, joined_at) VALUES (?, ?, ?, ?)').run(
        uuid(), userId, current_country, new Date().toISOString()
      );
    }
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
  const updatedProfile = db.prepare('SELECT * FROM public_profiles WHERE user_id = ?').get(userId) as Record<string, unknown>;
  res.json(formatUser(user, updatedProfile, profileStats(db, userId)));
});

router.post('/me/skills', authMiddleware, (req: AuthRequest, res) => {
  const { skill_name, proficiency_level = 'intermediate', years_experience = 0 } = req.body;
  if (!skill_name) return res.status(400).json({ error: 'Skill obrigatória' });
  const db = getDb();
  const existing = db.prepare('SELECT id FROM user_skills WHERE user_id = ? AND skill_name = ?').get(req.user!.id, skill_name);
  if (existing) {
    db.prepare('UPDATE user_skills SET proficiency_level = ?, years_experience = ? WHERE id = ?').run(
      proficiency_level, years_experience, (existing as { id: string }).id
    );
    return res.json({ ok: true });
  }
  const id = uuid();
  db.prepare(
    'INSERT INTO user_skills (id, user_id, skill_name, proficiency_level, years_experience) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.user!.id, skill_name, proficiency_level, years_experience);
  res.status(201).json({ id, skill_name, proficiency_level, years_experience });
});

router.delete('/me/skills/:id', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  db.prepare('DELETE FROM user_skills WHERE id = ? AND user_id = ?').run(paramId(req.params.id), req.user!.id);
  res.json({ ok: true });
});

router.delete('/me', authMiddleware, (req: AuthRequest, res) => {
  const db = getDb();
  const userId = req.user!.id;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const deletedEmail = `deleted_${userId}@deleted.local`;
  const deletedUsername = `deleted_${userId.replace(/-/g, '').slice(0, 12)}`;
  const placeholderHash = bcrypt.hashSync(uuid(), 10);

  db.prepare(
    `UPDATE users SET
       email = ?, username = ?, full_name = ?, avatar_url = NULL,
       password_hash = ?, is_active = 0, is_admin = 0
     WHERE id = ?`
  ).run(deletedEmail, deletedUsername, 'Conta excluída', placeholderHash, userId);

  db.prepare(
    `UPDATE public_profiles SET
       bio = '', cover_url = '', social_links = '{}', languages = '[]',
       primary_skill = '', show_whatsapp_on_profile = 0,
       is_premium = 0, premium_until = NULL, interests = '[]'
     WHERE user_id = ?`
  ).run(userId);

  db.prepare('UPDATE posts SET is_active = 0 WHERE author_id = ?').run(userId);
  db.prepare('UPDATE businesses SET is_active = 0 WHERE owner_id = ?').run(userId);
  db.prepare('UPDATE community_events SET is_active = 0 WHERE organizer_id = ?').run(userId);
  db.prepare('UPDATE community_groups SET is_active = 0 WHERE owner_id = ?').run(userId);
  db.prepare(`UPDATE classifieds SET is_active = 0, status = 'inactive' WHERE seller_id = ?`).run(userId);
  db.prepare('DELETE FROM group_members WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM event_interests WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').run(userId, userId);
  db.prepare('DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?').run(userId, userId);
  db.prepare('DELETE FROM password_invites WHERE user_id = ?').run(userId);

  res.json({ ok: true });
});

export default router;
