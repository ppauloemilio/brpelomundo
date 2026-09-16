import 'dotenv/config';
import { v4 as uuid } from 'uuid';
import { db } from './sql.js';
import { SCHEMA, UTC_NOW_FUNCTION } from './schema.js';
import { seedDatabase } from './seed.js';
import { seedAppSettings } from '../lib/settings.js';
import { seedMonetizationExamples } from '../lib/seedMonetizationExamples.js';
import { seedLocalValidation, seedTrustFeatures } from '../lib/seedLocalValidation.js';
import { seedBillingPlans } from '../lib/billing.js';
import { ensureAdminUser } from '../lib/adminUser.js';

export async function createSchema() {
  await db.exec(UTC_NOW_FUNCTION);
  await db.exec(SCHEMA);
}

/** Ajustes nos dados demo — depende do seed principal ter rodado. */
async function patchDemoData() {
  const cities: Array<[string, string, string]> = [
    ['ana_silva', 'New York', 'US'],
    ['carlos_mendes', 'New York', 'US'],
    ['julia_costa', 'São Paulo', 'BR'],
    ['pedro_lima', 'Lisboa', 'PT'],
    ['beatriz_paes', 'Berlin', 'DE'],
  ];
  for (const [username, city, country] of cities) {
    await db.run(
      `UPDATE public_profiles SET current_city = ?, current_country = ?
       WHERE user_id = (SELECT id FROM users WHERE username = ?)`,
      [city, country, username]
    );
  }

  await db.run(
    `UPDATE public_profiles SET origin_city = ?
     WHERE user_id = (SELECT id FROM users WHERE username = 'ana_silva')`,
    ['Salvador, Bahia']
  );

  await db.run(
    `UPDATE public_profiles SET onboarding_completed = 1
     WHERE onboarding_completed = 0 AND TRIM(COALESCE(current_city, '')) != ''`
  );

  const ana = await db.get<{ id: string }>(`SELECT id FROM users WHERE username = 'ana_silva'`);
  if (ana) {
    const hasSkill = await db.get('SELECT id FROM user_skills WHERE user_id = ? LIMIT 1', [ana.id]);
    if (!hasSkill) {
      await db.run(
        `INSERT INTO user_skills (id, user_id, skill_name, proficiency_level, years_experience)
         VALUES (?, ?, ?, ?, ?)`,
        [uuid(), ana.id, 'Gastronomia', 'advanced', 5]
      );
    }
  }

  await db.run(
    `UPDATE users SET email_verified = 1
     WHERE email LIKE '%@demo.com' OR email LIKE '%@comunidade.br'`
  );
  await db.run(`UPDATE users SET is_verified = 1 WHERE username = 'ana_silva'`);
  await db.run(`UPDATE businesses SET is_verified = 1 WHERE name = 'Sabor do Brasil'`);
}

export async function setupDatabase() {
  await createSchema();
  await seedDatabase();
  await seedAppSettings();
  await seedMonetizationExamples();
  await seedLocalValidation();
  await seedTrustFeatures();
  await seedBillingPlans();
  await patchDemoData();
  await ensureAdminUser();
}

const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('db/setup.ts');
if (isDirectRun) {
  setupDatabase()
    .then(() => {
      console.log('✅ Banco Neon pronto');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Falha no setup do banco:', err);
      process.exit(1);
    });
}
