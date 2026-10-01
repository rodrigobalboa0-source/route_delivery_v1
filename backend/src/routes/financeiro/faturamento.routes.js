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
    const [pendentes, faturadas, comercios, finalizadas] = await Promise.all([
      naoFaturadas({ desde, ate }),
      prisma.pedido.groupBy({ by: ["comercioId"], where: { status: "ENTREGUE", faturaId: { not: null }, entregueEm: { gte: desde, lte: ate } }, _count: { _all: true } }),
      prisma.comercio.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true, documento: true, bloqueado: true, metodoPagamento: true } }),
      // Todas as entregas finalizadas no período (faturadas ou não).
      prisma.pedido.aggregate({ where: { status: "ENTREGUE", entregueEm: { gte: desde, lte: ate } }, _count: { _all: true }, _sum: { valor: true } }),
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
    res.json({
      desde, ate, linhas,
      totais: {
        comercios: linhas.length, entregas: pendentes.length, valor: r2(linhas.reduce((s, l) => s + l.valor, 0)),
        finalizadas: finalizadas._count._all, valorFinalizadas: r2(finalizadas._sum.valor || 0),
      },
    });
  })
);

// GET /faturamento/relatorio?desde&ate&comercioId&situacao=todas|a_faturar|faturadas
// Relatório das entregas finalizadas no período, uma linha por entrega (tela e downloads Excel/PDF).
router.get(
  "/faturamento/relatorio",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodoObrigatorio(req.query);
    const where = { status: "ENTREGUE", entregueEm: { gte: desde, lte: ate } };
    if (req.query.comercioId) where.comercioId = String(req.query.comercioId);
    if (req.query.situacao === "a_faturar") where.faturaId = null;
    if (req.query.situacao === "faturadas") where.faturaId = { not: null };
    const pedidos = await prisma.pedido.findMany({
      where, orderBy: { entregueEm: "asc" }, take: 10000,
      select: {
        id: true, codigo: true, codigoExterno: true, entregueEm: true, clienteNome: true, endereco: true, distanciaKm: true,
        valor: true, retorno: true, origem: true,
        comercio: { select: { nomeFantasia: true } },
        entregador: { select: { nomeCompleto: true } },
        fatura: { select: { numero: true, paga: true } },
      },
    });
    const linhas = pedidos.map(p => ({
      id: p.id, codigo: p.codigo, codigoExterno: p.codigoExterno, entregueEm: p.entregueEm,
      comercio: p.comercio?.nomeFantasia || "—", cliente: p.clienteNome, endereco: p.endereco,
      km: p.distanciaKm != null ? Number(p.distanciaKm.toFixed(2)) : null, valor: p.valor != null ? r2(p.valor) : null,
      retorno: p.retorno, entregador: p.entregador?.nomeCompleto || "—",
      fatura: p.fatura ? { numero: p.fatura.numero, paga: p.fatura.paga } : null,
    }));
    const soma = f => r2(linhas.reduce((s, l) => s + (f(l) || 0), 0));
    res.json({
      desde, ate, linhas, limite: pedidos.length === 10000,
      totais: {
        entregas: linhas.length, valor: soma(l => l.valor), km: soma(l => l.km),
        faturadas: linhas.filter(l => l.fatura).length, aFaturar: linhas.filter(l => !l.fatura).length,
        comercios: new Set(linhas.map(l => l.comercio)).size,
      },
    });
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
