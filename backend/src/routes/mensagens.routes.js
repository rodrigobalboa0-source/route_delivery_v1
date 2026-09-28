const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();

// GET /api/mensagens — lista as conversas com a última mensagem
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const conversas = await prisma.conversa.findMany({
      include: { mensagens: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    // Mais recentes primeiro.
    conversas.sort((a, b) => (b.mensagens[0]?.createdAt || 0) - (a.mensagens[0]?.createdAt || 0));
    res.json(conversas);
  })
);

// POST /api/mensagens  { nome, tipo: "CLIENTE" | "ENTREGADOR" } — inicia uma conversa
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { nome, tipo } = req.body;
    if (!nome || !["CLIENTE", "ENTREGADOR"].includes(tipo)) {
      return res.status(400).json({ erro: 'Informe "nome" e "tipo" (CLIENTE ou ENTREGADOR).' });
    }
    res.status(201).json(await prisma.conversa.create({ data: { nome, tipo }, include: { mensagens: true } }));
  })
);

// GET /api/mensagens/:conversaId — histórico completo de uma conversa
router.get(
  "/:conversaId",
  asyncHandler(async (req, res) => {
    const conversa = await prisma.conversa.findUnique({
      where: { id: req.params.conversaId },
      include: { mensagens: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversa) return res.status(404).json({ erro: "Conversa não encontrada." });
    if (conversa.naoLida) {
      await prisma.conversa.update({ where: { id: conversa.id }, data: { naoLida: false } });
    }
    res.json({ ...conversa, naoLida: false });
  })
);

// POST /api/mensagens/:conversaId  { texto }
router.post(
  "/:conversaId",
  asyncHandler(async (req, res) => {
    const { texto } = req.body;
    if (!texto || !texto.trim()) return res.status(400).json({ erro: 'Informe o "texto" da mensagem.' });

    const mensagem = await prisma.mensagem.create({
      data: { conversaId: req.params.conversaId, de: "NOS", texto },
    });
    await prisma.conversa.update({
      where: { id: req.params.conversaId },
      data: { naoLida: false },
    });
    res.status(201).json(mensagem);
  })
);

module.exports = router;
