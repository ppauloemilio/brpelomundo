import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { uploadsDir, blobEnabled } from './lib/uploads.js';
import authRoutes from './routes/auth.js';
import postsRoutes from './routes/posts.js';
import usersRoutes from './routes/users.js';
import businessesRoutes from './routes/businesses.js';
import socialRoutes from './routes/social.js';
import messagesRoutes from './routes/messages.js';
import miscRoutes from './routes/misc.js';
import geoRoutes from './routes/geo.js';
import communityRoutes from './routes/community.js';
import adminRoutes from './routes/admin.js';
import groupsRoutes from './routes/groups.js';
import eventsRoutes from './routes/events.js';
import classifiedsRoutes from './routes/classifieds.js';
import reviewsRoutes from './routes/reviews.js';
import moderationRoutes from './routes/moderation.js';
import billingRoutes from './routes/billing.js';
import { migrateSchema } from './db/migrate.js';

const schemaReady = migrateSchema().catch((err) => {
  console.error('Falha na migração do schema:', err);
});

/** Origens permitidas (APP_URL e/ou CORS_ORIGIN separados por vírgula). Sem isso, libera tudo. */
function resolveCorsOrigin(): boolean | string | string[] {
  const listed = [
    ...(process.env.CORS_ORIGIN?.split(',') ?? []),
    process.env.APP_URL ?? '',
  ]
    // A barra final quebraria a comparação: o header Origin nunca a inclui.
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (listed.length === 0) return true;
  return listed.length === 1 ? listed[0] : listed;
}

export function createApp() {
  const app = express();

  app.use(async (_req, _res, next) => {
    await schemaReady;
    next();
  });

  app.use(cors({ origin: resolveCorsOrigin(), credentials: true }));
  app.use(express.json());

  // Em produção os uploads vão para o Vercel Blob e são servidos pela CDN.
  if (!blobEnabled) {
    app.use('/uploads', express.static(uploadsDir));
  }

  app.use('/api/auth', authRoutes);
  app.use('/api/posts', postsRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/businesses', businessesRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/conversations', messagesRoutes);
  app.use('/api/geo', geoRoutes);
  app.use('/api/community', communityRoutes);
  app.use('/api/groups', groupsRoutes);
  app.use('/api/events', eventsRoutes);
  app.use('/api/classifieds', classifiedsRoutes);
  app.use('/api/reviews', reviewsRoutes);
  app.use('/api/moderation', moderationRoutes);
  app.use('/api/billing', billingRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', miscRoutes);

  // O Express 5 encaminha rejeições dos handlers async para cá.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Erro não tratado:', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Erro interno do servidor' });
  });

  return app;
}

export default createApp();
