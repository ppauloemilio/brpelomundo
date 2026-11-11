import { db } from '../db/sql.js';

export type LiveUserFields = {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
};

/** Dados atuais do usuário para hidratar snapshots antigos (avatar/nome). */
export async function liveUsersByIds(ids: string[]): Promise<Map<string, LiveUserFields>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, LiveUserFields>();
  if (!unique.length) return map;

  const placeholders = unique.map(() => '?').join(',');
  const rows = await db.all<LiveUserFields>(
    `SELECT id, username, full_name, avatar_url FROM users WHERE id IN (${placeholders})`,
    unique
  );
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

export function hydrateUserSnapshot(
  snapshot: Record<string, unknown>,
  live?: LiveUserFields | null
): Record<string, unknown> {
  if (!live) return snapshot;
  return {
    ...snapshot,
    id: live.id,
    username: live.username,
    full_name: live.full_name,
    avatar_url: live.avatar_url,
  };
}
