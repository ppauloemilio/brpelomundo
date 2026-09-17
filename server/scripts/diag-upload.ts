const base = (process.argv[2] ?? 'https://brpelomundo.vercel.app').replace(/\/$/, '');

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ana@demo.com', password: 'demo123' }),
});
const { token } = await login.json();

// PNG 1x1 válido, menor arquivo possível para isolar o caminho do upload.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wFhWwUnAAAAAElFTkSuQmCC',
  'base64'
);

const form = new FormData();
form.append('file', new Blob([png], { type: 'image/png' }), 'teste.png');

const res = await fetch(`${base}/api/upload`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});

console.log(`POST /api/upload -> ${res.status} ${res.headers.get('x-vercel-error') ?? ''}`);
console.log(`content-type: ${res.headers.get('content-type')}`);
console.log((await res.text()).slice(0, 800));
