// Financeiro › Faturamento — gera a cobrança dos comércios a partir das entregas não faturadas.
const express = require("express");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { erro400, periodoObrigatorio, dataBR } = require("../../utils/periodo");
const { r2 } = require("../../services/financeiro.service");

const router = express.Router();

// Entregas concluídas no período ainda não faturadas.
function naoFaturadas({ desde, ate, comercioId }) {
  return prisma.pedido.findMany({
    where: { status: "ENTREGUE", faturaId: null, entregueEm: { gte: desde, lte: ate }, ...(comercioId ? { comercioId } : {}) },
    select: { id: true, comercioId: true, valor: true },
  });
}

// GET /faturamento/previa?desde&ate — por comércio: entregas e valor a faturar
router.get(
  "/faturamento/previa",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodoObrigatorio(req.query);
    const [pendentes, faturadas, comercios] = await Promise.all([
      naoFaturadas({ desde, ate }),
      prisma.pedido.groupBy({ by: ["comercioId"], where: { status: "ENTREGUE", faturaId: { not: null }, entregueEm: { gte: desde, lte: ate } }, _count: { _all: true } }),
      prisma.comercio.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true, documento: true, bloqueado: true, metodoPagamento: true } }),
    ]);
    const nome = Object.fromEntries(comercios.map(c => [c.id, c]));
    const ja = Object.fromEntries(faturadas.map(f => [f.comercioId, f._count._all]));
    const grupos = {};
    pendentes.forEach(p => {
      const g = grupos[p.comercioId] ||= { comercioId: p.comercioId, entregas: 0, valor: 0, semValor: 0 };
      g.entregas++;
      g.valor += p.valor || 0;
      if (p.valor == null) g.semValor++;
    });
    const linhas = Object.values(grupos).map(g => ({
      ...g, valor: r2(g.valor), nome: nome[g.comercioId]?.nomeFantasia || "—", razaoSocial: nome[g.comercioId]?.razaoSocial,
      metodoPagamento: nome[g.comercioId]?.metodoPagamento, jaFaturadas: ja[g.comercioId] || 0,
    })).sort((a, b) => b.valor - a.valor);
    res.json({ desde, ate, linhas, totais: { comercios: linhas.length, entregas: pendentes.length, valor: r2(linhas.reduce((s, l) => s + l.valor, 0)) } });
  })
);

// POST /faturamento { desde, ate, comercioIds: [...], vencimento } — uma fatura por comércio
router.post(
  "/faturamento",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodoObrigatorio(req.body);
    const ids = Array.isArray(req.body.comercioIds) ? req.body.comercioIds : [];
    if (!ids.length) throw erro400("Escolha ao menos um comércio.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.vencimento || "")) throw erro400("Informe o vencimento das faturas.");
    const vencimento = new Date(`${req.body.vencimento}T12:00:00`);

    const criadas = [];
    for (const comercioId of ids) {
      const pedidos = await naoFaturadas({ desde, ate, comercioId });
      if (!pedidos.length) continue;
      const valor = r2(pedidos.reduce((s, p) => s + (p.valor || 0), 0));
      const fatura = await prisma.$transaction(async tx => {
        const f = await tx.fatura.create({
          data: {
            comercioId, vencimento, valor, periodoInicio: desde, periodoFim: ate,
            descricao: `Entregas de ${dataBR(desde)} a ${dataBR(ate)} (${pedidos.length} entrega${pedidos.length > 1 ? "s" : ""})`,
          },
        });
        const { count } = await tx.pedido.updateMany({ where: { id: { in: pedidos.map(p => p.id) }, faturaId: null }, data: { faturaId: f.id } });
        if (count !== pedidos.length) {
          const err = new Error("Algumas entregas acabaram de ser faturadas por outra pessoa. Atualize a prévia.");
          err.status = 409;
          throw err;
        }
        return f;
      }, { timeout: 30000 });
      criadas.push(fatura);
    }
    if (!criadas.length) throw erro400("Nenhuma entrega a faturar para os comércios escolhidos neste período.");
    res.status(201).json({ faturas: criadas, quantidade: criadas.length, valor: r2(criadas.reduce((s, f) => s + f.valor, 0)) });
  })
);

module.exports = router;
