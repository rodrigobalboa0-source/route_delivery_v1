// Regras financeiras compartilhadas: comissão do entregador por entrega.
const prisma = require("../lib/prisma");

const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
const moeda = v => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;

// Ganho do entregador numa entrega:
//   1. já acertada           -> o valor gravado no acerto (não muda depois)
//   2. comércio com tabela   -> % do valor da entrega, respeitando o mínimo da tabela
//   3. entregador com repasse fixo (taxaEntrega) -> esse valor
//   4. nenhuma regra         -> 0 (aparece como "sem regra" para corrigir o cadastro)
function comissaoDoPedido(p) {
  if (p.acertoId && p.comissaoEntregador != null) return { valor: p.comissaoEntregador, regra: "Valor do acerto", tipo: "ACERTADO" };
  const t = p.comercio?.tabelaComissao;
  if (t) {
    const pct = r2(((p.valor || 0) * t.percentual) / 100);
    const minimo = t.valorMinimo || 0;
    return {
      valor: r2(Math.max(pct, minimo)),
      regra: `${String(t.percentual).replace(".", ",")}% do valor${minimo ? ` (mín. ${moeda(minimo)})` : ""}${pct < minimo ? " — aplicado o mínimo" : ""}`,
      tipo: "TABELA",
    };
  }
  if (p.entregador?.taxaEntrega != null) return { valor: r2(p.entregador.taxaEntrega), regra: "Repasse fixo por entrega", tipo: "FIXO" };
  return { valor: 0, regra: "Sem regra de comissão", tipo: "SEM_REGRA" };
}

const INCLUDE_COMISSAO = {
  comercio: { select: { id: true, nomeFantasia: true, tabelaComissao: true } },
  entregador: { select: { id: true, nomeCompleto: true, taxaEntrega: true, cpf: true, veiculoTipo: true, tipoEntrega: true } },
  acerto: { select: { id: true, numero: true, pago: true } },
};

// Entregas concluídas no período (pela data da entrega).
function entregasDoPeriodo({ desde, ate, entregadorId, somentePendentes = false }) {
  return prisma.pedido.findMany({
    where: {
      status: "ENTREGUE",
      entregadorId: entregadorId || { not: null },
      entregueEm: { gte: desde, lte: ate },
      ...(somentePendentes ? { acertoId: null } : {}),
    },
    include: INCLUDE_COMISSAO,
    orderBy: { entregueEm: "asc" },
  });
}

module.exports = { r2, moeda, comissaoDoPedido, entregasDoPeriodo, INCLUDE_COMISSAO };
