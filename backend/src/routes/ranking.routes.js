// Ranking semanal (painel ADM): classificação da semana atual e semanas já fechadas (com os prêmios lançados).
const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { semanaDe, configRanking, classificacao, fecharSemanaAnterior } = require("../services/ranking.service");

const router = express.Router();

// GET /api/ranking — semana atual (todos os classificados) + últimas 12 semanas fechadas
router.get(
  "/",
  asyncHandler(async (req, res) => {
    await fecharSemanaAnterior().catch(() => {});
    const cfg = await configRanking();
    const semana = semanaDe();
    const [lista, fechadas] = await Promise.all([
      classificacao(semana, cfg),
      prisma.rankingSemana.findMany({ orderBy: { inicio: "desc" }, take: 12 }),
    ]);
    res.json({
      config: cfg,
      atual: { inicio: semana.inicio, fim: new Date(semana.fim.getTime() - 1000), lista },
      fechadas: fechadas.map(s => ({ ...s, fim: new Date(s.fim.getTime() - 1000) })),
    });
  })
);

module.exports = router;
