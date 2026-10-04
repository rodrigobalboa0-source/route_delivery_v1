// Preço dinâmico (Cadastros › Preço dinâmico):
//   demanda    -> acréscimo cobrado da LOJA no valor da entrega, gravado no pedido na criação (aparece no cálculo);
//   entregador -> bônus somado ao GANHO do entregador em cada entrega. Fica gravado no pedido (dinamicoEntregador):
//                 ao ligar uma regra, entra na hora em todas as entregas ainda não finalizadas; ao desligar, os
//                 pedidos já lançados mantêm o valor (só os próximos saem sem a regra). Liga/desliga vira pop-up no app.
// Várias regras ativas: os multiplicadores se multiplicam entre si e os valores fixos se somam.
const prisma = require("../lib/prisma");

const r2 = v => Math.round((v + Number.EPSILON) * 100) / 100;
const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const { ABERTOS } = require("../utils/statusPedido");

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
  return prisma.precoDinamicoEntregador.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, tipoAplicacao: true, valor: true } });
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


// Uma regra do entregador foi ligada/criada/alterada (ativa): entra na hora em todas as entregas ainda não
// finalizadas que não têm essa regra. Desligar/excluir NÃO mexe nos pedidos já lançados — eles mantêm o valor;
// só os próximos pedidos saem sem a regra.
async function aplicarEntregadorNasAbertas() {
  const ativas = (await regrasEntregador()) || [];
  if (!ativas.length) return 0;
  const abertos = await prisma.pedido.findMany({ where: { status: { in: ABERTOS } }, select: { id: true, dinamicoEntregador: true } });
  let alterados = 0;
  for (const p of abertos) {
    const atuais = Array.isArray(p.dinamicoEntregador) ? p.dinamicoEntregador : [];
    const novas = ativas.filter(r => !atuais.some(a => (a.id ? a.id === r.id : a.nome === r.nome)));
    if (!novas.length) continue;
    await prisma.pedido.update({ where: { id: p.id }, data: { dinamicoEntregador: [...atuais, ...novas] } });
    alterados++;
  }
  return alterados;
}

// Registra o liga/desliga da regra do entregador (vira pop-up no app de todos os entregadores).
async function registrarEvento(regra, anterior) {
  const ligou = regra?.ativo && !anterior?.ativo;
  const desligou = anterior?.ativo && !regra?.ativo;
  if (!ligou && !desligou) return null;
  const r = regra || anterior;
  return prisma.precoDinamicoEvento.create({
    data: { regraId: r.id, nome: r.nome, tipoAplicacao: r.tipoAplicacao, valor: r.valor, tipo: ligou ? "ATIVADA" : "DESATIVADA" },
  });
}

// Pop-ups ainda não vistos por este entregador (últimas 24 h; um por regra, o mais recente).
async function avisosPara(entregadorId) {
  const desde = new Date(Date.now() - 864e5);
  const [eventos, vistos] = await Promise.all([
    prisma.precoDinamicoEvento.findMany({ where: { createdAt: { gte: desde } }, orderBy: { createdAt: "desc" } }),
    prisma.promocaoAvisoVisto.findMany({ where: { entregadorId, avisoId: { startsWith: "din:" } }, select: { avisoId: true } }),
  ]);
  const jaVistos = new Set(vistos.map(v => v.avisoId));
  const porRegra = new Map();
  for (const ev of eventos) if (!porRegra.has(ev.regraId)) porRegra.set(ev.regraId, ev);
  return [...porRegra.values()].filter(ev => !jaVistos.has(`din:${ev.id}`)).map(ev => ({
    avisoId: `din:${ev.id}`,
    tipo: ev.tipo,
    titulo: ev.tipo === "ATIVADA" ? "⚡ Preço dinâmico ativado!" : "Preço dinâmico encerrado",
    mensagem: ev.tipo === "ATIVADA"
      ? `${ev.nome}: ${ev.tipoAplicacao === "MULTIPLICADOR" ? `seus ganhos x${String(ev.valor).replace(".", ",")}` : `+${brl(ev.valor)}`} por entrega. Já vale para as corridas abertas e as próximas.`
      : `${ev.nome} foi desativado. As corridas que já foram lançadas continuam com o valor; as próximas saem sem o preço dinâmico.`,
  }));
}

module.exports = { calcularDemanda, bonusEntregador, snapshotEntregador, aplicarEntregadorNasAbertas, registrarEvento, avisosPara, textoRegra };
