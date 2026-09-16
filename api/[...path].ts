/**
 * Ponto de entrada serverless da Vercel. O nome `[...path]` faz a Vercel
 * encaminhar qualquer `/api/**` para cá preservando a URL original, que é o
 * que o app Express espera para casar as rotas montadas em `/api/...`.
 *
 * Importa o JS já compilado (`npm run build -w server`) para não depender de
 * como o bundler da Vercel resolve TypeScript fora do diretório `api/`.
 */
import app from '../server/dist/app.js';

export default app;
