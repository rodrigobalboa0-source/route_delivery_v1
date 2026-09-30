// Envio de e-mail (recuperação de senha do app do entregador e do painel ADM).
// Configurado em Configurações › E-mail: SMTP (ex.: Gmail com "senha de app") ou Resend (chave de API).
// Também aceita variáveis de ambiente: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, RESEND_API_KEY, EMAIL_REMETENTE.
const nodemailer = require("nodemailer");
const prisma = require("../lib/prisma");
const { decifrar } = require("../integracoes/cripto");

const segredo = v => {
  if (!v) return null;
  try { return decifrar(v).valor || null; } catch { return null; }
};

async function configuracaoEmail() {
  const c = (await prisma.configuracao.findFirst()) || {};
  const provedor = c.emailProvedor || (process.env.RESEND_API_KEY ? "RESEND" : process.env.SMTP_HOST ? "SMTP" : null);
  return {
    provedor,
    remetente: c.emailRemetente || process.env.EMAIL_REMETENTE || c.smtpUsuario || process.env.SMTP_USER || null,
    smtp: {
      host: c.smtpHost || process.env.SMTP_HOST || null,
      porta: c.smtpPorta || Number(process.env.SMTP_PORT) || 465,
      usuario: c.smtpUsuario || process.env.SMTP_USER || null,
      senha: segredo(c.smtpSenha) || process.env.SMTP_PASS || null,
    },
    resendChave: segredo(c.resendChave) || process.env.RESEND_API_KEY || null,
  };
}

async function emailConfigurado() {
  const c = await configuracaoEmail();
  if (c.provedor === "RESEND") return !!(c.resendChave && c.remetente);
  if (c.provedor === "SMTP") return !!(c.smtp.host && c.smtp.usuario && c.smtp.senha);
  return false;
}

// Envia { para, assunto, texto, html }. Lança erro com mensagem clara se não estiver configurado ou falhar.
async function enviarEmail({ para, assunto, texto, html }) {
  const c = await configuracaoEmail();
  const de = c.remetente ? `Route Delivery <${c.remetente}>` : undefined;
  if (c.provedor === "RESEND") {
    if (!c.resendChave || !c.remetente) throw new Error("E-mail não configurado (falta a chave do Resend ou o remetente).");
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${c.resendChave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: de, to: [para], subject: assunto, text: texto, html }),
    });
    if (!resp.ok) {
      const d = await resp.json().catch(() => ({}));
      throw new Error(`Resend recusou o envio: ${d.message || resp.status}`);
    }
    return true;
  }
  if (c.provedor === "SMTP") {
    const { host, porta, usuario, senha } = c.smtp;
    if (!host || !usuario || !senha) throw new Error("E-mail não configurado (faltam servidor, usuário ou senha do SMTP).");
    const transporte = nodemailer.createTransport({
      host, port: porta, secure: Number(porta) === 465, auth: { user: usuario, pass: senha },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    await transporte.sendMail({ from: de || usuario, to: para, subject: assunto, text: texto, html });
    return true;
  }
  throw new Error("O envio de e-mail ainda não foi configurado. Fale com a equipe.");
}

// Modelo simples com a marca, usado nos e-mails de código/link.
function htmlSimples({ titulo, paragrafos = [], destaque }) {
  const p = paragrafos.map(t => `<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.5">${t}</p>`).join("");
  const d = destaque ? `<div style="margin:18px 0;padding:14px 18px;background:#0b1628;color:#fff;border-radius:10px;font-size:28px;font-weight:700;letter-spacing:6px;text-align:center">${destaque}</div>` : "";
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0b1628;margin:0 0 16px">${titulo}</h2>${p}${d}
    <p style="margin:18px 0 0;color:#94a3b8;font-size:12px">Route Delivery · se você não pediu isso, ignore este e-mail.</p></div>`;
}

module.exports = { enviarEmail, emailConfigurado, configuracaoEmail, htmlSimples };
