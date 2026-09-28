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
