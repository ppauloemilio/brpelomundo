import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';

/** Remove o acesso e os dados pessoais, e tira do ar o que a pessoa publicou. */
export async function deleteAccount(userId: string) {
  const deletedEmail = `deleted_${userId}@deleted.local`;
  const deletedUsername = `deleted_${userId.replace(/-/g, '').slice(0, 12)}`;
  const placeholderHash = bcrypt.hashSync(uuid(), 10);

  await db.run(
    `UPDATE users SET
       email = ?, username = ?, full_name = ?, avatar_url = NULL,
       password_hash = ?, is_active = 0, is_admin = 0, is_verified = 0
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
  await db.run('UPDATE group_posts SET is_active = 0 WHERE author_id = ?', [userId]);
  await db.run(`UPDATE classifieds SET is_active = 0, status = 'inactive' WHERE seller_id = ?`, [userId]);
  await db.run('UPDATE reviews SET is_active = 0 WHERE author_id = ?', [userId]);
  await db.run('UPDATE comments SET is_active = 0 WHERE author_id = ?', [userId]);
  await db.run('DELETE FROM group_members WHERE user_id = ?', [userId]);
  await db.run('DELETE FROM event_interests WHERE user_id = ?', [userId]);
  await db.run('DELETE FROM follows WHERE follower_id = ? OR following_id = ?', [userId, userId]);
  await db.run('DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?', [userId, userId]);
  await db.run('DELETE FROM password_invites WHERE user_id = ?', [userId]);
  await db.run('UPDATE email_verifications SET used_at = utc_now() WHERE user_id = ? AND used_at IS NULL', [userId]);
}
