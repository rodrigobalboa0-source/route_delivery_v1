// Regras financeiras compartilhadas: comissão do entregador por entrega.
const prisma = require("../lib/prisma");
const { valorPorFaixas } = require("../utils/faixas");

const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
const moeda = v => `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;

const km = v => `${String(v).replace(".", ",")} km`;

// Ganho do entregador numa entrega:
//   1. já acertada           -> o valor gravado no acerto (não muda depois)
//   2. comércio com tabela   -> FAIXAS: valor da faixa do km da entrega (acima da última, + valor por km);
//                               PERCENTUAL: % do valor da entrega. Os dois respeitam o mínimo da tabela.
//   3. entregador com repasse fixo (taxaEntrega) -> esse valor
//   4. nenhuma regra         -> 0 (aparece como "sem regra" para corrigir o cadastro)
// Entrega com retorno: soma o adicional do retorno (ver adicionalRetorno).
function comissaoDoPedido(p) {
  if (p.acertoId && p.comissaoEntregador != null) return { valor: p.comissaoEntregador, regra: "Valor do acerto", tipo: "ACERTADO" };
  const base = comissaoBase(p);
  if (!p.retorno) return base;
  const extra = adicionalRetorno(p, base.valor);
  if (!extra.valor) return base;
  return { ...base, valor: r2(base.valor + extra.valor), regra: `${base.regra} + ${extra.regra}`, adicionalRetorno: extra.valor };
}

// Adicional do entregador numa entrega com retorno à loja, conforme a tabela de comissão do comércio
// (sem tabela: repassa o acréscimo cobrado da loja).
function adicionalRetorno(p, comissao) {
  const t = p.comercio?.tabelaComissao;
  const tipo = t?.tipoRetorno || "REPASSE_LOJA";
  if (tipo === "SEM_ADICIONAL") return { valor: 0, regra: "" };
  if (tipo === "PORCENTAGEM") {
    const pct = t.valorRetorno || 0;
    return { valor: r2((comissao * pct) / 100), regra: `retorno ${String(pct).replace(".", ",")}% da comissão` };
  }
  if (tipo === "VALOR_FIXO") return { valor: r2(t.valorRetorno || 0), regra: `retorno ${moeda(t.valorRetorno || 0)}` };
  return { valor: r2(p.acrescimoRetorno || 0), regra: `retorno (acréscimo da loja) ${moeda(p.acrescimoRetorno || 0)}` };
}

function comissaoBase(p) {
  const t = p.comercio?.tabelaComissao;
  if (t?.tipoCalculo === "FAIXAS") {
    const r = p.distanciaKm != null ? valorPorFaixas(p.distanciaKm, t.faixas, t.kmAdicional, t.valorMinimo) : null;
    if (r) {
      const regra = r.faixa
        ? `Faixa até ${km(r.faixa.ateKm)} (${km(p.distanciaKm)})`
        : `Acima de ${km(r.ultima.ateKm)}: ${moeda(r.ultima.valor)} + ${km(r.excedenteKm)} × ${moeda(t.kmAdicional || 0)}`;
      return { valor: r2(r.valor), regra, tipo: "TABELA" };
    }
    // Entrega sem km calculado: cai no repasse fixo do entregador, se houver.
    if (p.entregador?.taxaEntrega != null) return { valor: r2(p.entregador.taxaEntrega), regra: "Entrega sem km — repasse fixo por entrega", tipo: "FIXO" };
    return { valor: 0, regra: "Entrega sem km calculado para a tabela por faixas", tipo: "SEM_REGRA" };
  }
  if (t && t.percentual != null) {
    // % sobre a taxa sem o acréscimo do retorno (o retorno é pago à parte, sem contar duas vezes).
    const pct = r2((((p.valor || 0) - (p.acrescimoRetorno || 0)) * t.percentual) / 100);
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
