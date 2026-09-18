import { db } from './sql.js';

/** Colunas novas em bancos já existentes; idempotente para rodar a cada cold start. */
export async function migrateSchema() {
  await db.exec(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from TEXT;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;
  `);
}
