import nodemailer from 'nodemailer';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'noreply@comunidadebr.app';

function getTransport() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendPasswordInviteEmail(email: string, token: string, fullName: string) {
  const setupUrl = `${APP_URL}/setup-password?token=${encodeURIComponent(token)}`;
  const subject = 'Comunidade Brasil — Defina sua senha de administrador';
  const text = `Olá ${fullName},

Você foi configurado como administrador da Comunidade Brasil.

Clique no link abaixo para escolher sua senha (válido por 7 dias):

${setupUrl}

Se você não solicitou este acesso, ignore este e-mail.

Equipe Comunidade Brasil`;

  const html = `
    <p>Olá <strong>${fullName}</strong>,</p>
    <p>Você foi configurado como <strong>administrador</strong> da Comunidade Brasil.</p>
    <p><a href="${setupUrl}" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Escolher minha senha</a></p>
    <p style="color:#64748b;font-size:14px">Ou copie este link: ${setupUrl}</p>
    <p style="color:#64748b;font-size:14px">O link expira em 7 dias.</p>
  `;

  const transport = getTransport();
  if (!transport) {
    console.log('\n📧 [E-mail não configurado] Convite de senha para admin:');
    console.log(`   Para: ${email}`);
    console.log(`   Link: ${setupUrl}\n`);
    return { sent: false, setupUrl };
  }

  await transport.sendMail({
    from: SMTP_FROM,
    to: email,
    subject,
    text,
    html,
  });

  console.log(`📧 Convite de senha enviado para ${email}`);
  return { sent: true, setupUrl };
}
