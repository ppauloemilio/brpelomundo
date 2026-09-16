import 'dotenv/config';
import app from './app.js';

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`🚀 API Comunidade Brasil rodando em http://localhost:${PORT}`);
  console.log(`🗄️  Banco: Neon (Postgres)`);
  console.log(`👤 Demo: ana@demo.com / demo123`);
});
