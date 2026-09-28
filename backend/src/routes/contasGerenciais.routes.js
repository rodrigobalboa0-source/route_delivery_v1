const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");

// Contas de acesso ao painel ADM. Escrita liberada só para permissão TOTAL
// (garantido por requirePermissaoEscrita no server.js).
const router = express.Router();

const SELECT = { id: true, nome: true, cargo: true, email: true, permissao: true, createdAt: true };

router.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await prisma.contaGerencial.findMany({ select: SELECT, orderBy: { createdAt: "asc" } }));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const conta = await prisma.contaGerencial.findUnique({ where: { id: req.params.id }, select: SELECT });
    if (!conta) return res.status(404).json({ erro: "Conta não encontrada." });
    res.json(conta);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { nome, cargo, email, permissao, senha } = req.body;
    if (!nome || !email || !cargo || !permissao) {
      return res.status(400).json({ erro: 'Informe "nome", "email", "cargo" e "permissao".' });
    }
    if (!senha || String(senha).length < 8) {
      return res.status(400).json({ erro: "A senha precisa ter pelo menos 8 caracteres." });
    }
    const conta = await prisma.contaGerencial.create({
      data: { nome, cargo, email, permissao, senhaHash: await bcrypt.hash(senha, 10) },
      select: SELECT,
    });
    res.status(201).json(conta);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const { nome, cargo, email, permissao, senha } = req.body;
    if (req.params.id === req.conta.id && permissao && permissao !== "TOTAL") {
      return res.status(400).json({ erro: "Você não pode reduzir a sua própria permissão." });
    }
    const data = { nome, cargo, email, permissao };
    if (senha) {
      if (String(senha).length < 8) return res.status(400).json({ erro: "A senha precisa ter pelo menos 8 caracteres." });
      data.senhaHash = await bcrypt.hash(senha, 10);
    }
    const conta = await prisma.contaGerencial.update({ where: { id: req.params.id }, data, select: SELECT });
    res.json(conta);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (req.params.id === req.conta.id) {
      return res.status(400).json({ erro: "Você não pode excluir a sua própria conta." });
    }
    await prisma.contaGerencial.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

module.exports = router;
