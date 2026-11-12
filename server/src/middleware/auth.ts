import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { db } from '../db/sql.js';
import { publicUser, UserRow } from '../db/database.js';
import { getJwtSecret } from '../lib/jwtSecret.js';

export interface AuthRequest extends Request {
  user?: ReturnType<typeof publicUser>;
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: '30d' });
}

async function userFromHeader(header: string | undefined): Promise<UserRow | undefined> {
  if (!header?.startsWith('Bearer ')) return undefined;
  const payload = jwt.verify(header.slice(7), getJwtSecret()) as { sub: string };
  return db.get<UserRow>('SELECT * FROM users WHERE id = ?', [payload.sub]);
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  let user: UserRow | undefined;
  try {
    user = await userFromHeader(req.headers.authorization);
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
  if (user.is_active === 0) {
    return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
  }
  req.user = publicUser(user);
  next();
}

export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const user = await userFromHeader(req.headers.authorization);
    if (user && user.is_active !== 0) req.user = publicUser(user);
  } catch { /* segue sem usuário */ }
  next();
}

export async function createNotification(
  userId: string,
  actorId: string,
  type: string,
  targetType?: string,
  targetId?: string
) {
  if (userId === actorId) return;
  const actor = await db.get<UserRow>('SELECT * FROM users WHERE id = ?', [actorId]);
  if (!actor) return;
  await db.run(
    `INSERT INTO notifications (id, user_id, actor_id, type, target_type, target_id, actor_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      userId,
      actorId,
      type,
      targetType || null,
      targetId || null,
      JSON.stringify({
        id: actor.id,
        username: actor.username,
        full_name: actor.full_name,
        avatar_url: actor.avatar_url,
      }),
    ]
  );
}
