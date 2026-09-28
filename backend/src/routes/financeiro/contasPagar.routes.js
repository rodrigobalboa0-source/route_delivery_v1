// Financeiro › Contas a Pagar
const express = require("express");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { erro400, dataLocal } = require("../../utils/periodo");
const { r2 } = require("../../services/financeiro.service");

const router = express.Router();
const CATEGORIAS = ["ENTREGADOR", "COMISSAO", "FORNECEDOR", "IMPOSTO", "SALARIO", "ALUGUEL", "SERVICO", "OUTROS"];

function dados(b, parcial = false) {
  const d = {};
  if (!parcial || b.descricao !== undefined) {
    const t = String(b.descricao || "").trim();
    if (!t) throw erro400("Informe a descrição.");
    d.descricao = t;
  }
  if (b.favorecido !== undefined) d.favorecido = String(b.favorecido || "").trim() || null;
  if (b.categoria !== undefined) {
    if (!CATEGORIAS.includes(b.categoria)) throw erro400("Categoria inválida.");
    d.categoria = b.categoria;
  }
  if (!parcial || b.vencimento !== undefined) {
    const v = dataLocal(String(b.vencimento || "").slice(0, 10));
    if (!v) throw erro400("Informe o vencimento.");
    v.setHours(12);
    d.vencimento = v;
  }
  if (!parcial || b.valor !== undefined) {
    const v = r2(Number(String(b.valor ?? "").replace(",", ".")));
    if (!Number.isFinite(v) || v <= 0) throw erro400("Informe um valor maior que zero.");
    d.valor = v;
  }
  if (b.observacao !== undefined) d.observacao = String(b.observacao || "").trim() || null;
  return d;
}

// GET /contas-pagar?situacao=aberta|atrasada|paga&categoria&desde&ate (vencimento)
router.get(
  "/contas-pagar",
  asyncHandler(async (req, res) => {
    const agora = new Date();
    const where = {};
    if (req.query.categoria) where.categoria = req.query.categoria;
    if (req.query.situacao === "paga") where.paga = true;
    if (req.query.situacao === "aberta") Object.assign(where, { paga: false, vencimento: { gte: agora } });
    if (req.query.situacao === "atrasada") Object.assign(where, { paga: false, vencimento: { lt: agora } });
    const desde = dataLocal(req.query.desde);
    const ate = dataLocal(req.query.ate, true);
    if (desde || ate) where.vencimento = { ...(where.vencimento || {}), ...(desde ? { gte: desde } : {}), ...(ate ? { lte: ate } : {}) };

    const [contas, abertas, atrasadas] = await Promise.all([
      prisma.contaPagar.findMany({ where, orderBy: [{ paga: "asc" }, { vencimento: "asc" }], include: { acerto: { select: { numero: true, entregadorId: true } }, comissaoManual: { select: { numero: true, beneficiarioTipo: true } } } }),
      prisma.contaPagar.aggregate({ where: { paga: false, vencimento: { gte: agora } }, _sum: { valor: true }, _count: { _all: true } }),
      prisma.contaPagar.aggregate({ where: { paga: false, vencimento: { lt: agora } }, _sum: { valor: true }, _count: { _all: true } }),
    ]);
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const pagoMes = await prisma.contaPagar.aggregate({ where: { paga: true, pagaEm: { gte: inicioMes } }, _sum: { valor: true } });
    res.json({
      contas,
      resumo: {
        aVencer: r2(abertas._sum.valor || 0), qtdAVencer: abertas._count._all,
        atrasado: r2(atrasadas._sum.valor || 0), qtdAtrasadas: atrasadas._count._all,
        pagoNoMes: r2(pagoMes._sum.valor || 0),
      },
    });
  })
);

router.post(
  "/contas-pagar",
  asyncHandler(async (req, res) => {
    res.status(201).json(await prisma.contaPagar.create({ data: dados(req.body) }));
  })
);

// PUT — contas de acerto/comissão só mudam vencimento/observação (o valor vem do lançamento de origem)
router.put(
  "/contas-pagar/:id",
  asyncHandler(async (req, res) => {
    const atual = await prisma.contaPagar.findUnique({ where: { id: req.params.id } });
    if (!atual) return res.status(404).json({ erro: "Conta não encontrada." });
    let d = dados(req.body, true);
    if (atual.acertoId || atual.comissaoManualId) d = { ...(d.vencimento ? { vencimento: d.vencimento } : {}), ...(d.observacao !== undefined ? { observacao: d.observacao } : {}) };
    res.json(await prisma.contaPagar.update({ where: { id: atual.id }, data: d }));
  })
);

// Pagar/reabrir mantém o acerto do entregador sincronizado.
async function marcar(id, paga, formaPagamento, pagaEm) {
  const conta = await prisma.contaPagar.findUnique({ where: { id } });
  if (!conta) {
    const err = new Error("Conta não encontrada.");
    err.status = 404;
    throw err;
  }
  const data = paga ? { paga: true, pagaEm, formaPagamento } : { paga: false, pagaEm: null, formaPagamento: null };
  const ops = [prisma.contaPagar.update({ where: { id }, data })];
  if (conta.acertoId) {
    ops.push(prisma.acertoEntregador.update({
      where: { id: conta.acertoId },
      data: paga ? { pago: true, pagoEm: pagaEm, formaPagamento } : { pago: false, pagoEm: null, formaPagamento: null },
    }));
  }
  const [r] = await prisma.$transaction(ops);
  return r;
}

router.patch(
  "/contas-pagar/:id/pagar",
  asyncHandler(async (req, res) => {
    const pagaEm = req.body.pagaEm ? new Date(`${req.body.pagaEm}T12:00:00`) : new Date();
    res.json(await marcar(req.params.id, true, req.body.formaPagamento || null, pagaEm));
  })
);

router.patch(
  "/contas-pagar/:id/reabrir",
  asyncHandler(async (req, res) => {
    res.json(await marcar(req.params.id, false));
  })
);

router.delete(
  "/contas-pagar/:id",
  asyncHandler(async (req, res) => {
    const c = await prisma.contaPagar.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ erro: "Conta não encontrada." });
    if (c.acertoId) return res.status(409).json({ erro: "Esta conta é de um acerto de entregador. Exclua o acerto em Acerto de Entregadores." });
    if (c.comissaoManualId) return res.status(409).json({ erro: "Esta conta é de uma comissão lançada. Exclua a comissão em Financeiro › Comissão." });
    if (c.paga) return res.status(409).json({ erro: "Conta já paga. Reabra antes de excluir." });
    await prisma.contaPagar.delete({ where: { id: c.id } });
    res.status(204).send();
  })
);

module.exports = router;
