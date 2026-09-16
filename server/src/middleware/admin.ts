import { Response, NextFunction } from 'express';
import { db } from '../db/sql.js';
import { AuthRequest } from './auth.js';

export async function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  const row = await db.get<{ is_admin: number }>('SELECT is_admin FROM users WHERE id = ?', [
    req.user.id,
  ]);
  if (!row?.is_admin) return res.status(403).json({ error: 'Acesso restrito a administradores' });
  next();
}
