const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { requireAuth, requireTipo, assinarToken, TIPOS } = require("../middleware/auth");
const { enviarEmail, htmlSimples } = require("../services/email.service");

const router = express.Router();

// POST /api/auth/login
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) {
      return res.status(400).json({ erro: 'Informe "email" e "senha".' });
    }

    const conta = await prisma.contaGerencial.findUnique({ where: { email } });
    if (!conta) return res.status(401).json({ erro: "Credenciais inválidas." });

    const senhaOk = await bcrypt.compare(senha, conta.senhaHash);
    if (!senhaOk) return res.status(401).json({ erro: "Credenciais inválidas." });

    const token = assinarToken({
      tipo: TIPOS.ADMIN, id: conta.id, nome: conta.nome, email: conta.email, permissao: conta.permissao,
    });

    res.json({
      token,
      conta: { id: conta.id, nome: conta.nome, email: conta.email, cargo: conta.cargo, permissao: conta.permissao },
    });
  })
);

// POST /api/auth/esqueci-senha
// Gera um token de redefinição válido por 1 hora.
// Em produção isso deve ser ENVIADO POR E-MAIL (nodemailer + SMTP, SendGrid, Resend, etc.),
// nunca devolvido na resposta da API. Aqui, fora de produção, devolvemos o token/link
// direto na resposta só para dar pra testar o fluxo sem um serviço de e-mail configurado.
router.post(
  "/esqueci-senha",
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ erro: 'Informe o "email".' });
    }

    const mensagemPadrao = { ok: true, mensagem: "Se esse e-mail estiver cadastrado, enviamos um link de redefinição." };

    const conta = await prisma.contaGerencial.findUnique({ where: { email } });
    // Nunca revela se o e-mail existe ou não — resposta idêntica nos dois casos.
    if (!conta) return res.json(mensagemPadrao);

    const token = crypto.randomBytes(32).toString("hex");
    const expiraEm = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await prisma.passwordResetToken.create({
      data: { token, contaId: conta.id, expiraEm },
    });

    const origemPainel = process.env.PAINEL_URL || req.get("origin") || "https://routedelivery.vercel.app";
    const link = `${origemPainel.replace(/\/$/, "")}/redefinir-senha?token=${token}`;
    const resposta = { ...mensagemPadrao };
    // Link enviado por e-mail (Configurações › E-mail). Fora de produção, também volta na resposta para testes.
    await enviarEmail({
      para: conta.email,
      assunto: "Redefinir sua senha — Route Delivery",
      texto: `Olá, ${conta.nome}. Para criar uma nova senha do painel, abra: ${link} (vale por 1 hora).`,
      html: htmlSimples({ titulo: "Redefinir senha do painel", paragrafos: [`Olá, ${conta.nome}.`, `Para criar uma nova senha, <a href="${link}">clique aqui</a>. O link vale por 1 hora.`] }),
    }).catch(err => console.error("[esqueci-senha] e-mail não enviado:", err.message));
    if (process.env.NODE_ENV !== "production") {
      resposta.devToken = token;
      resposta.devLink = link;
      resposta.devAviso = "Este campo só aparece fora de produção.";
    }

    res.json(resposta);
  })
);

// POST /api/auth/redefinir-senha
router.post(
  "/redefinir-senha",
  asyncHandler(async (req, res) => {
    const { token, novaSenha } = req.body;
    if (!token || !novaSenha) {
      return res.status(400).json({ erro: 'Informe "token" e "novaSenha".' });
    }
    if (String(novaSenha).length < 8) {
      return res.status(400).json({ erro: "A nova senha precisa ter pelo menos 8 caracteres." });
    }

    const registro = await prisma.passwordResetToken.findUnique({ where: { token } });
    if (!registro || registro.usado || registro.expiraEm < new Date()) {
      return res.status(400).json({ erro: "Link de redefinição inválido ou expirado. Solicite um novo." });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    await prisma.$transaction([
      prisma.contaGerencial.update({ where: { id: registro.contaId }, data: { senhaHash } }),
      prisma.passwordResetToken.update({ where: { token }, data: { usado: true } }),
    ]);

    res.json({ ok: true, mensagem: "Senha redefinida com sucesso. Faça login com a nova senha." });
  })
);

// GET /api/auth/me — retorna os dados da conta autenticada (útil pro frontend validar o token salvo)
router.get(
  "/me",
  requireAuth,
  requireTipo(TIPOS.ADMIN),
  asyncHandler(async (req, res) => {
    const conta = await prisma.contaGerencial.findUnique({ where: { id: req.conta.id } });
    if (!conta) return res.status(404).json({ erro: "Conta não encontrada." });
    res.json({ id: conta.id, nome: conta.nome, email: conta.email, cargo: conta.cargo, permissao: conta.permissao });
  })
);

module.exports = router;
