const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const notificacoes = await prisma.notificacao.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(notificacoes);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { tipo, texto } = req.body;
    if (!tipo || !texto) return res.status(400).json({ erro: 'Informe "tipo" e "texto".' });
    const notificacao = await prisma.notificacao.create({ data: { tipo, texto } });
    res.status(201).json(notificacao);
  })
);

// PATCH /api/notificacoes/lidas — marca todas como lidas
router.patch(
  "/lidas",
  asyncHandler(async (req, res) => {
    const { count } = await prisma.notificacao.updateMany({ where: { lida: false }, data: { lida: true } });
    res.json({ atualizadas: count });
  })
);

router.patch(
  "/:id/lida",
  asyncHandler(async (req, res) => {
    const notificacao = await prisma.notificacao.update({
      where: { id: req.params.id },
      data: { lida: true },
    });
    res.json(notificacao);
  })
);

module.exports = router;
