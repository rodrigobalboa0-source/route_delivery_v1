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
    await avisar(s.entregadorId, "💸 Saque realizado", `${brl(s.valor)} enviado para a sua conta (saque nº ${s.numero}).`);
    res.json({ ok: true });
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
