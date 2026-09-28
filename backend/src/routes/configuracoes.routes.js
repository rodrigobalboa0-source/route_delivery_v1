const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { omitir } = require("../utils/sanitizar");
const { obterRegras, salvarRegras } = require("../services/saque.service");

const router = express.Router();

async function obterOuCriarConfiguracao() {
  const existente = await prisma.configuracao.findFirst();
  if (existente) return existente;
  return prisma.configuracao.create({ data: {} });
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const config = await obterOuCriarConfiguracao();
    res.json(config);
  })
);

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const config = await obterOuCriarConfiguracao();
    const atualizado = await prisma.configuracao.update({
      where: { id: config.id },
      data: omitir(req.body, ["id"]),
    });
    res.json(atualizado);
  })
);

// GET /api/configuracoes/saque — regras de saque normal e rápido
router.get(
  "/saque",
  asyncHandler(async (req, res) => {
    res.json(await obterRegras());
  })
);

// PUT /api/configuracoes/saque  { NORMAL: {...}, RAPIDO: {...} }
router.put(
  "/saque",
  asyncHandler(async (req, res) => {
    res.json(await salvarRegras(req.body));
  })
);

module.exports = router;
