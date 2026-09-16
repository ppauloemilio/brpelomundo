import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { parseJson, userSnapshot, UserRow } from '../db/database.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

function paramId(raw: string | string[]): string {
  return Array.isArray(raw) ? raw[0] : raw;
}

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  const country = (req.query.country as string)?.trim();
  const city = (req.query.city as string)?.trim();
  const mine = req.query.mine === '1';

  const profile = await db.get<{ current_country: string; current_city: string }>(
    'SELECT current_country, current_city FROM public_profiles WHERE user_id = ?',
    [req.user!.id]
  );

  const filterCountry = country || profile?.current_country || '';
  const filterCity = city || '';

  if (mine) {
    const groups = await db.all<Record<string, unknown>>(
      `SELECT g.*,
              CASE WHEN gm.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_member,
              gm.role AS my_role
       FROM community_groups g
       JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
       WHERE g.is_active = 1
       ORDER BY g.created_at DESC`,
      [req.user!.id]
    );
    return res.json(groups.map((g) => ({ ...g, is_member: true })));
  }

  const conditions = ['g.is_active = 1', "UPPER(TRIM(g.country)) != 'BR'"];
  const params: string[] = [];

  if (filterCountry && filterCountry.toUpperCase() !== 'BR') {
    conditions.push('g.country = ?');
    params.push(filterCountry);
  }
  if (filterCity) {
    conditions.push('LOWER(TRIM(g.city)) = LOWER(?)');
    params.push(filterCity);
  }

  const groups = await db.all<Record<string, unknown> & { is_member: number }>(
    `SELECT g.*,
            CASE WHEN gm.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_member,
            gm.role AS my_role
     FROM community_groups g
     LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE WHEN LOWER(TRIM(g.city)) = LOWER(?) THEN 0 ELSE 1 END,
       g.members_count DESC,
       g.created_at DESC
     LIMIT 50`,
    [req.user!.id, ...params, (profile?.current_city || '').trim()]
  );

  res.json(groups.map((g) => ({
    ...g,
    is_member: !!g.is_member,
  })));
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const { name, description, country, city, cover_url, is_public } = req.body;
  if (!name?.trim() || !country?.trim() || !city?.trim()) {
    return res.status(400).json({ error: 'Nome, país e cidade são obrigatórios' });
  }

  const id = uuid();
  const user = (await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [req.user!.id]))!;

  await db.run(
    `INSERT INTO community_groups (id, name, description, country, city, cover_url, owner_id, is_public, members_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      name.trim(),
      description?.trim() || '',
      country.trim(),
      city.trim(),
      cover_url || '',
      user.id,
      is_public === false ? 0 : 1,
    ]
  );

  await db.run(
    `INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, 'owner')`,
    [uuid(), id, user.id]
  );

  const group = await db.get<Record<string, unknown>>('SELECT * FROM community_groups WHERE id = ?', [id]);
  res.status(201).json({ ...group, is_member: true, my_role: 'owner' });
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const group = await db.get<Record<string, unknown>>(
    `SELECT g.*, u.full_name AS owner_name, u.username AS owner_username
     FROM community_groups g
     JOIN users u ON u.id = g.owner_id
     WHERE g.id = ? AND g.is_active = 1`,
    [id]
  );
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });

  const [membership, members] = await Promise.all([
    db.get<{ role: string }>(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
      [id, req.user!.id]
    ),
    db.all<Record<string, unknown>>(
      `SELECT u.id, u.full_name, u.username, u.avatar_url, gm.role, gm.joined_at
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, gm.joined_at ASC
       LIMIT 50`,
      [id]
    ),
  ]);

  res.json({
    ...group,
    is_member: !!membership,
    my_role: membership?.role || null,
    members,
  });
});

router.post('/:id/join', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const group = await db.get<{ id: string }>(
    'SELECT id FROM community_groups WHERE id = ? AND is_active = 1',
    [id]
  );
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });

  const existing = await db.get<{ id: string }>(
    'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
    [id, req.user!.id]
  );
  if (existing) return res.json({ ok: true, already: true });

  await db.run(
    `INSERT INTO group_members (id, group_id, user_id, role) VALUES (?, ?, ?, 'member')`,
    [uuid(), id, req.user!.id]
  );
  await db.run('UPDATE community_groups SET members_count = members_count + 1 WHERE id = ?', [id]);
  res.json({ ok: true });
});

router.delete('/:id/join', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const membership = await db.get<{ role: string }>(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?',
    [id, req.user!.id]
  );
  if (!membership) return res.json({ ok: true });
  if (membership.role === 'owner') {
    return res.status(400).json({ error: 'O dono não pode sair do grupo. Transfira a administração primeiro.' });
  }

  await db.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [id, req.user!.id]);
  await db.run(
    `UPDATE community_groups SET members_count = CASE WHEN members_count > 1 THEN members_count - 1 ELSE 1 END WHERE id = ?`,
    [id]
  );
  res.json({ ok: true });
});

router.get('/:id/posts', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const posts = await db.all<Record<string, unknown> & { author_snapshot: string }>(
    `SELECT * FROM group_posts WHERE group_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 50`,
    [id]
  );
  res.json(posts.map((p) => ({
    ...p,
    author_snapshot: parseJson(p.author_snapshot, {}),
  })));
});

router.post('/:id/posts', authMiddleware, async (req: AuthRequest, res) => {
  const id = paramId(req.params.id);
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Conteúdo obrigatório' });

  const membership = await db.get<{ id: string }>(
    'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?',
    [id, req.user!.id]
  );
  if (!membership) return res.status(403).json({ error: 'Entre no grupo para publicar' });

  const user = (await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [req.user!.id]))!;
  const profile = await db.get<{ current_city: string; current_country: string }>(
    'SELECT current_city, current_country FROM public_profiles WHERE user_id = ?',
    [user.id]
  );

  const postId = uuid();
  await db.run(
    `INSERT INTO group_posts (id, group_id, author_id, content, author_snapshot)
     VALUES (?, ?, ?, ?, ?)`,
    [
      postId,
      id,
      user.id,
      content.trim(),
      userSnapshot({ ...user, city: profile?.current_city, country: profile?.current_country }),
    ]
  );

  const post = await db.get<Record<string, unknown> & { author_snapshot: string }>(
    'SELECT * FROM group_posts WHERE id = ?',
    [postId]
  );
  res.status(201).json({
    ...post,
    author_snapshot: parseJson(post!.author_snapshot, {}),
  });
});

export default router;
