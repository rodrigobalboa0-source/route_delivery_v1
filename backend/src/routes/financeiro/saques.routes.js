// Financeiro › Saques — pedidos de saque feitos pelos entregadores na Carteira do app.
// Pagar = a equipe já transferiu para a conta informada; Recusar = o valor volta para o saldo dele.
const express = require("express");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { erro400 } = require("../../utils/periodo");
const carteira = require("../../services/carteira.service");

const router = express.Router();
const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Avisa o entregador no celular (canal de avisos).
async function avisar(entregadorId, title, body) {
  const e = await prisma.entregador.findUnique({ where: { id: entregadorId }, select: { pushToken: true } });
  if (!e?.pushToken) return;
  await require("../../services/push.service").enviar([{ to: e.pushToken, title, body, data: { tipo: "carteira", tela: "carteira" }, channelId: "avisos", sound: "default", priority: "high" }]).catch(() => {});
}

// GET /saques?status=PENDENTE|PAGO|RECUSADO — com o saldo atual de cada entregador (para conferir)
router.get(
  "/saques",
  asyncHandler(async (req, res) => {
    const status = ["PENDENTE", "PAGO", "RECUSADO"].includes(req.query.status) ? req.query.status : undefined;
    const lista = await prisma.saqueEntregador.findMany({
      where: status ? { status } : {}, orderBy: { createdAt: status === "PENDENTE" ? "asc" : "desc" }, take: 200,
      include: { entregador: { select: { id: true, nomeCompleto: true, cpf: true, telefone: true } } },
    });
    const saldos = {};
    for (const id of [...new Set(lista.map(s => s.entregadorId))]) saldos[id] = (await carteira.extrato(id)).saldo;
    res.json(lista.map(s => ({ ...s, saldoAtual: saldos[s.entregadorId] })));
  })
);

// POST /saques/:id/pagar { formaPagamento?, observacao? }
router.post(
  "/saques/:id/pagar",
  asyncHandler(async (req, res) => {
    const { count } = await prisma.saqueEntregador.updateMany({
      where: { id: req.params.id, status: "PENDENTE" },
      data: { status: "PAGO", pagoEm: new Date(), formaPagamento: String(req.body?.formaPagamento || "PIX").slice(0, 40), observacao: String(req.body?.observacao || "").trim().slice(0, 300) || null, analisadoPor: req.conta?.nome || null },
    });
    if (!count) throw erro400("Este saque já foi analisado.");
    const s = await prisma.saqueEntregador.findUnique({ where: { id: req.params.id } });
    const liquido = s.valor - (s.valorTaxa || 0);
    await avisar(s.entregadorId, "💸 Saque realizado", `${brl(liquido)} enviado para a sua conta (saque nº ${s.numero}${s.valorTaxa ? `, taxa de ${brl(s.valorTaxa)}` : ""}).`);
    res.json({ ok: true });
  })
);

// POST /saques/:id/pendente — volta um saque pago para "Pagamento pendente" (marcado como pago por engano)
router.post(
  "/saques/:id/pendente",
  asyncHandler(async (req, res) => {
    const { count } = await prisma.saqueEntregador.updateMany({
      where: { id: req.params.id, status: "PAGO" },
      data: { status: "PENDENTE", pagoEm: null, formaPagamento: null, analisadoPor: req.conta?.nome || null },
    });
    if (!count) throw erro400("Só um saque pago pode voltar para pagamento pendente.");
    res.json({ ok: true });
  })
);

