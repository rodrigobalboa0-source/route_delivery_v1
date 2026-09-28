const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { omitir, normalizar } = require("../utils/sanitizar");

const router = express.Router();

function periodo(req) {
  const ate = req.query.ate ? new Date(req.query.ate) : new Date();
  let desde;
  if (req.query.desde) {
    desde = new Date(req.query.desde);
  } else {
    desde = new Date();
    desde.setDate(1);
    desde.setHours(0, 0, 0, 0);
  }
  return { desde, ate };
}

// GET /api/financeiro/resumo
router.get(
  "/resumo",
  asyncHandler(async (req, res) => {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const agora = new Date();

    const [doMes, emAberto, atrasadas] = await Promise.all([
      prisma.pedido.aggregate({
        where: { status: "ENTREGUE", createdAt: { gte: inicioMes } },
        _sum: { valor: true }, _count: { _all: true },
      }),
      prisma.fatura.aggregate({ where: { paga: false, vencimento: { gte: agora } }, _sum: { valor: true } }),
      prisma.fatura.aggregate({ where: { paga: false, vencimento: { lt: agora } }, _sum: { valor: true }, _count: { _all: true } }),
    ]);

    const receitaDoMes = doMes._sum.valor || 0;
    res.json({
      receitaDoMes: Number(receitaDoMes.toFixed(2)),
      entregasDoMes: doMes._count._all,
      ticketMedio: doMes._count._all ? Number((receitaDoMes / doMes._count._all).toFixed(2)) : 0,
      aReceber: Number((emAberto._sum.valor || 0).toFixed(2)),
      valorEmAtraso: Number((atrasadas._sum.valor || 0).toFixed(2)),
      faturasEmAtraso: atrasadas._count._all,
    });
  })
);

// GET /api/financeiro/receita-mensal — série para o gráfico de receita (últimos 12 meses)
router.get(
  "/receita-mensal",
  asyncHandler(async (req, res) => {
    const inicio = new Date();
    inicio.setMonth(inicio.getMonth() - 11, 1);
    inicio.setHours(0, 0, 0, 0);

    const pedidos = await prisma.pedido.findMany({
      where: { status: "ENTREGUE", createdAt: { gte: inicio } },
      select: { valor: true, createdAt: true },
    });

    const chave = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const porMes = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(inicio);
      d.setMonth(inicio.getMonth() + i);
      porMes[chave(d)] = 0;
    }
    pedidos.forEach(p => {
      const k = chave(p.createdAt);
      if (k in porMes) porMes[k] += p.valor || 0;
    });

    res.json(Object.entries(porMes).map(([mes, valor]) => ({ mes, valor: Number(valor.toFixed(2)) })));
  })
);

// GET /api/financeiro/repasses?desde=..&ate=.. — quanto cada entregador entregou no período
router.get(
  "/repasses",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req);
    const grupos = await prisma.pedido.groupBy({
      by: ["entregadorId"],
      where: { status: "ENTREGUE", entregadorId: { not: null }, updatedAt: { gte: desde, lte: ate } },
      _count: { _all: true },
      _sum: { valor: true, distanciaKm: true },
    });
    const entregadores = await prisma.entregador.findMany({
      where: { id: { in: grupos.map(g => g.entregadorId) } },
      select: { id: true, nomeCompleto: true, tipoEntrega: true, taxaEntrega: true },
    });
    const porId = Object.fromEntries(entregadores.map(e => [e.id, e]));

    const linhas = grupos.map(g => {
      const e = porId[g.entregadorId] || {};
      const entregas = g._count._all;
      return {
        entregadorId: g.entregadorId,
        nomeCompleto: e.nomeCompleto || "—",
        tipoEntrega: e.tipoEntrega,
        entregas,
        valorEntregas: Number((g._sum.valor || 0).toFixed(2)),
        distanciaKm: Number((g._sum.distanciaKm || 0).toFixed(1)),
        // Repasse estimado: taxa fixa por entrega cadastrada no entregador (quando houver).
        repasseEstimado: e.taxaEntrega != null ? Number((e.taxaEntrega * entregas).toFixed(2)) : null,
      };
    }).sort((a, b) => b.entregas - a.entregas);

    res.json({ desde, ate, linhas });
  })
);

