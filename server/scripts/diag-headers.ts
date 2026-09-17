const base = (process.argv[2] ?? 'https://brpelomundo.vercel.app').replace(/\/$/, '');

for (const path of ['/api/health', '/api/auth/login']) {
  const res = await fetch(`${base}${path}`);
  console.log(`=== ${path} -> ${res.status} ===`);
  for (const [k, v] of [...res.headers].sort()) console.log(`  ${k}: ${v}`);
  console.log('');
}
