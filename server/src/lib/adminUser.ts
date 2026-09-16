import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { sendPasswordInviteEmail } from './email.js';

export const ADMIN_EMAIL = 'ppauloemilio@hotmail.com';
export const DEMO_ADMIN_EMAIL = 'ana@demo.com';

export async function promoteAdminByEmail(email: string) {
  await db.run('UPDATE users SET is_admin = 1 WHERE email = ?', [email]);
}

export async function createPasswordInvite(userId: string, email: string): Promise<string> {
  const token = uuid();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.run(
    `INSERT INTO password_invites (id, user_id, token, email, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [uuid(), userId, token, email, expiresAt]
  );
  return token;
}

export async function ensureAdminUser() {
  await promoteAdminByEmail(DEMO_ADMIN_EMAIL);

  const existing = await db.get<{ id: string; full_name: string; password_set: number }>(
    'SELECT * FROM users WHERE email = ?',
    [ADMIN_EMAIL]
  );

  if (existing) {
    await promoteAdminByEmail(ADMIN_EMAIL);
    return;
  }

  const id = uuid();
  const placeholderHash = bcrypt.hashSync(uuid(), 10);
  await db.run(
    `INSERT INTO users (id, email, password_hash, username, full_name, is_admin, password_set)
     VALUES (?, ?, ?, ?, ?, 1, 0)`,
    [id, ADMIN_EMAIL, placeholderHash, 'paulo_admin', 'Paulo Emilio']
  );

  await db.run('INSERT INTO public_profiles (user_id, current_country) VALUES (?, ?)', [id, 'BR']);
  await db.run(
    'INSERT INTO user_country_history (id, user_id, country, joined_at) VALUES (?, ?, ?, ?)',
    [uuid(), id, 'BR', new Date().toISOString()]
  );

  const token = await createPasswordInvite(id, ADMIN_EMAIL);
  await sendPasswordInviteEmail(ADMIN_EMAIL, token, 'Paulo Emilio');
}