// ---- Faturas ----

// GET /api/financeiro/faturas?situacao=aberta|paga|atrasada&comercioId=..
router.get(
  "/faturas",
  asyncHandler(async (req, res) => {
    const { situacao, comercioId } = req.query;
    const where = {};
    if (comercioId) where.comercioId = comercioId;
    if (situacao === "paga") where.paga = true;
    if (situacao === "aberta") Object.assign(where, { paga: false, vencimento: { gte: new Date() } });
    if (situacao === "atrasada") Object.assign(where, { paga: false, vencimento: { lt: new Date() } });

    const faturas = await prisma.fatura.findMany({
      where,
      include: { comercio: { select: { id: true, nomeFantasia: true } }, _count: { select: { pedidos: true } } },
      orderBy: [{ paga: "asc" }, { vencimento: "asc" }],
    });
    res.json(faturas);
  })
);

// Campos editáveis (número, pedidos e período vêm do faturamento).
function dadosFatura(body) {
  const d = normalizar(omitir(body, ["id", "numero", "comercio", "createdAt", "pagaEm", "paga", "pedidos", "_count", "periodoInicio", "periodoFim", "formaPagamento"]), { numeros: ["valor"] });
  if (d.vencimento) d.vencimento = new Date(`${String(d.vencimento).slice(0, 10)}T12:00:00`);
  return d;
}

router.post(
  "/faturas",
  asyncHandler(async (req, res) => {
    const data = dadosFatura(req.body);
    if (!data.descricao || !data.vencimento || data.valor == null) {
      return res.status(400).json({ erro: 'Informe "descricao", "vencimento" e "valor".' });
    }
    res.status(201).json(await prisma.fatura.create({ data }));
  })
);

router.put(
  "/faturas/:id",
  asyncHandler(async (req, res) => {
    res.json(await prisma.fatura.update({ where: { id: req.params.id }, data: dadosFatura(req.body) }));
  })
);

// PATCH /faturas/:id/pagar { formaPagamento?, pagaEm? (AAAA-MM-DD) } — registra o recebimento
router.patch(
  "/faturas/:id/pagar",
  asyncHandler(async (req, res) => {
    const pagaEm = req.body?.pagaEm ? new Date(`${req.body.pagaEm}T12:00:00`) : new Date();
    res.json(await prisma.fatura.update({ where: { id: req.params.id }, data: { paga: true, pagaEm, formaPagamento: req.body?.formaPagamento || null } }));
  })
);

router.patch(
  "/faturas/:id/reabrir",
  asyncHandler(async (req, res) => {
    res.json(await prisma.fatura.update({ where: { id: req.params.id }, data: { paga: false, pagaEm: null, formaPagamento: null } }));
  })
);

// DELETE — só não paga; as entregas vinculadas voltam a ficar "a faturar"
router.delete(
  "/faturas/:id",
  asyncHandler(async (req, res) => {
    const f = await prisma.fatura.findUnique({ where: { id: req.params.id } });
    if (!f) return res.status(404).json({ erro: "Fatura não encontrada." });
    if (f.paga) return res.status(409).json({ erro: "Fatura já recebida. Reabra antes de excluir." });
    await prisma.fatura.delete({ where: { id: f.id } });
    res.status(204).send();
  })
);

// ---- Submódulos do Financeiro ----
router.use(require("./financeiro/acertos.routes"));
router.use(require("./financeiro/contasPagar.routes"));
router.use(require("./financeiro/faturamento.routes"));
router.use(require("./financeiro/creditos.routes"));
router.use(require("./financeiro/comissoesManuais.routes"));
router.use(require("./financeiro/documentos.routes"));

module.exports = router;
