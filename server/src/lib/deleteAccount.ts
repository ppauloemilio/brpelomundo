import { db } from '../db/sql.js';

async function recountPosts(column: 'comments_count' | 'likes_count', postIds: string[]) {
  if (!postIds.length) return;
  const placeholders = postIds.map(() => '?').join(',');
  const countSql = column === 'comments_count'
    ? `SELECT COUNT(*) FROM comments c WHERE c.post_id = posts.id AND COALESCE(c.is_active, 1) = 1`
    : `SELECT COUNT(*) FROM likes l WHERE l.post_id = posts.id`;
  await db.run(
    `UPDATE posts SET ${column} = (${countSql}) WHERE id IN (${placeholders})`,
    postIds
  );
}

/**
 * Apaga a conta e tudo que ela publicou: posts, comentários, curtidas,
 * empresas, classificados, eventos, grupos, anúncios, mensagens e avaliações.
 */
export async function deleteAccount(userId: string) {
  const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) return;

  await db.run(
    `DELETE FROM conversations WHERE participant_ids::jsonb @> to_jsonb(?::text)`,
    [userId]
  );
  await db.run('DELETE FROM messages WHERE sender_id = ?', [userId]);

  await db.run(
    `DELETE FROM shares WHERE user_id = ? OR post_id IN (SELECT id FROM posts WHERE author_id = ?)`,
    [userId, userId]
  );
  await db.run('DELETE FROM notifications WHERE actor_id = ?', [userId]);

  await db.run(
    `DELETE FROM reports
     WHERE reporter_id = ?
        OR (target_type = 'user' AND target_id = ?)
        OR target_id IN (
          SELECT id FROM posts WHERE author_id = ?
          UNION ALL SELECT id FROM businesses WHERE owner_id = ?
          UNION ALL SELECT id FROM classifieds WHERE seller_id = ?
          UNION ALL SELECT id FROM community_events WHERE organizer_id = ?
          UNION ALL SELECT id FROM community_groups WHERE owner_id = ?
          UNION ALL SELECT id FROM comments WHERE author_id = ?
          UNION ALL SELECT id FROM reviews WHERE author_id = ?
          UNION ALL SELECT id FROM group_posts WHERE author_id = ?
        )`,
    [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId]
  );

  await db.run(
    `DELETE FROM reviews
     WHERE author_id = ?
        OR (target_type = 'user' AND target_id = ?)
        OR (target_type = 'business' AND target_id IN (SELECT id FROM businesses WHERE owner_id = ?))
        OR (target_type = 'classified' AND target_id IN (SELECT id FROM classifieds WHERE seller_id = ?))`,
    [userId, userId, userId, userId]
  );

  await db.run('DELETE FROM billing_orders WHERE user_id = ?', [userId]);
  await db.run('DELETE FROM advertisements WHERE owner_id = ?', [userId]);
  await db.run('UPDATE ad_events SET user_id = NULL WHERE user_id = ?', [userId]);

  await db.run(
    `DELETE FROM conversations WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = ?)`,
    [userId]
  );
  await db.run(
    `UPDATE posts SET business_id = NULL WHERE business_id IN (SELECT id FROM businesses WHERE owner_id = ?)`,
    [userId]
  );

  await db.run('DELETE FROM posts WHERE author_id = ?', [userId]);
  await db.run('DELETE FROM businesses WHERE owner_id = ?', [userId]);
  await db.run('DELETE FROM classifieds WHERE seller_id = ?', [userId]);
  await db.run('DELETE FROM community_groups WHERE owner_id = ?', [userId]);
  await db.run('DELETE FROM community_events WHERE organizer_id = ?', [userId]);
  await db.run('DELETE FROM group_posts WHERE author_id = ?', [userId]);

  const commentPosts = await db.all<{ post_id: string }>(
    'SELECT DISTINCT post_id FROM comments WHERE author_id = ?',
    [userId]
  );
  await db.run('DELETE FROM comments WHERE author_id = ?', [userId]);
  await recountPosts('comments_count', commentPosts.map((row) => row.post_id));

  const likePosts = await db.all<{ post_id: string }>(
    'SELECT post_id FROM likes WHERE user_id = ?',
    [userId]
  );
  await db.run('DELETE FROM likes WHERE user_id = ?', [userId]);
  await recountPosts('likes_count', likePosts.map((row) => row.post_id));

  await db.run(
    `UPDATE community_groups g
     SET members_count = (
       SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id AND m.user_id <> ?
     )
     WHERE EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = ?)`,
    [userId, userId]
  );
  await db.run(
    `UPDATE community_events e
     SET interest_count = (
       SELECT COUNT(*) FROM event_interests i WHERE i.event_id = e.id AND i.user_id <> ?
     )
     WHERE EXISTS (SELECT 1 FROM event_interests i WHERE i.event_id = e.id AND i.user_id = ?)`,
    [userId, userId]
  );

  await db.run('DELETE FROM users WHERE id = ?', [userId]);
}
