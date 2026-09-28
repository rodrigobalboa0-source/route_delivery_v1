const { ABERTOS } = require("../utils/statusPedido");
const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");

const router = express.Router();

// Relatórios analíticos (embarcadores, entregadores, roteirização, operação, vagas...).
router.use(require("./relatoriosAnaliticos.routes"));

function inicioDoDia(d = new Date()) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

// GET /api/relatorios/dashboard — tudo que a tela inicial do painel precisa em uma chamada
router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const hoje = inicioDoDia();
    const quinzeMinAtras = new Date(Date.now() - 15 * 60 * 1000);

    const [porStatusHoje, entreguesHoje, emAndamento, aguardandoMuito, entregadoresOnline, entregadoresAnalise,
      comerciosAtivos, topComercios] = await Promise.all([
      prisma.pedido.groupBy({ by: ["status"], where: { createdAt: { gte: hoje } }, _count: { _all: true } }),
      prisma.pedido.aggregate({ where: { status: "ENTREGUE", createdAt: { gte: hoje } }, _sum: { valor: true }, _count: { _all: true } }),
      prisma.pedido.count({ where: { status: { in: ABERTOS } } }),
      // Pedidos prontos há mais de 15 min sem nenhum entregador — precisam de atenção.
      prisma.pedido.findMany({
        where: { status: "PENDENTE", entregadorId: null, updatedAt: { lt: quinzeMinAtras } },
        select: { id: true, codigo: true, clienteNome: true, updatedAt: true, comercio: { select: { nomeFantasia: true } } },
        orderBy: { updatedAt: "asc" },
        take: 10,
      }),
      prisma.entregador.count({ where: { online: true } }),
      prisma.entregador.count({ where: { status: "EM_ANALISE" } }),
      prisma.comercio.count({ where: { bloqueado: false } }),
      prisma.pedido.groupBy({
        by: ["comercioId"], where: { createdAt: { gte: hoje } }, _count: { _all: true },
        orderBy: { _count: { comercioId: "desc" } }, take: 5,
      }),
    ]);

    const nomes = await prisma.comercio.findMany({
      where: { id: { in: topComercios.map(t => t.comercioId) } },
      select: { id: true, nomeFantasia: true },
    });
    const nomePorId = Object.fromEntries(nomes.map(c => [c.id, c.nomeFantasia]));

    const statusHoje = {};
    porStatusHoje.forEach(g => { statusHoje[g.status] = g._count._all; });

    res.json({
      pedidosHoje: porStatusHoje.reduce((s, g) => s + g._count._all, 0),
      statusHoje,
      entreguesHoje: entreguesHoje._count._all,
      receitaHoje: Number((entreguesHoje._sum.valor || 0).toFixed(2)),
      emAndamento,
      aguardandoEntregador: aguardandoMuito,
      entregadoresOnline,
      entregadoresEmAnalise: entregadoresAnalise,
      comerciosAtivos,
      topComerciosHoje: topComercios.map(t => ({ comercioId: t.comercioId, nome: nomePorId[t.comercioId] || "—", pedidos: t._count._all })),
    });
  })
);

// GET /api/relatorios/resumo-semana
router.get(
  "/resumo-semana",
  asyncHandler(async (req, res) => {
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

    const grupos = await prisma.pedido.groupBy({
      by: ["status"], where: { createdAt: { gte: seteDiasAtras } }, _count: { _all: true },
    });
    const total = grupos.reduce((s, g) => s + g._count._all, 0);
    const contar = st => grupos.find(g => g.status === st)?._count._all || 0;

    res.json({
      totalEntregasSemana: total,
      taxaAtraso: total ? Number(((contar("ATRASADO") / total) * 100).toFixed(1)) : 0,
      taxaCancelamento: total ? Number(((contar("CANCELADO") / total) * 100).toFixed(1)) : 0,
      totalEntregues: contar("ENTREGUE"),
    });
  })
);

