// Painel › Promoção (campanhas para entregadores) — montado em /api/promocoes-entregador
const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { situacao, dadosDoBody, validarPeriodo, mudarAtiva } = require("../services/promocoes.service");

const router = express.Router();

// Quantos entregadores viram o aviso de ativação de cada promoção.
async function visualizacoes(ids) {
  if (!ids.length) return {};
  const eventos = await prisma.promocaoEvento.findMany({ where: { promocaoId: { in: ids }, tipo: "ATIVADA" }, select: { id: true, promocaoId: true } });
  const vistos = await prisma.promocaoAvisoVisto.findMany({ where: { avisoId: { in: eventos.map(e => e.id) } }, select: { avisoId: true, entregadorId: true } });
  const promoDoEvento = Object.fromEntries(eventos.map(e => [e.id, e.promocaoId]));
  const r = {};
  vistos.forEach(v => { (r[promoDoEvento[v.avisoId]] ||= new Set()).add(v.entregadorId); });
  return Object.fromEntries(Object.entries(r).map(([k, s]) => [k, s.size]));
}

function comSituacao(p, vis = {}) {
  return { ...p, situacao: situacao(p), visualizacoes: vis[p.id] || 0 };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const lista = await prisma.promocaoEntregador.findMany({ orderBy: [{ ativa: "desc" }, { createdAt: "desc" }] });
    const vis = await visualizacoes(lista.map(p => p.id));
    res.json(lista.map(p => comSituacao(p, vis)));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const p = await prisma.promocaoEntregador.findUnique({
      where: { id: req.params.id },
      include: { eventos: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    if (!p) return res.status(404).json({ erro: "Promoção não encontrada." });
    res.json(comSituacao(p, await visualizacoes([p.id])));
  })
);

// POST — cria (inativa, a menos que venha ativa: true — aí já gera o aviso de ativação)
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = dadosDoBody(req.body);
    validarPeriodo(data.inicio, data.fim);
    // Valida antes de criar, para não sobrar promoção criada quando a ativação é recusada.
    if (req.body.ativa && data.fim && data.fim <= new Date()) {
      return res.status(400).json({ erro: "O fim desta promoção já passou. Ajuste a data de fim antes de ativar." });
    }
    const criada = await prisma.promocaoEntregador.create({ data });
    const final = req.body.ativa ? await mudarAtiva(criada.id, true, req.conta?.nome) : criada;
    res.status(201).json(comSituacao(final));
  })
);

// PUT — edita o conteúdo (ativar/desativar tem rotas próprias, que geram o aviso no app)
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const atual = await prisma.promocaoEntregador.findUnique({ where: { id: req.params.id } });
    if (!atual) return res.status(404).json({ erro: "Promoção não encontrada." });
    const data = dadosDoBody(req.body, true);
    validarPeriodo(data.inicio !== undefined ? data.inicio : atual.inicio, data.fim !== undefined ? data.fim : atual.fim);
    const p = await prisma.promocaoEntregador.update({ where: { id: atual.id }, data });
    res.json(comSituacao(p, await visualizacoes([p.id])));
  })
);

router.patch(
  "/:id/ativar",
  asyncHandler(async (req, res) => {
    res.json(comSituacao(await mudarAtiva(req.params.id, true, req.conta?.nome)));
  })
);

router.patch(
  "/:id/desativar",
  asyncHandler(async (req, res) => {
    res.json(comSituacao(await mudarAtiva(req.params.id, false, req.conta?.nome)));
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const p = await prisma.promocaoEntregador.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ erro: "Promoção não encontrada." });
    // Desativar antes gera o aviso de encerramento no app; excluir direto sumiria sem aviso.
    if (p.ativa && situacao(p) !== "ENCERRADA") return res.status(409).json({ erro: "Desative a promoção antes de excluir, para os entregadores serem avisados." });
    await prisma.promocaoEntregador.delete({ where: { id: p.id } });
    res.status(204).send();
  })
);

module.exports = router;