// GET /acerto-entregadores?desde=AAAA-MM-DD&ate=AAAA-MM-DD&busca=nome
// Por entregador no período: entregas finalizadas e canceladas, total de taxas (ganho das entregas),
// retiradas (saques) e o saldo atual da carteira. Mais a lista das retiradas do período.
router.get(
  "/acerto-entregadores",
  asyncHandler(async (req, res) => {
    const dia = (t, fim) => (/^\d{4}-\d{2}-\d{2}$/.test(t || "") ? new Date(`${t}T${fim ? "23:59:59.999" : "00:00:00"}-03:00`) : null);
    const desde = dia(req.query.desde) || new Date(Date.now() - 6 * 864e5);
    const ate = dia(req.query.ate, true) || new Date();
    if (desde > ate) throw erro400("A data de início é depois da data de fim.");
    const busca = String(req.query.busca || "").trim();
    const filtroNome = busca ? { nomeCompleto: { contains: busca, mode: "insensitive" } } : {};
    const { entregasDoPeriodo, comissaoDoPedido, r2 } = require("../../services/financeiro.service");

    const [entregas, canceladas, saques] = await Promise.all([
      entregasDoPeriodo({ desde, ate }),
      prisma.pedido.groupBy({ by: ["entregadorId"], where: { status: "CANCELADO", entregadorId: { not: null }, canceladoEm: { gte: desde, lte: ate } }, _count: true }),
      prisma.saqueEntregador.findMany({
        where: { createdAt: { gte: desde, lte: ate }, ...(busca ? { entregador: filtroNome } : {}) },
        orderBy: { createdAt: "desc" }, include: { entregador: { select: { id: true, nomeCompleto: true } } },
      }),
    ]);
    const porId = new Map();
    const linha = id => {
      if (!porId.has(id)) porId.set(id, { entregadorId: id, finalizadas: 0, canceladas: 0, taxas: 0, retirado: 0, retiradoRapido: 0, taxasSaque: 0, aPagar: 0 });
      return porId.get(id);
    };
    for (const p of entregas) { const l = linha(p.entregadorId); l.finalizadas++; l.taxas += comissaoDoPedido(p).valor || 0; }
    for (const c of canceladas) linha(c.entregadorId).canceladas = c._count;
    for (const s of saques) {
      if (s.status === "RECUSADO") continue;
      const l = linha(s.entregadorId);
      l.retirado += s.valor; l.taxasSaque += s.valorTaxa || 0;
      if (s.tipo === "RAPIDO") l.retiradoRapido += s.valor;
      if (s.status === "PENDENTE") l.aPagar += s.valor - (s.valorTaxa || 0);
    }
    const entregadores = await prisma.entregador.findMany({
      where: { id: { in: [...porId.keys()] }, ...filtroNome },
      select: { id: true, nomeCompleto: true, veiculoTipo: true },
    });
    const linhas = [];
    for (const e of entregadores) {
      const l = porId.get(e.id);
      linhas.push({
        ...l, nome: e.nomeCompleto, veiculoTipo: e.veiculoTipo,
        taxas: r2(l.taxas), retirado: r2(l.retirado), retiradoRapido: r2(l.retiradoRapido), taxasSaque: r2(l.taxasSaque), aPagar: r2(l.aPagar),
        saldoAtual: (await carteira.extrato(e.id)).saldo,
      });
    }
    linhas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    res.json({
      linhas,
      saques: saques.map(s => ({ ...s, entregador: s.entregador.nomeCompleto, liquido: r2(s.valor - (s.valorTaxa || 0)) })),
    });
  })
);

// POST /saques/:id/recusar { motivo }
router.post(
  "/saques/:id/recusar",
  asyncHandler(async (req, res) => {
    const motivo = String(req.body?.motivo || "").trim().slice(0, 300);
    if (!motivo) throw erro400("Informe o motivo (o entregador vê no app).");
    const { count } = await prisma.saqueEntregador.updateMany({
      where: { id: req.params.id, status: "PENDENTE" },
      data: { status: "RECUSADO", recusadoEm: new Date(), motivo, analisadoPor: req.conta?.nome || null },
    });
    if (!count) throw erro400("Este saque já foi analisado.");
    const s = await prisma.saqueEntregador.findUnique({ where: { id: req.params.id } });
    await avisar(s.entregadorId, "Saque recusado", `${brl(s.valor)} voltou para o seu saldo. Motivo: ${motivo}`.slice(0, 180));
    res.json({ ok: true });
  })
);

module.exports = router;
