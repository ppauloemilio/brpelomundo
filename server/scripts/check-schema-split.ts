/**
 * Confere que o schema é fatiado em statements válidos antes de tocar o banco
 * (os corpos de função usam dollar-quoting, que o splitter precisa respeitar).
 */
import { splitStatements } from '../src/db/sql.js';
import { SCHEMA, UTC_NOW_FUNCTION } from '../src/db/schema.js';

const functions = splitStatements(UTC_NOW_FUNCTION);
const statements = splitStatements(SCHEMA);

console.log(`Funções: ${functions.length}`);
for (const fn of functions) console.log('  -', fn.split('\n')[0].trim());

const tables = statements.filter((s) => s.startsWith('CREATE TABLE'));
const indexes = statements.filter((s) => s.startsWith('CREATE INDEX'));
console.log(`Statements: ${statements.length} (${tables.length} tabelas, ${indexes.length} índices)`);

const unexpected = statements.filter(
  (s) => !s.startsWith('CREATE TABLE') && !s.startsWith('CREATE INDEX')
);
if (unexpected.length) {
  console.error('Statements inesperados:');
  for (const s of unexpected) console.error('  -', s.slice(0, 120));
  process.exit(1);
}

const truncatedFn = functions.find((f) => !f.includes('$fn$') || f.split('$fn$').length !== 3);
if (truncatedFn) {
  console.error('Corpo de função fatiado incorretamente:', truncatedFn);
  process.exit(1);
}

console.log('✅ Split do schema OK');
