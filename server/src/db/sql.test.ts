import { toPositional } from './sql.js';

const cases: Array<[string, string]> = [
  ['SELECT * FROM u WHERE a = ? AND b = ?', 'SELECT * FROM u WHERE a = $1 AND b = $2'],
  ["SELECT '?' , a FROM u WHERE b = ?", "SELECT '?' , a FROM u WHERE b = $1"],
  ["SELECT 'it''s ?' FROM u WHERE b = ?", "SELECT 'it''s ?' FROM u WHERE b = $1"],
  ['SELECT 1 -- ? comment\nWHERE a = ?', 'SELECT 1 -- ? comment\nWHERE a = $1'],
  ['SELECT /* ? */ a WHERE b = ?', 'SELECT /* ? */ a WHERE b = $1'],
  ['SELECT "col?" WHERE b = ?', 'SELECT "col?" WHERE b = $1'],
  [
    "WHERE TRIM(COALESCE(city, '')) = '' AND a = ?",
    "WHERE TRIM(COALESCE(city, '')) = '' AND a = $1",
  ],
  ["SELECT '%@demo.com' WHERE e LIKE ?", "SELECT '%@demo.com' WHERE e LIKE $1"],
];

let failures = 0;
for (const [input, expected] of cases) {
  const got = toPositional(input);
  if (got !== expected) {
    failures += 1;
    console.error('FAIL', JSON.stringify(input), '->', JSON.stringify(got));
  }
}
console.log(failures === 0 ? `ok: ${cases.length} casos` : `${failures} falha(s)`);
process.exit(failures === 0 ? 0 : 1);
