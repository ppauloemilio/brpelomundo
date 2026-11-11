import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { sendPasswordResetEmail } from './email.js';
import { createPasswordInvite } from './adminUser.js';

const RESET_TTL_MS = 48 * 60 * 60 * 1000;

export type PasswordResetKind = 'forgot' | 'admin';

/** Invalida convites abertos e emite um novo link de redefinição. */
export async function issuePasswordReset(
  userId: string,
  email: string,
  fullName: string,
  kind: PasswordResetKind
) {
  await db.run(
    `UPDATE password_invites SET used_at = utc_now()
     WHERE user_id = ? AND used_at IS NULL`,
    [userId]
  );

  // Admin force-reset: senha antiga deixa de valer até o usuário definir outra.
  if (kind === 'admin') {
    const placeholderHash = bcrypt.hashSync(uuid(), 10);
    await db.run('UPDATE users SET password_hash = ?, password_set = 0 WHERE id = ?', [
      placeholderHash,
      userId,
    ]);
  }

  const token = await createPasswordInvite(userId, email, RESET_TTL_MS);
  const result = await sendPasswordResetEmail(email, token, fullName, kind);
  return { token, ...result };
}
