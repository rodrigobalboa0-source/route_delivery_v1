// Financeiro › Comissão — comissões lançadas à mão por um operador, para entregador ou funcionário do ADM.
// Cada lançamento gera uma conta a pagar (categoria COMISSAO); o pagamento é feito em Contas a Pagar.
const express = require("express");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { erro400, periodo, dataLocal, dataBR } = require("../../utils/periodo");
const { r2 } = require("../../services/financeiro.service");

const router = express.Router();
const TIPOS = ["ENTREGADOR", "FUNCIONARIO"];
const INCLUDE = {
  contaPagar: { select: { id: true, numero: true, paga: true, pagaEm: true, vencimento: true, formaPagamento: true } },
  entregador: { select: { cpf: true } },
  acerto: { select: { id: true, numero: true, pago: true, pagoEm: true } },
  pedido: { select: { codigo: true } },
};

// Aceita número ou texto no formato brasileiro ("1.234,56").
function numeroBR(v) {
  if (typeof v === "number") return v;
  const t = String(v ?? "").trim();
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}

// GET /comissoes-manuais?desde&ate&beneficiarioTipo&entregadorId&contaGerencialId&comercioId
router.get(
  "/comissoes-manuais",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query, 30);
    const where = { referencia: { gte: desde, lte: ate } };
    for (const k of ["beneficiarioTipo", "entregadorId", "contaGerencialId", "comercioId", "origem"]) if (req.query[k]) where[k] = req.query[k];
    const itens = await prisma.comissaoManual.findMany({ where, orderBy: [{ referencia: "desc" }, { numero: "desc" }], include: INCLUDE });
    const soma = f => r2(itens.filter(f).reduce((s, c) => s + c.valor, 0));
    res.json({
      desde, ate, itens,
      totais: {
        lancamentos: itens.length,
        valor: soma(() => true),
        entregas: itens.reduce((s, c) => s + c.quantidadeEntregas, 0),
        entregadores: soma(c => c.beneficiarioTipo === "ENTREGADOR"),
        funcionarios: soma(c => c.beneficiarioTipo === "FUNCIONARIO"),
        automaticas: soma(c => c.origem === "AUTOMATICA"),
        aPagar: soma(c => !(c.contaPagar?.paga || c.acerto?.pago)),
      },
    });
  })
);

// POST /comissoes-manuais
// { beneficiarioTipo, entregadorId | contaGerencialId, comercioId, quantidadeEntregas, valorPorEntrega? | valor?, referencia?, vencimento?, descricao? }
// Com valorPorEntrega, o total é valorPorEntrega × quantidade; sem ele, vale o valor total informado.
router.post(
  "/comissoes-manuais",
  asyncHandler(async (req, res) => {
    const b = req.body;
    if (!TIPOS.includes(b.beneficiarioTipo)) throw erro400("Escolha se a comissão é para entregador ou funcionário.");

    let beneficiario;
    if (b.beneficiarioTipo === "ENTREGADOR") {
      const e = await prisma.entregador.findUnique({ where: { id: b.entregadorId || "" } });
      if (!e) throw erro400("Escolha o entregador que vai receber a comissão.");
      beneficiario = { entregadorId: e.id, beneficiarioNome: e.nomeCompleto };
    } else {
      const c = await prisma.contaGerencial.findUnique({ where: { id: b.contaGerencialId || "" } });
      if (!c) throw erro400("Escolha o funcionário que vai receber a comissão.");
      beneficiario = { contaGerencialId: c.id, beneficiarioNome: c.nome };
    }

    const comercio = await prisma.comercio.findUnique({ where: { id: b.comercioId || "" } });
    if (!comercio) throw erro400("Escolha o comércio de onde saíram as entregas.");

    const quantidadeEntregas = Number(b.quantidadeEntregas);
    if (!Number.isInteger(quantidadeEntregas) || quantidadeEntregas < 1 || quantidadeEntregas > 100000) throw erro400("Informe a quantidade de entregas (número inteiro, 1 ou mais).");

    let valorPorEntrega = null;
    let valor;
    if (b.valorPorEntrega !== undefined && b.valorPorEntrega !== null && b.valorPorEntrega !== "") {
      valorPorEntrega = r2(numeroBR(b.valorPorEntrega));
      if (!Number.isFinite(valorPorEntrega) || valorPorEntrega <= 0) throw erro400("Informe um valor por entrega maior que zero.");
      valor = r2(valorPorEntrega * quantidadeEntregas);
    } else {
      valor = r2(numeroBR(b.valor));
      if (!Number.isFinite(valor) || valor <= 0) throw erro400("Informe o valor da comissão.");
    }
    if (valor > 1000000) throw erro400("Valor acima do limite permitido.");

    const referencia = b.referencia ? dataLocal(String(b.referencia).slice(0, 10)) : new Date();
    if (!referencia) throw erro400("Data de referência inválida.");
    referencia.setHours(12, 0, 0, 0);
    const vencimento = b.vencimento ? dataLocal(String(b.vencimento).slice(0, 10)) : new Date(referencia);
    if (!vencimento) throw erro400("Data de pagamento inválida.");
    vencimento.setHours(12, 0, 0, 0);
    const descricao = String(b.descricao || "").trim() || null;

    const criada = await prisma.$transaction(async tx => {
      const c = await tx.comissaoManual.create({
        data: {
          beneficiarioTipo: b.beneficiarioTipo, ...beneficiario, comercioId: comercio.id, comercioNome: comercio.nomeFantasia,
          quantidadeEntregas, valorPorEntrega, valor, referencia, descricao, autorNome: req.conta?.nome || null,
        },
      });
      await tx.contaPagar.create({
        data: {
          descricao: `Comissão nº ${c.numero} — ${quantidadeEntregas} entrega${quantidadeEntregas > 1 ? "s" : ""} de ${comercio.nomeFantasia} (${dataBR(referencia)})`,
          favorecido: beneficiario.beneficiarioNome, categoria: "COMISSAO", vencimento, valor, observacao: descricao, comissaoManualId: c.id,
        },
      });
      return tx.comissaoManual.findUnique({ where: { id: c.id }, include: INCLUDE });
    });
    res.status(201).json(criada);
  })
);

// DELETE /comissoes-manuais/:id — só enquanto não foi paga (a conta a pagar vai junto).
// Automática: só enquanto não entrou em acerto.
router.delete(
  "/comissoes-manuais/:id",
  asyncHandler(async (req, res) => {
    const c = await prisma.comissaoManual.findUnique({ where: { id: req.params.id }, include: { contaPagar: true } });
    if (!c) return res.status(404).json({ erro: "Comissão não encontrada." });
    if (c.acertoId) return res.status(409).json({ erro: "Esta comissão já está no acerto do entregador. Exclua o acerto antes." });
    if (c.contaPagar?.paga) return res.status(409).json({ erro: "Comissão já paga. Reabra o pagamento em Contas a Pagar antes de excluir." });
    await prisma.comissaoManual.delete({ where: { id: c.id } });
    res.status(204).send();
  })
);

module.exports = router;
