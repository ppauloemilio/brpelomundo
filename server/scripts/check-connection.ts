import 'dotenv/config';
import { db } from '../src/db/sql.js';

const row = await db.get<{ version: string; now: string }>(
  'select version() as version, now()::text as now'
);
console.log('✅ Conectado:', row?.version?.split(',')[0]);
console.log('   Hora do servidor:', row?.now);
