import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb, publicUser, UserRow } from '../db/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'comunidade-br-dev-secret-change-in-production';

export interface AuthRequest extends Request {
  user?: ReturnType<typeof publicUser>;
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' });
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { sub: string };
    const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as UserRow | undefined;
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    req.user = publicUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { sub: string };
    const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as UserRow | undefined;
    if (user) req.user = publicUser(user);
  } catch { /* ignore */ }
  next();
}

export function createNotification(
  userId: string,
  actorId: string,
  type: string,
  targetType?: string,
  targetId?: string
) {
  if (userId === actorId) return;
  const db = getDb();
  const actor = db.prepare('SELECT * FROM users WHERE id = ?').get(actorId) as UserRow;
  db.prepare(
    `INSERT INTO notifications (id, user_id, actor_id, type, target_type, target_id, actor_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuid(),
    userId,
    actorId,
    type,
    targetType || null,
    targetId || null,
    JSON.stringify({ id: actor.id, username: actor.username, full_name: actor.full_name, avatar_url: actor.avatar_url })
  );
}
