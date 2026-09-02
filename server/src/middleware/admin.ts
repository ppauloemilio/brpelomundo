import { Response, NextFunction } from 'express';
import { getDb } from '../db/database.js';
import { AuthRequest } from './auth.js';

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  const row = getDb().prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id) as
    | { is_admin: number }
    | undefined;
  if (!row?.is_admin) return res.status(403).json({ error: 'Acesso restrito a administradores' });
  next();
}
