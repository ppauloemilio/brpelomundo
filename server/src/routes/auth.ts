import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { parseJson, publicUser, UserRow } from '../db/database.js';
import { authMiddleware, AuthRequest, signToken } from '../middleware/auth.js';
import { getMonetizationSettings, isPremiumProfile } from '../lib/settings.js';
import { TERMS_VERSION } from '../lib/terms.js';
import { issueEmailVerification } from '../lib/emailVerification.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password, username, full_name, country = 'BR', terms_accepted } = req.body;
  if (!email || !password || !username || !full_name) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios' });
  }
  if (terms_accepted !== true) {
    return res.status(400).json({
      error: 'É preciso aceitar os termos e declarar que as informações são verdadeiras',
      code: 'TERMS_REQUIRED',
    });
  }
  const existing = await db.get('SELECT id FROM users WHERE email = ? OR username = ?', [
    email,
    username,
  ]);
  if (existing) return res.status(409).json({ error: 'Email ou username já em uso' });

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);
  const acceptedAt = new Date().toISOString();
  await db.run(
    `INSERT INTO users (id, email, password_hash, username, full_name, email_verified, terms_accepted_at, terms_version)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [id, email, hash, username, full_name, acceptedAt, TERMS_VERSION]
  );
  await db.run('INSERT INTO public_profiles (user_id, current_country) VALUES (?, ?)', [id, country]);
  await db.run(
    'INSERT INTO user_country_history (id, user_id, country, joined_at) VALUES (?, ?, ?, ?)',
    [uuid(), id, country, new Date().toISOString()]
  );

  try {
    await issueEmailVerification(id, email, full_name);
  } catch (err) {
    console.error('Falha ao enviar confirmação de e-mail:', err);
  }

  res.status(201).json({ pending_verification: true, email });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });

  const found = await db.get<UserRow>('SELECT * FROM users WHERE email = ?', [email]);
  if (!found) return res.status(401).json({ error: 'Credenciais inválidas' });
  if (found.is_active === 0) return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
  if (found.password_set === 0) {
    return res.status(403).json({ error: 'Defina sua senha pelo link enviado ao seu e-mail antes de entrar.' });
  }
  if (!bcrypt.compareSync(password, found.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  if (found.email_verified !== 1) {
    return res.status(403).json({
      error: 'Confirme seu e-mail para entrar. Olhe a caixa de entrada e o spam.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
  res.json({ token: signToken(found.id), user: publicUser(found) });
});

router.post('/verify-email', async (req, res) => {
  const token = String(req.body?.token || '');
  if (!token) return res.status(400).json({ error: 'Link inválido' });

  const row = await db.get<{
    id: string;
    user_id: string;
    expires_at: string;
    used_at: string | null;
  }>('SELECT * FROM email_verifications WHERE token = ?', [token]);
  if (!row) return res.status(404).json({ error: 'Link inválido ou já utilizado' });

  const user = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [row.user_id]);
  if (!user || user.is_active === 0) {
    return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
  }

  const usedRecently = !!row.used_at && Date.now() - new Date(row.used_at).getTime() < 2 * 60 * 1000;
  if (row.used_at && !usedRecently) {
    return res.status(404).json({ error: 'Link inválido ou já utilizado' });
  }
  if (!row.used_at && new Date(row.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Link expirado. Peça um novo na tela de login.' });
  }

  if (!row.used_at) {
    await db.run('UPDATE users SET email_verified = 1 WHERE id = ?', [row.user_id]);
    await db.run('UPDATE email_verifications SET used_at = utc_now() WHERE id = ?', [row.id]);
  }

  const fresh = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [row.user_id]);
  res.json({ token: signToken(fresh!.id), user: publicUser(fresh!) });
});

router.post('/resend-verification', async (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (email) {
    const user = await db.get<UserRow>(
      'SELECT * FROM users WHERE lower(email) = lower(?)',
      [email]
    );
    if (user && user.is_active !== 0 && user.email_verified !== 1 && user.password_set !== 0) {
      try {
        await issueEmailVerification(user.id, user.email, user.full_name);
      } catch (err) {
        console.error('Falha ao reenviar confirmação de e-mail:', err);
      }
    }
  }
  res.json({ ok: true });
});

router.post('/accept-terms', authMiddleware, async (req: AuthRequest, res) => {
  if (req.body?.accepted !== true) {
    return res.status(400).json({
      error: 'É preciso aceitar os termos e declarar que as informações são verdadeiras',
      code: 'TERMS_REQUIRED',
    });
  }
  await db.run(
    'UPDATE users SET terms_accepted_at = ?, terms_version = ? WHERE id = ?',
    [new Date().toISOString(), TERMS_VERSION, req.user!.id]
  );
  const user = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [req.user!.id]);
  res.json({ user: publicUser(user!) });
});

router.get('/invite/:token', async (req, res) => {
  const invite = await db.get<{ email: string; full_name: string; expires_at: string }>(
    `SELECT pi.*, u.full_name, u.email FROM password_invites pi
     JOIN users u ON u.id = pi.user_id
     WHERE pi.token = ? AND pi.used_at IS NULL`,
    [req.params.token]
  );
  if (!invite) return res.status(404).json({ error: 'Convite inválido ou já utilizado' });
  if (new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Convite expirado. Solicite um novo ao administrador.' });
  }
  res.json({ email: invite.email, full_name: invite.full_name });
});

router.post('/setup-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'Token e senha (mín. 6 caracteres) são obrigatórios' });
  }
  const invite = await db.get<{ id: string; user_id: string; expires_at: string }>(
    'SELECT * FROM password_invites WHERE token = ? AND used_at IS NULL',
    [token]
  );
  if (!invite) return res.status(404).json({ error: 'Convite inválido ou já utilizado' });
  if (new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Convite expirado' });
  }

  const hash = bcrypt.hashSync(password, 10);
  await db.run(
    'UPDATE users SET password_hash = ?, password_set = 1, email_verified = 1 WHERE id = ?',
    [hash, invite.user_id]
  );
  await db.run(
    'UPDATE email_verifications SET used_at = utc_now() WHERE user_id = ? AND used_at IS NULL',
    [invite.user_id]
  );
  await db.run(`UPDATE password_invites SET used_at = utc_now() WHERE id = ?`, [invite.id]);

  const user = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [invite.user_id]);
  res.json({ token: signToken(user!.id), user: publicUser(user!) });
});

type ProfileRow = {
  bio: string; current_country: string; current_city: string; current_state: string;
  origin_city: string; origin_state: string; cover_url: string; primary_skill: string;
  show_city_on_profile: number; show_whatsapp_on_profile: number;
  social_links: string; languages: string;
  is_premium?: number; premium_until?: string | null;
  interests?: string; onboarding_completed?: number;
};

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const [user, profile, skills, history, followers, following, posts, settings] = await Promise.all([
    db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]),
    db.get<ProfileRow>('SELECT * FROM public_profiles WHERE user_id = ?', [userId]),
    db.all('SELECT * FROM user_skills WHERE user_id = ?', [userId]),
    db.all('SELECT * FROM user_country_history WHERE user_id = ?', [userId]),
    db.get<{ c: number }>('SELECT COUNT(*) as c FROM follows WHERE following_id = ?', [userId]),
    db.get<{ c: number }>('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?', [userId]),
    db.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM posts WHERE author_id = ? AND is_active = 1',
      [userId]
    ),
    getMonetizationSettings(),
  ]);

  res.json({
    ...publicUser(user!),
    is_premium: isPremiumProfile(settings, profile),
    onboarding_completed: !!profile?.onboarding_completed,
    profile: {
      bio: profile?.bio || '',
      current_country: profile?.current_country || 'BR',
      current_city: profile?.current_city || '',
      current_state: profile?.current_state || '',
      origin_city: profile?.origin_city || '',
      origin_state: profile?.origin_state || '',
      cover_url: profile?.cover_url || '',
      primary_skill: profile?.primary_skill || '',
      interests: parseJson(profile?.interests || '[]', [] as string[]),
      onboarding_completed: !!profile?.onboarding_completed,
      show_city_on_profile: !!(profile?.show_city_on_profile ?? 1),
      show_whatsapp_on_profile: !!profile?.show_whatsapp_on_profile,
      social_links: parseJson(profile?.social_links ?? null, {}),
      languages: parseJson(profile?.languages ?? null, ['pt-BR']),
    },
    skills,
    country_history: history,
    followers_count: followers?.c ?? 0,
    following_count: following?.c ?? 0,
    posts_count: posts?.c ?? 0,
  });
});

router.post('/onboarding', authMiddleware, async (req: AuthRequest, res) => {
  const {
    current_country,
    current_state,
    current_city,
    origin_city,
    origin_state,
    primary_skill,
    interests,
  } = req.body as {
    current_country?: string;
    current_state?: string;
    current_city?: string;
    origin_city?: string;
    origin_state?: string;
    primary_skill?: string;
    interests?: string[];
  };

  if (!current_country?.trim() || !current_city?.trim()) {
    return res.status(400).json({ error: 'País e cidade atuais são obrigatórios' });
  }
  if (!Array.isArray(interests) || interests.length === 0) {
    return res.status(400).json({ error: 'Selecione pelo menos um interesse' });
  }

  const userId = req.user!.id;
  await db.run(
    'INSERT INTO public_profiles (user_id, current_country) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING',
    [userId, current_country.trim()]
  );

  await db.run(
    `UPDATE public_profiles SET
       current_country = ?,
       current_state = ?,
       current_city = ?,
       origin_city = COALESCE(?, origin_city),
       origin_state = COALESCE(?, origin_state),
       primary_skill = COALESCE(?, primary_skill),
       interests = ?,
       onboarding_completed = 1
     WHERE user_id = ?`,
    [
      current_country.trim(),
      (current_state || '').trim(),
      current_city.trim(),
      origin_city?.trim() || null,
      origin_state?.trim() || null,
      primary_skill?.trim() || null,
      JSON.stringify(interests),
      userId,
    ]
  );

  await db.run(
    `INSERT INTO user_country_history (id, user_id, country, joined_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, country) DO NOTHING`,
    [uuid(), userId, current_country.trim(), new Date().toISOString()]
  );

  const [user, updated, settings] = await Promise.all([
    db.get<UserRow>('SELECT * FROM users WHERE id = ?', [userId]),
    db.get<{
      current_country: string; current_city: string; current_state: string;
      interests: string; onboarding_completed: number;
      is_premium?: number; premium_until?: string | null;
    }>('SELECT * FROM public_profiles WHERE user_id = ?', [userId]),
    getMonetizationSettings(),
  ]);

  res.json({
    ...publicUser(user!),
    is_premium: isPremiumProfile(settings, updated),
    onboarding_completed: true,
    profile: {
      current_country: updated!.current_country,
      current_city: updated!.current_city,
      current_state: updated!.current_state || '',
      interests: parseJson(updated!.interests, [] as string[]),
      onboarding_completed: true,
    },
  });
});

export default router;
