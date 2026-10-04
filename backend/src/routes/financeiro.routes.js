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

// GET /api/financeiro/dashboard?desde=AAAA-MM-DD&ate=AAAA-MM-DD — visão geral da operação no período:
// faturamento das entregas finalizadas, custo com entregadores (ganho por entrega + comissões), margem,
// entregas e cancelamentos, série por dia (ou por mês em períodos longos), principais comércios e entregadores,
// e o caixa de agora (a receber, a pagar, saques pendentes e crédito das lojas).
router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const { entregasDoPeriodo, comissaoDoPedido, r2 } = require("../services/financeiro.service");
    const dia = (t, fim) => (/^\d{4}-\d{2}-\d{2}$/.test(t || "") ? new Date(`${t}T${fim ? "23:59:59.999" : "00:00:00"}-03:00`) : null);
    const ate = dia(req.query.ate, true) || new Date();
    const desde = dia(req.query.desde) || new Date(ate.getTime() - 29 * 864e5);
    if (desde > ate) return res.status(400).json({ erro: "A data de início é depois da data de fim." });
    const agora = new Date();

    const [entregas, canceladas, comissoes, faturasAbertas, faturasAtrasadas, contasPagar, saquesPendentes, saquesPeriodo, creditos] = await Promise.all([
      entregasDoPeriodo({ desde, ate }),
      prisma.pedido.count({ where: { status: "CANCELADO", canceladoEm: { gte: desde, lte: ate } } }),
      prisma.comissaoManual.aggregate({ where: { referencia: { gte: desde, lte: ate } }, _sum: { valor: true } }),
      prisma.fatura.aggregate({ where: { paga: false, vencimento: { gte: agora } }, _sum: { valor: true }, _count: { _all: true } }),
      prisma.fatura.aggregate({ where: { paga: false, vencimento: { lt: agora } }, _sum: { valor: true }, _count: { _all: true } }),
      prisma.contaPagar.aggregate({ where: { paga: false }, _sum: { valor: true }, _count: { _all: true } }),
      prisma.saqueEntregador.findMany({ where: { status: "PENDENTE" }, select: { valor: true, valorTaxa: true } }),
      prisma.saqueEntregador.findMany({ where: { status: { not: "RECUSADO" }, createdAt: { gte: desde, lte: ate } }, select: { valor: true, valorTaxa: true, status: true } }),
      prisma.creditoMovimento.groupBy({ by: ["tipo"], _sum: { valor: true } }),
    ]);

    // Série: por dia (Brasília); acima de 62 dias, por mês.
    const porMes = ate - desde > 62 * 864e5;
    const chave = d => {
      const iso = new Date(d).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      return porMes ? iso.slice(0, 7) : iso;
    };
    const serie = new Map();
    for (let t = new Date(desde); t <= ate; t = new Date(t.getTime() + (porMes ? 28 : 1) * 864e5)) serie.set(chave(t), { periodo: chave(t), faturado: 0, custo: 0, entregas: 0 });
    serie.set(chave(ate), serie.get(chave(ate)) || { periodo: chave(ate), faturado: 0, custo: 0, entregas: 0 });

    const comercios = new Map(), entregadores = new Map();
    let faturado = 0, custoEntregas = 0, km = 0;
    for (const p of entregas) {
      const ganho = comissaoDoPedido(p).valor || 0;
      const valor = p.valor || 0;
      faturado += valor; custoEntregas += ganho; km += p.distanciaKm || 0;
      const s = serie.get(chave(p.entregueEm)) || serie.set(chave(p.entregueEm), { periodo: chave(p.entregueEm), faturado: 0, custo: 0, entregas: 0 }).get(chave(p.entregueEm));
      s.faturado += valor; s.custo += ganho; s.entregas++;
      const c = comercios.get(p.comercioId) || { nome: p.comercio?.nomeFantasia || "—", entregas: 0, faturado: 0 };
      c.entregas++; c.faturado += valor; comercios.set(p.comercioId, c);
      const e = entregadores.get(p.entregadorId) || { nome: p.entregador?.nomeCompleto || "—", entregas: 0, ganho: 0, km: 0 };
      e.entregas++; e.ganho += ganho; e.km += p.distanciaKm || 0; entregadores.set(p.entregadorId, e);
    }
    const custoComissoes = comissoes._sum.valor || 0;
    const custo = custoEntregas + custoComissoes;
    const taxasSaque = saquesPeriodo.reduce((s, x) => s + (x.valorTaxa || 0), 0);
    const margem = faturado - custo + taxasSaque;
    const credito = creditos.reduce((s, g) => s + (g.tipo === "CREDITO" ? 1 : -1) * (g._sum.valor || 0), 0);
    const topo = (mapa, campo) => [...mapa.values()].sort((a, b) => b[campo] - a[campo]).slice(0, 8)
      .map(x => ({ ...x, faturado: x.faturado != null ? r2(x.faturado) : undefined, ganho: x.ganho != null ? r2(x.ganho) : undefined, km: x.km != null ? Number(x.km.toFixed(1)) : undefined }));

    res.json({
      periodo: { desde, ate, agrupamento: porMes ? "MES" : "DIA" },
      operacao: {
        faturado: r2(faturado), custoEntregas: r2(custoEntregas), custoComissoes: r2(custoComissoes), custo: r2(custo),
        taxasSaque: r2(taxasSaque), margem: r2(margem), margemPct: faturado ? Number(((margem / faturado) * 100).toFixed(1)) : null,
        entregas: entregas.length, canceladas, cancelamentoPct: entregas.length + canceladas ? Number(((canceladas / (entregas.length + canceladas)) * 100).toFixed(1)) : 0,
        ticketMedio: entregas.length ? r2(faturado / entregas.length) : 0, km: Number(km.toFixed(1)),
        entregadoresAtivos: entregadores.size, comerciosAtivos: comercios.size,
        sacadoNoPeriodo: r2(saquesPeriodo.reduce((s, x) => s + x.valor, 0)),
      },
      caixa: {
        aReceber: r2(faturasAbertas._sum.valor || 0), faturasAbertas: faturasAbertas._count._all,
        emAtraso: r2(faturasAtrasadas._sum.valor || 0), faturasAtrasadas: faturasAtrasadas._count._all,
        aPagar: r2(contasPagar._sum.valor || 0), contasAPagar: contasPagar._count._all,
        saquesPendentes: r2(saquesPendentes.reduce((s, x) => s + x.valor - (x.valorTaxa || 0), 0)), qtdSaquesPendentes: saquesPendentes.length,
        creditoLojas: r2(credito),
      },
      serie: [...serie.values()].sort((a, b) => a.periodo.localeCompare(b.periodo)).map(s => ({ ...s, faturado: r2(s.faturado), custo: r2(s.custo), margem: r2(s.faturado - s.custo) })),
      topComercios: topo(comercios, "faturado").map(({ ganho, km: _k, ...x }) => x),
      topEntregadores: topo(entregadores, "entregas").map(({ faturado: _f, ...x }) => x),
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
router.use(require("./financeiro/saques.routes"));
router.use(require("./financeiro/comissoesManuais.routes"));
router.use(require("./financeiro/documentos.routes"));

module.exports = router;
