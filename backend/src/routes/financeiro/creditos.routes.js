// Financeiro › Crédito — saldo pré-pago dos comércios (lançamentos de crédito e débito).
const express = require("express");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { erro400 } = require("../../utils/periodo");
const { r2 } = require("../../services/financeiro.service");

const router = express.Router();

async function saldos() {
  const g = await prisma.creditoMovimento.groupBy({ by: ["comercioId", "tipo"], _sum: { valor: true } });
  const s = {};
  g.forEach(x => { s[x.comercioId] = (s[x.comercioId] || 0) + (x.tipo === "CREDITO" ? 1 : -1) * (x._sum.valor || 0); });
  return s;
}

// GET /creditos — saldo de cada comércio
router.get(
  "/creditos",
  asyncHandler(async (req, res) => {
    const [comercios, s, ultimos] = await Promise.all([
      prisma.comercio.findMany({ select: { id: true, nomeFantasia: true, bloqueado: true }, orderBy: { nomeFantasia: "asc" } }),
      saldos(),
      prisma.creditoMovimento.groupBy({ by: ["comercioId"], _max: { createdAt: true } }),
    ]);
    const ultimo = Object.fromEntries(ultimos.map(u => [u.comercioId, u._max.createdAt]));
    const linhas = comercios.map(c => ({ comercioId: c.id, nome: c.nomeFantasia, bloqueado: c.bloqueado, saldo: r2(s[c.id] || 0), ultimoMovimento: ultimo[c.id] || null }));
    res.json({ linhas, total: r2(linhas.reduce((t, l) => t + l.saldo, 0)) });
  })
);

// ---------- Solicitações de crédito feitas pelas lojas (com comprovante) ----------

const SELECT_SOLICITACAO = {
  id: true, comercioId: true, valor: true, metodo: true, observacao: true, status: true, motivo: true,
  analisadoPor: true, analisadoEm: true, createdAt: true, comercio: { select: { nomeFantasia: true } },
};

// GET /creditos/solicitacoes?status=PENDENTE|APROVADA|RECUSADA (sem status: as 100 mais recentes)
router.get(
  "/creditos/solicitacoes",
  asyncHandler(async (req, res) => {
    const status = ["PENDENTE", "APROVADA", "RECUSADA"].includes(req.query.status) ? req.query.status : undefined;
    const lista = await prisma.creditoSolicitacao.findMany({ where: status ? { status } : {}, orderBy: { createdAt: status === "PENDENTE" ? "asc" : "desc" }, take: 100, select: SELECT_SOLICITACAO });
    res.json(lista.map(({ comercio, ...s }) => ({ ...s, comercio: comercio.nomeFantasia })));
  })
);

// GET /creditos/solicitacoes/:id/comprovante
router.get(
  "/creditos/solicitacoes/:id/comprovante",
  asyncHandler(async (req, res) => {
    const s = await prisma.creditoSolicitacao.findUnique({ where: { id: req.params.id }, select: { comprovante: true } });
    if (!s) return res.status(404).json({ erro: "Solicitação não encontrada." });
    res.json(s);
  })
);

// POST /creditos/solicitacoes/:id/aprovar — lança o crédito no saldo da loja
router.post(
  "/creditos/solicitacoes/:id/aprovar",
  asyncHandler(async (req, res) => {
    const autor = req.conta?.nome || null;
    const r = await prisma.$transaction(async tx => {
      const s = await tx.creditoSolicitacao.findUnique({ where: { id: req.params.id } });
      if (!s) throw Object.assign(new Error("Solicitação não encontrada."), { status: 404 });
      if (s.status !== "PENDENTE") throw erro400("Esta solicitação já foi analisada.");
      const mov = await tx.creditoMovimento.create({
        data: { comercioId: s.comercioId, tipo: "CREDITO", valor: s.valor, descricao: `Recarga via ${s.metodo === "PIX" ? "PIX" : "outros meios"} (solicitação aprovada)`, autorNome: autor },
      });
      const { count } = await tx.creditoSolicitacao.updateMany({
        where: { id: s.id, status: "PENDENTE" },
        data: { status: "APROVADA", analisadoPor: autor, analisadoEm: new Date(), movimentoId: mov.id },
      });
      if (!count) throw erro400("Esta solicitação já foi analisada.");
      return s;
    });
    res.json({ ok: true, valor: r.valor });
  })
);

// POST /creditos/solicitacoes/:id/recusar { motivo }
router.post(
  "/creditos/solicitacoes/:id/recusar",
  asyncHandler(async (req, res) => {
    const motivo = String(req.body?.motivo || "").trim().slice(0, 300);
    if (!motivo) throw erro400("Informe o motivo da recusa (a loja vai ver).");
    const { count } = await prisma.creditoSolicitacao.updateMany({
      where: { id: req.params.id, status: "PENDENTE" },
      data: { status: "RECUSADA", motivo, analisadoPor: req.conta?.nome || null, analisadoEm: new Date() },
    });
    if (!count) throw erro400("Esta solicitação já foi analisada (ou não existe).");
    res.json({ ok: true });
  })
);

// GET /creditos/:comercioId — extrato com saldo acumulado
router.get(
  "/creditos/:comercioId",
  asyncHandler(async (req, res) => {
    const movs = await prisma.creditoMovimento.findMany({ where: { comercioId: req.params.comercioId }, orderBy: { createdAt: "asc" } });
    let saldo = 0;
    const extrato = movs.map(m => {
      saldo = r2(saldo + (m.tipo === "CREDITO" ? m.valor : -m.valor));
      return { ...m, saldoApos: saldo };
    }).reverse();
    res.json({ saldo, extrato });
  })
);

// POST /creditos { comercioId, tipo: CREDITO|DEBITO, valor, descricao }
router.post(
  "/creditos",
  asyncHandler(async (req, res) => {
    const { comercioId, tipo } = req.body;
    if (!(await prisma.comercio.findUnique({ where: { id: comercioId || "" } }))) throw erro400("Escolha o comércio.");
    if (!["CREDITO", "DEBITO"].includes(tipo)) throw erro400("Tipo inválido.");
    const valor = r2(Number(String(req.body.valor ?? "").replace(",", ".")));
    if (!Number.isFinite(valor) || valor <= 0) throw erro400("Informe um valor maior que zero.");
    const descricao = String(req.body.descricao || "").trim();
    if (!descricao) throw erro400("Descreva o lançamento.");
    if (tipo === "DEBITO") {
      const saldo = (await saldos())[comercioId] || 0;
      if (valor > saldo + 1e-9) throw erro400(`Saldo insuficiente (disponível: R$ ${saldo.toFixed(2).replace(".", ",")}).`);
    }
    res.status(201).json(await prisma.creditoMovimento.create({ data: { comercioId, tipo, valor, descricao, autorNome: req.conta?.nome || null } }));
  })
);

module.exports = router;
