import { randomBytes } from 'crypto';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { sendVerificationEmail } from './email.js';

const TTL_MS = 48 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export async function issueEmailVerification(userId: string, email: string, fullName: string) {
  const recent = await db.get<{ created_at: string }>(
    `SELECT created_at FROM email_verifications
     WHERE user_id = ? AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  if (recent && Date.now() - new Date(recent.created_at).getTime() < RESEND_COOLDOWN_MS) {
    return { sent: false, throttled: true };
  }

  await db.run(
    `UPDATE email_verifications SET used_at = utc_now() WHERE user_id = ? AND used_at IS NULL`,
    [userId]
  );

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  await db.run(
    `INSERT INTO email_verifications (id, user_id, token, email, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [uuid(), userId, token, email, expiresAt]
  );

  const result = await sendVerificationEmail(email, token, fullName);
  return { ...result, throttled: false };
}
