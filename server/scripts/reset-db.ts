/**
 * Apaga e recria o schema public. Destrutivo — exige confirmação explícita:
 *
 *   npx tsx scripts/reset-db.ts --yes
 */
import 'dotenv/config';
import { db } from '../src/db/sql.js';
import { setupDatabase } from '../src/db/setup.js';

if (!process.argv.includes('--yes')) {
  console.error('Isto apaga TODOS os dados. Repita com --yes para confirmar.');
  process.exit(1);
}

const host = new URL(process.env.DATABASE_URL!).host;
console.log(`Resetando ${host}...`);

await db.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
console.log('Schema public recriado.');

await setupDatabase();
