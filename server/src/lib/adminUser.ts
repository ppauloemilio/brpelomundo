import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import type { DatabaseSync } from 'node:sqlite';
import { sendPasswordInviteEmail } from './email.js';

export const ADMIN_EMAIL = 'ppauloemilio@hotmail.com';
export const DEMO_ADMIN_EMAIL = 'ana@demo.com';

export function promoteAdminByEmail(db: DatabaseSync, email: string) {
  db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run(email);
}

export function createPasswordInvite(db: DatabaseSync, userId: string, email: string): string {
  const token = uuid();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO password_invites (id, user_id, token, email, expires_at) VALUES (?, ?, ?, ?, ?)`
  ).run(uuid(), userId, token, email, expiresAt);
  return token;
}

export async function ensureAdminUser(db: DatabaseSync) {
  promoteAdminByEmail(db, DEMO_ADMIN_EMAIL);

  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(ADMIN_EMAIL) as
    | { id: string; full_name: string; password_set: number }
    | undefined;

  if (existing) {
    promoteAdminByEmail(db, ADMIN_EMAIL);
    return;
  }

  const id = uuid();
  const placeholderHash = bcrypt.hashSync(uuid(), 10);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, username, full_name, is_admin, password_set)
     VALUES (?, ?, ?, ?, ?, 1, 0)`
  ).run(id, ADMIN_EMAIL, placeholderHash, 'paulo_admin', 'Paulo Emilio');

  db.prepare('INSERT INTO public_profiles (user_id, current_country) VALUES (?, ?)').run(id, 'BR');
  db.prepare('INSERT INTO user_country_history (id, user_id, country, joined_at) VALUES (?, ?, ?, ?)').run(
    uuid(), id, 'BR', new Date().toISOString()
  );

  const token = createPasswordInvite(db, id, ADMIN_EMAIL);
  await sendPasswordInviteEmail(ADMIN_EMAIL, token, 'Paulo Emilio');
}