// GET /api/relatorios/volume-por-dia?dias=7 — série cronológica (mais antigo -> hoje)
router.get(
  "/volume-por-dia",
  asyncHandler(async (req, res) => {
    const dias = Math.min(Math.max(Number(req.query.dias) || 7, 1), 90);
    const inicio = inicioDoDia();
    inicio.setDate(inicio.getDate() - (dias - 1));

    const pedidos = await prisma.pedido.findMany({
      where: { createdAt: { gte: inicio } },
      select: { createdAt: true, status: true },
    });

    const nomesDia = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const chave = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const serie = [];
    const porChave = {};
    for (let i = 0; i < dias; i++) {
      const d = new Date(inicio);
      d.setDate(inicio.getDate() + i);
      const item = { data: chave(d), dia: nomesDia[d.getDay()], entregas: 0, entregues: 0, cancelados: 0 };
      serie.push(item);
      porChave[item.data] = item;
    }
    pedidos.forEach(p => {
      const item = porChave[chave(p.createdAt)];
      if (!item) return;
      item.entregas += 1;
      if (p.status === "ENTREGUE") item.entregues += 1;
      if (p.status === "CANCELADO") item.cancelados += 1;
    });

    res.json(serie);
  })
);

// GET /api/relatorios/periodo?dias=30 — indicadores e rankings de um período
router.get(
  "/periodo",
  asyncHandler(async (req, res) => {
    const dias = Math.min(Math.max(Number(req.query.dias) || 30, 1), 365);
    const inicio = inicioDoDia();
    inicio.setDate(inicio.getDate() - (dias - 1));
    const where = { createdAt: { gte: inicio } };

    const [porStatus, entregues, porComercio, porEntregador] = await Promise.all([
      prisma.pedido.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.pedido.aggregate({ where: { ...where, status: "ENTREGUE" }, _sum: { valor: true, distanciaKm: true }, _count: { _all: true } }),
      prisma.pedido.groupBy({
        by: ["comercioId"], where, _count: { _all: true }, _sum: { valor: true },
        orderBy: { _count: { comercioId: "desc" } }, take: 10,
      }),
      prisma.pedido.groupBy({
        by: ["entregadorId"], where: { ...where, status: "ENTREGUE", entregadorId: { not: null } },
        _count: { _all: true }, _sum: { valor: true, distanciaKm: true },
        orderBy: { _count: { entregadorId: "desc" } }, take: 10,
      }),
    ]);

    const [comercios, entregadores] = await Promise.all([
      prisma.comercio.findMany({ where: { id: { in: porComercio.map(c => c.comercioId) } }, select: { id: true, nomeFantasia: true } }),
      prisma.entregador.findMany({ where: { id: { in: porEntregador.map(e => e.entregadorId) } }, select: { id: true, nomeCompleto: true } }),
    ]);
    const nomeComercio = Object.fromEntries(comercios.map(c => [c.id, c.nomeFantasia]));
    const nomeEntregador = Object.fromEntries(entregadores.map(e => [e.id, e.nomeCompleto]));

    const total = porStatus.reduce((s, g) => s + g._count._all, 0);
    const contar = st => porStatus.find(g => g.status === st)?._count._all || 0;
    const qtdEntregues = entregues._count._all;

    res.json({
      dias,
      desde: inicio,
      totalPedidos: total,
      entregues: qtdEntregues,
      cancelados: contar("CANCELADO"),
      taxaEntrega: total ? Number(((qtdEntregues / total) * 100).toFixed(1)) : 0,
      taxaCancelamento: total ? Number(((contar("CANCELADO") / total) * 100).toFixed(1)) : 0,
      receita: Number((entregues._sum.valor || 0).toFixed(2)),
      ticketMedio: qtdEntregues ? Number(((entregues._sum.valor || 0) / qtdEntregues).toFixed(2)) : 0,
      distanciaMediaKm: qtdEntregues ? Number(((entregues._sum.distanciaKm || 0) / qtdEntregues).toFixed(1)) : 0,
      rankingComercios: porComercio.map(c => ({
        id: c.comercioId, nome: nomeComercio[c.comercioId] || "—", pedidos: c._count._all, valor: Number((c._sum.valor || 0).toFixed(2)),
      })),
      rankingEntregadores: porEntregador.map(e => ({
        id: e.entregadorId, nome: nomeEntregador[e.entregadorId] || "—", entregas: e._count._all,
        valor: Number((e._sum.valor || 0).toFixed(2)), distanciaKm: Number((e._sum.distanciaKm || 0).toFixed(1)),
      })),
    });
  })
);

module.exports = router;
