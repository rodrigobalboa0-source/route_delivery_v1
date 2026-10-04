// Carteira do entregador: extrato com tudo o que ele ganhou e tudo o que já recebeu.
//   (+) Comissão de Entrega — cada entrega finalizada (mesmo valor do Acerto / app);
//   (+) Comissões do Financeiro › Comissão (automáticas e manuais) e ajustes de acerto (bônus/descontos);
//   (−) Acertos pagos pelo ADM, comissões manuais pagas por conta a pagar, e saques (em análise ou pagos).
// Saldo = soma do extrato. Saque recusado aparece no histórico, mas não mexe no saldo.
const prisma = require("../lib/prisma");
const { r2, comissaoDoPedido, INCLUDE_COMISSAO, comTabelaPadrao } = require("./financeiro.service");

const ROTULO_SAQUE = { NORMAL: "Saque", RAPIDO: "Saque Rápido" };

async function extrato(entregadorId, db = prisma) {
  const [pedidos, comissoes, acertos, saques] = await Promise.all([
    db.pedido.findMany({ where: { entregadorId, status: "ENTREGUE" }, include: INCLUDE_COMISSAO, orderBy: { entregueEm: "asc" } }),
    db.comissaoManual.findMany({ where: { entregadorId }, include: { contaPagar: { select: { paga: true, pagaEm: true } } } }),
    db.acertoEntregador.findMany({ where: { entregadorId } }),
    db.saqueEntregador.findMany({ where: { entregadorId } }),
  ]);
  const movs = [];
  for (const p of await comTabelaPadrao(pedidos)) {
    const valor = r2(comissaoDoPedido(p).valor || 0);
    if (valor > 0) movs.push({ id: `e-${p.id}`, tipo: "ENTREGA", data: p.entregueEm || p.updatedAt, descricao: "Comissão de Entrega", detalhe: `${p.codigo} · ${p.comercio?.nomeFantasia || ""}`.trim(), valor });
  }
  for (const c of comissoes) {
    movs.push({ id: `c-${c.id}`, tipo: "COMISSAO", data: c.createdAt, descricao: c.origem === "AUTOMATICA" ? "Comissão automática" : "Comissão", detalhe: c.comercioNome, valor: r2(c.valor) });
    // Comissão manual paga fora de acerto (conta a pagar quitada).
    if (!c.acertoId && c.contaPagar?.paga) movs.push({ id: `cp-${c.id}`, tipo: "PAGAMENTO", data: c.contaPagar.pagaEm || c.createdAt, descricao: "Comissão paga", detalhe: c.comercioNome, valor: -r2(c.valor) });
  }
  for (const a of acertos) {
    if (a.ajustes) movs.push({ id: `aj-${a.id}`, tipo: "AJUSTE", data: a.createdAt, descricao: a.ajustes > 0 ? "Bônus do acerto" : "Desconto do acerto", detalhe: a.descricaoAjustes || `Acerto nº ${a.numero}`, valor: r2(a.ajustes) });
    if (a.pago) movs.push({ id: `ap-${a.id}`, tipo: "PAGAMENTO", data: a.pagoEm || a.createdAt, descricao: "Pagamento de acerto", detalhe: `Acerto nº ${a.numero}${a.formaPagamento ? ` · ${a.formaPagamento}` : ""}`, valor: -r2(a.valorTotal) });
  }
  for (const s of saques) {
    const nome = ROTULO_SAQUE[s.tipo] || "Saque";
    const taxa = s.valorTaxa ? ` · taxa ${String(s.taxaPercentual).replace(".", ",")}% (R$ ${s.valorTaxa.toFixed(2).replace(".", ",")})` : "";
    if (s.status === "PAGO") movs.push({ id: `s-${s.id}`, tipo: "SAQUE", data: s.pagoEm || s.createdAt, descricao: `${nome} Realizado`, detalhe: `Saque nº ${s.numero}${taxa}`, valor: -r2(s.valor), status: "PAGO" });
    else if (s.status === "PENDENTE") movs.push({ id: `s-${s.id}`, tipo: "SAQUE", data: s.createdAt, descricao: `${nome} solicitado`, detalhe: `Em análise — o valor já foi reservado${taxa}`, valor: -r2(s.valor), status: "PENDENTE" });
    else movs.push({ id: `s-${s.id}`, tipo: "SAQUE", data: s.recusadoEm || s.createdAt, descricao: `${nome} recusado`, detalhe: `Valor devolvido ao saldo${s.motivo ? ` · ${s.motivo}` : ""}`, valor: 0, valorOriginal: r2(s.valor), status: "RECUSADO" });
  }
  movs.sort((a, b) => new Date(b.data) - new Date(a.data));
  const saldo = r2(movs.reduce((t, m) => t + m.valor, 0));
  return { saldo, movimentos: movs };
}

// Dia de hoje em Brasília (AAAA-MM-DD) e dia da semana (0 = domingo).
function hojeBrasilia() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { iso, diaSemana: d.getDay(), inicio: new Date(`${iso}T00:00:00-03:00`) };
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const dataBR = iso => iso.split("-").reverse().join("/");

// Pode pedir este tipo de saque hoje? Regras de Configurações › Regras de saque.
function situacaoRegra(regra, feitosHoje, hoje) {
  if (regra.datasEspecificas?.length) {
    if (!regra.datasEspecificas.includes(hoje.iso)) {
      const prox = regra.datasEspecificas.find(d => d > hoje.iso);
      return { pode: false, motivo: prox ? `Liberado só em datas definidas. Próxima: ${dataBR(prox)}.` : "Sem data liberada para este saque." };
    }
  } else if (regra.diasPermitidos?.length && !regra.diasPermitidos.includes(hoje.diaSemana)) {
    return { pode: false, motivo: `Liberado só ${regra.diasPermitidos.map(d => DIAS[d]).join(", ")}.` };
  }
  if (feitosHoje >= regra.maxSolicitacoesDia) return { pode: false, motivo: `Limite de ${regra.maxSolicitacoesDia} pedido(s) por dia atingido.` };
  return { pode: true, motivo: null };
}

module.exports = { extrato, hojeBrasilia, situacaoRegra, ROTULO_SAQUE };
