// Painel › Roteirização manual — montada em /api/rotas
//   POST   /api/rotas           { pedidoIds: [...] }  -> monta uma rota com pedidos prontos e oferece aos entregadores
//   GET    /api/rotas/:id                             -> rota com as entregas na ordem
//   DELETE /api/rotas/:id                             -> desfaz (só antes de um entregador aceitar)
const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const rotas = require("../services/rotas.service");

const router = express.Router();
const autor = req => `${req.conta?.nome || "Equipe"} (ADM)`;

router.post(
  "/",
  asyncHandler(async (req, res) => {
    res.status(201).json(await rotas.criarRotaManual(req.body?.pedidoIds, autor(req)));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const r = await prisma.rota.findUnique({
      where: { id: req.params.id },
      include: { pedidos: { orderBy: { ordemRota: "asc" }, select: { id: true, codigo: true, ordemRota: true, status: true, clienteNome: true, endereco: true, comercio: { select: { nomeFantasia: true } } } } },
    });
    if (!r) return res.status(404).json({ erro: "Rota não encontrada." });
    res.json(r);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await rotas.desfazerRota(req.params.id, autor(req)));
  })
);

module.exports = router;
