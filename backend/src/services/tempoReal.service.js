// "Algo mudou?" — consulta leve que o painel e o app fazem a cada ~2 s enquanto a tela está visível.
// Devolve uma "versão" por assunto; a tela só busca os dados de novo quando a versão daquele assunto muda.
// Também desliga automaticamente o entregador que ficou sem sinal do app (fechou o app, sem internet...).
const prisma = require("../lib/prisma");
const { registrarStatusEntregador } = require("./historico.service");

const SEM_SINAL_MS = 2 * 60 * 1000; // sem posição nem "sinal de vida" por 2 min -> offline
let ultimaLimpeza = 0;

const v = (...partes) => partes.map(p => (p instanceof Date ? p.getTime() : p == null ? "-" : String(p))).join(".");

// Entregadores online sem sinal há mais de 2 min viram offline (fica no histórico como "Sistema").
async function desligarSemSinal() {
  if (Date.now() - ultimaLimpeza < 20000) return; // no máximo a cada 20 s por servidor
  ultimaLimpeza = Date.now();
  const limite = new Date(Date.now() - SEM_SINAL_MS);
  const parados = await prisma.entregador.findMany({
    where: { online: true, updatedAt: { lt: limite }, OR: [{ localizacaoEm: null }, { localizacaoEm: { lt: limite } }] },
    select: { id: true },
  });
  if (!parados.length) return;
  const { count } = await prisma.entregador.updateMany({ where: { id: { in: parados.map(p => p.id) }, online: true }, data: { online: false } });
  if (count) {
    await Promise.all(parados.map(p => registrarStatusEntregador({
      entregadorId: p.id, tipo: "ONLINE", de: "ONLINE", para: "OFFLINE", autor: { autorTipo: "SISTEMA", autorNome: "Sem sinal do app por 2 min" },
    }).catch(() => {})));
  }
}

// Painel ADM: pedidos, entregadores (status/posição), notificações e mensagens.
async function versaoPainel() {
  await desligarSemSinal().catch(err => console.error("[tempo-real] limpeza:", err.message));
  const [r] = await prisma.$queryRaw`SELECT
    (SELECT max("updatedAt") FROM "Pedido") AS "pedidoMax", (SELECT count(*)::int FROM "Pedido") AS "pedidoQtd",
    (SELECT max("updatedAt") FROM "Entregador") AS "entregadorMax", (SELECT count(*)::int FROM "Entregador") AS "entregadorQtd",
    (SELECT max("localizacaoEm") FROM "Entregador" WHERE online) AS "posicaoMax",
    (SELECT max("createdAt") FROM "Notificacao") AS "notifMax", (SELECT count(*)::int FROM "Notificacao" WHERE NOT lida) AS "notifNaoLidas",
    (SELECT max("createdAt") FROM "Mensagem") AS "msgMax", (SELECT count(*)::int FROM "Conversa" WHERE "naoLida") AS "conversasNaoLidas"`;
  return {
    pedidos: v(r.pedidoMax, r.pedidoQtd),
    entregadores: v(r.entregadorMax, r.entregadorQtd, r.posicaoMax),
    notificacoes: v(r.notifMax, r.notifNaoLidas),
    mensagens: v(r.msgMax, r.conversasNaoLidas),
  };
}

// App do entregador: corridas disponíveis, suas entregas, a própria conta, pop-ups e mensagens.
async function versaoEntregador(entregadorId) {
  await desligarSemSinal().catch(() => {});
  const [r] = await prisma.$queryRaw`SELECT
    (SELECT max("updatedAt") FROM "Pedido" WHERE status = 'PENDENTE' AND "entregadorId" IS NULL) AS "dispMax",
    (SELECT count(*)::int FROM "Pedido" WHERE status = 'PENDENTE' AND "entregadorId" IS NULL) AS "dispQtd",
    (SELECT max("updatedAt") FROM "Pedido" WHERE "entregadorId" = ${entregadorId}) AS "meusMax",
    (SELECT "updatedAt" FROM "Entregador" WHERE id = ${entregadorId}) AS "eu",
    (SELECT max("createdAt") FROM "PromocaoEvento") AS "promoMax",
    (SELECT max("createdAt") FROM "ComissaoManual" WHERE "entregadorId" = ${entregadorId}) AS "comissaoMax",
    (SELECT max(m."createdAt") FROM "Mensagem" m JOIN "Conversa" c ON c.id = m."conversaId" WHERE c."entregadorId" = ${entregadorId}) AS "msgMax"`;
  return {
    disponiveis: v(r.dispMax, r.dispQtd),
    meus: v(r.meusMax),
    eu: v(r.eu),
    avisos: v(r.promoMax, r.comissaoMax),
    mensagens: v(r.msgMax),
  };
}

// Sistema do comerciante: os pedidos da loja, a posição dos entregadores com pedidos dela e as mensagens.
async function versaoComercio(comercioId) {
  await desligarSemSinal().catch(() => {});
  const [r] = await prisma.$queryRaw`SELECT
    (SELECT max("updatedAt") FROM "Pedido" WHERE "comercioId" = ${comercioId}) AS "pedidoMax",
    (SELECT count(*)::int FROM "Pedido" WHERE "comercioId" = ${comercioId}) AS "pedidoQtd",
    (SELECT max(e."localizacaoEm") FROM "Entregador" e JOIN "Pedido" p ON p."entregadorId" = e.id
      WHERE p."comercioId" = ${comercioId} AND p.status IN ('ATRIBUIDO','NA_LOJA','EM_ROTA','NO_CLIENTE','ATRASADO')) AS "posicaoMax",
    (SELECT concat(max("createdAt"), '|', max("pagaEm"), '|', count(*), '|', count(*) FILTER (WHERE paga)) FROM "Fatura" WHERE "comercioId" = ${comercioId}) AS "faturaMax",
    (SELECT max(m."createdAt") FROM "Mensagem" m JOIN "Conversa" c ON c.id = m."conversaId" WHERE c."comercioId" = ${comercioId}) AS "msgMax"`;
  return {
    pedidos: v(r.pedidoMax, r.pedidoQtd),
    entregadores: v(r.posicaoMax),
    faturas: v(r.faturaMax),
    mensagens: v(r.msgMax),
  };
}

module.exports = { versaoPainel, versaoEntregador, versaoComercio, desligarSemSinal, SEM_SINAL_MS };
