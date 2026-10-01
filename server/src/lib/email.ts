import nodemailer from 'nodemailer';

/** Sem a barra final, senão os links saem com `//` e a rota não casa no SPA. */
const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[char];
  });
}

export async function sendVerificationEmail(email: string, token: string, fullName: string) {
  const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const safeName = escapeHtml(fullName);
  const subject = 'BR Pelo Mundo — Confirme seu e-mail';
  const text = `Olá ${fullName},

Confirme seu e-mail para liberar o login no BR Pelo Mundo.

O link vale por 48 horas:

${verifyUrl}

Se você não criou esta conta, ignore este e-mail.

Equipe BR Pelo Mundo`;

  const html = `
    <p>Olá <strong>${safeName}</strong>,</p>
    <p>Confirme seu e-mail para liberar o login no <strong>BR Pelo Mundo</strong>.</p>
    <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#006847;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Confirmar e-mail</a></p>
    <p style="color:#64748b;font-size:14px">Ou copie este link: ${verifyUrl}</p>
    <p style="color:#64748b;font-size:14px">O link expira em 48 horas. Se você não criou esta conta, ignore este e-mail.</p>
  `;

  const transport = getTransport();
  if (!transport) {
    console.log('\n📧 [E-mail não configurado] Confirmação de cadastro:');
    console.log(`   Para: ${email}`);
    console.log(`   Link: ${verifyUrl}\n`);
    return { sent: false, verifyUrl };
  }

  await transport.sendMail({
    from: SMTP_FROM,
    to: email,
    subject,
    text,
    html,
  });

  console.log(`📧 Confirmação de e-mail enviada para ${email}`);
  return { sent: true, verifyUrl };
}
