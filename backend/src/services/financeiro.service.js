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
//   5. comércio SEM tabela e entregador SEM repasse fixo -> tabela padrão da categoria do veículo
//      (a primeira tabela de comissão cadastrada para Moto/Bike/Carro) — ver tabelaDo / comTabelaPadrao.
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
// Tabela que vale para a entrega: a do comércio ou, sem vínculo, a padrão do veículo (preenchida por comTabelaPadrao).
const tabelaDo = p => p.comercio?.tabelaComissao || p.tabelaPadrao || null;

function adicionalRetorno(p, comissao) {
  const t = tabelaDo(p);
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
  const r = comissaoPelaTabela(p);
  // Deixa claro no acerto/relatório quando a regra veio da tabela padrão do veículo.
  if (r.tipo === "TABELA" && !p.comercio?.tabelaComissao && p.tabelaPadrao) {
    return { ...r, regra: `${r.regra} — tabela padrão ${p.tabelaPadrao.nome || p.tabelaPadrao.categoria}` };
  }
  return r;
}

function comissaoPelaTabela(p) {
  const t = tabelaDo(p);
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
    // Sem km e sem repasse fixo: vale a primeira faixa da tabela (a menor), respeitando o mínimo.
    const primeira = (Array.isArray(t.faixas) ? [...t.faixas] : []).filter(f => Number(f?.valor) > 0).sort((a, b) => Number(a.ateKm) - Number(b.ateKm))[0];
    if (primeira) return { valor: r2(Math.max(Number(primeira.valor), t.valorMinimo || 0)), regra: `Entrega sem km — primeira faixa (${moeda(primeira.valor)})`, tipo: "TABELA" };
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

// Tabelas padrão por categoria de veículo (a primeira cadastrada de cada categoria). Cache de 1 min.
let cacheTabelas = { em: 0, porVeiculo: {} };
async function tabelasPadrao() {
  if (Date.now() - cacheTabelas.em < 60000) return cacheTabelas.porVeiculo;
  const lista = await prisma.tabelaComissao.findMany({ orderBy: { id: "asc" } });
  const porVeiculo = {};
  for (const t of lista) if (!porVeiculo[t.categoria]) porVeiculo[t.categoria] = t;
  cacheTabelas = { em: Date.now(), porVeiculo };
  return porVeiculo;
}
function esquecerTabelasPadrao() { cacheTabelas = { em: 0, porVeiculo: {} }; }

// Preenche p.tabelaPadrao nas entregas cujo comércio não tem tabela vinculada e cujo entregador
// não tem repasse fixo no cadastro (ordem: tabela do comércio > repasse fixo do entregador > tabela padrão do veículo).
// `entregador` (opcional) = quem vai fazer a entrega, quando o pedido ainda não tem entregador (corridas disponíveis).
async function comTabelaPadrao(pedidos, entregador = null) {
  const padroes = await tabelasPadrao();
  return pedidos.map(p => {
    if (p.comercio?.tabelaComissao) return p;
    const e = p.entregador || entregador;
    if (e?.taxaEntrega != null) return p;
    const veiculo = e?.veiculoTipo || "MOTO";
    return padroes[veiculo] ? { ...p, tabelaPadrao: padroes[veiculo] } : p;
  });
}

// Entregas concluídas no período (pela data da entrega).
async function entregasDoPeriodo({ desde, ate, entregadorId, somentePendentes = false }) {
  const pedidos = await prisma.pedido.findMany({
    where: {
      status: "ENTREGUE",
      entregadorId: entregadorId || { not: null },
      entregueEm: { gte: desde, lte: ate },
      ...(somentePendentes ? { acertoId: null } : {}),
    },
    include: INCLUDE_COMISSAO,
    orderBy: { entregueEm: "asc" },
  });
  return comTabelaPadrao(pedidos);
}

// Quanto o entregador ganha em cada pedido mostrado no app (corridas disponíveis e em andamento).
// Usa o repasse fixo do cadastro do entregador quando não há tabela.
async function ganhoParaApp(pedidos, entregador) {
  if (!pedidos.length) return pedidos;
  const ids = [...new Set(pedidos.map(p => p.comercioId).filter(Boolean))];
  const tabelas = new Map((await prisma.comercio.findMany({ where: { id: { in: ids } }, select: { id: true, tabelaComissao: true } })).map(c => [c.id, c.tabelaComissao]));
  const completos = await comTabelaPadrao(
    pedidos.map(p => ({ ...p, comercio: { ...(p.comercio || {}), tabelaComissao: tabelas.get(p.comercioId) || null }, entregador: { taxaEntrega: entregador.taxaEntrega, veiculoTipo: entregador.veiculoTipo } })),
    entregador
  );
  return pedidos.map((p, i) => {
    const c = comissaoDoPedido(completos[i]);
    return { ...p, ganhoEntregador: c.tipo === "SEM_REGRA" ? null : c.valor, ...kmDaEntrega(p) };
  });
}

// Km da entrega (loja -> cliente): o da rota calculada; sem ele, estimativa pela linha reta × 1,3 (ruas não são retas).
function kmDaEntrega(p) {
  if (p.distanciaKm != null) return { kmEntrega: Number(p.distanciaKm), kmEstimado: false };
  const loja = p.comercio?.enderecos?.[0];
  if (loja?.lat == null || p.latDestino == null) return { kmEntrega: null, kmEstimado: false };
  const rad = g => (g * Math.PI) / 180;
  const h = Math.sin(rad(p.latDestino - loja.lat) / 2) ** 2 + Math.cos(rad(loja.lat)) * Math.cos(rad(p.latDestino)) * Math.sin(rad(p.lngDestino - loja.lng) / 2) ** 2;
  const reta = 2 * 6371 * Math.asin(Math.sqrt(h));
  return { kmEntrega: Number((reta * 1.3).toFixed(1)), kmEstimado: true };
}

module.exports = { r2, moeda, comissaoDoPedido, entregasDoPeriodo, INCLUDE_COMISSAO, tabelasPadrao, esquecerTabelasPadrao, comTabelaPadrao, ganhoParaApp };
