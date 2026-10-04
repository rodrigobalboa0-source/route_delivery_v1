// Preço dinâmico (Cadastros › Preço dinâmico):
//   demanda    -> acréscimo cobrado da LOJA no valor da entrega, gravado no pedido na criação (aparece no cálculo);
//   entregador -> bônus somado ao GANHO do entregador em cada entrega. Fica gravado no pedido (dinamicoEntregador):
//                 ao ligar uma regra, entra na hora em todas as entregas ainda não finalizadas; ao desligar, sai das
//                 que ainda não foram aceitas (quem já aceitou com o bônus continua com ele).
// Várias regras ativas: os multiplicadores se multiplicam entre si e os valores fixos se somam.
const prisma = require("../lib/prisma");

const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ABERTOS = ["PREPARANDO", "PENDENTE", "ATRIBUIDO", "NA_LOJA", "EM_ROTA", "NO_CLIENTE", "ATRASADO"];

const textoRegra = r => (r.tipoAplicacao === "MULTIPLICADOR" ? `${String(r.valor).replace(".", ",")}x` : `+${brl(r.valor)}`);

// Acréscimo sobre `base` (multiplicadores em cadeia + valores fixos).
function acrescimo(base, regras) {
  const fator = regras.filter(r => r.tipoAplicacao === "MULTIPLICADOR").reduce((f, r) => f * r.valor, 1);
  const fixo = regras.filter(r => r.tipoAplicacao === "VALOR_FIXO").reduce((s, r) => s + r.valor, 0);
  return r2(base * (fator - 1) + fixo);
}

async function regrasDemanda() {
  return prisma.precoDinamicoDemanda.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { nome: true, tipoAplicacao: true, valor: true } });
}
async function regrasEntregador() {
  return prisma.precoDinamicoEntregador.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { nome: true, tipoAplicacao: true, valor: true } });
}

// Cobrado da loja sobre a taxa da entrega: { acrescimo, regras: [{ nome, texto }], descricao }
async function calcularDemanda(valorBase) {
  const regras = await regrasDemanda();
  if (!regras.length || !(valorBase > 0)) return { acrescimo: 0, regras: [], descricao: null };
  const valor = acrescimo(valorBase, regras);
  return {
    acrescimo: valor,
    regras: regras.map(r => ({ nome: r.nome, texto: textoRegra(r) })),
    descricao: regras.map(r => `${r.nome} (${textoRegra(r)})`).join(" + "),
  };
}

// Bônus do entregador sobre o ganho base, pelas regras gravadas no pedido.
function bonusEntregador(ganhoBase, regras) {
  if (!Array.isArray(regras) || !regras.length) return { valor: 0, descricao: null };
  return { valor: acrescimo(ganhoBase || 0, regras), descricao: regras.map(r => `${r.nome} ${textoRegra(r)}`).join(" + ") };
}

// Regras do entregador que valem para um pedido novo (gravadas na criação).
async function snapshotEntregador() {
  const regras = await regrasEntregador();
  return regras.length ? regras : null;
}


// Uma regra do entregador foi ligada, desligada, alterada ou excluída: atualiza as entregas abertas na hora.
//   ainda não aceitas -> passam a ter exatamente as regras ativas agora;
//   já aceitas (em andamento) -> ganham as regras ligadas agora e mantêm as que já tinham (o que o entregador viu).
async function aplicarEntregadorNasAbertas() {
  const ativas = (await regrasEntregador()) || [];
  const { Prisma } = require("@prisma/client");
  const livres = await prisma.pedido.updateMany({
    where: { status: { in: ["PREPARANDO", "PENDENTE"] }, entregadorId: null },
    data: { dinamicoEntregador: ativas.length ? ativas : Prisma.DbNull },
  });
  const chave = r => `${r.nome}|${r.tipoAplicacao}|${r.valor}`;
  const emAndamento = await prisma.pedido.findMany({ where: { status: { in: ABERTOS }, entregadorId: { not: null } }, select: { id: true, dinamicoEntregador: true } });
  let alterados = 0;
  for (const p of emAndamento) {
    const atuais = Array.isArray(p.dinamicoEntregador) ? p.dinamicoEntregador : [];
    const juntas = [...atuais, ...ativas.filter(r => !atuais.some(a => chave(a) === chave(r)))];
    if (juntas.length === atuais.length) continue;
    await prisma.pedido.update({ where: { id: p.id }, data: { dinamicoEntregador: juntas } });
    alterados++;
  }
  return livres.count + alterados;
}

module.exports = { calcularDemanda, bonusEntregador, snapshotEntregador, aplicarEntregadorNasAbertas, textoRegra };
