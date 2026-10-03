// "Algo mudou?" — consulta leve que o painel e o app fazem a cada ~2 s enquanto a tela está visível.
// Devolve uma "versão" por assunto; a tela só busca os dados de novo quando a versão daquele assunto muda.
// Também roda as rotinas automáticas: liberar agendados e fechar o ranking semanal.
// (O entregador só fica offline quando ele mesmo clica no botão — não há mais offline automático.)
const prisma = require("../lib/prisma");
const { registrarStatusEntregador, registrarStatusPedido, carimbos } = require("./historico.service");

const SEM_SINAL_MS = 2 * 60 * 1000;
let ultimaLimpeza = 0;

const v = (...partes) => partes.map(p => (p instanceof Date ? p.getTime() : p == null ? "-" : String(p))).join(".");

// DESATIVADO (a pedido do cliente: offline só pelo botão). Mantido para uso manual/diagnóstico.
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

// Pedidos agendados cuja hora chegou: passam para "Pedido pronto" e os entregadores são chamados.
// Roda junto das consultas de tempo real (painel, app e loja consultam a cada ~2 s), no máximo a cada 5 s
// (consulta leve: índice parcial só com os agendados ainda "Criado").
let ultimaLiberacao = 0;
async function liberarAgendados() {
  if (Date.now() - ultimaLiberacao < 5000) return;
  ultimaLiberacao = Date.now();
  const vencidos = await prisma.pedido.findMany({
    where: { status: "PREPARANDO", agendadoPara: { lte: new Date() } }, select: { id: true, status: true, prontoEm: true }, take: 50,
  });
  for (const p of vencidos) {
    const { count } = await prisma.pedido.updateMany({
      where: { id: p.id, status: "PREPARANDO" }, data: { status: "PENDENTE", ...carimbos(p, "PENDENTE") },
    });
    if (!count) continue; // alguém mexeu no pedido enquanto isso
    await registrarStatusPedido({ pedidoId: p.id, de: "PREPARANDO", para: "PENDENTE", autor: { autorTipo: "SISTEMA", autorNome: "Agendamento" } }).catch(() => {});
    await prisma.pedidoLog.create({ data: { pedidoId: p.id, texto: "Horário agendado chegou — pedido liberado para os entregadores." } }).catch(() => {});
  }
}

async function rotinas() {
  await Promise.all([
    liberarAgendados().catch(err => console.error("[tempo-real] agendados:", err.message)),
    // Roteirização automática: espera vencida que ninguém processou (reserva do agendamento de 15 s).
    require("./rotas.service").roteirizarSeVencido().catch(err => console.error("[tempo-real] rotas:", err.message)),
    // Chamada por proximidade: leva vencida sem aceite que ninguém avançou (reserva do agendamento).
    require("./despacho.service").avancarVencidos().catch(err => console.error("[tempo-real] despacho:", err.message)),
    require("./ranking.service").fecharSemanaAnterior().catch(err => console.error("[tempo-real] ranking:", err.message)),
    // iFood: busca de reserva dos pedidos (o principal é o webhook), no máximo a cada 30 s.
    require("./ifood.service").sincronizar().catch(err => console.error("[tempo-real] ifood:", err.message)),
  ]);
}

// Painel ADM: pedidos, entregadores (status/posição), notificações e mensagens.
async function versaoPainel() {
  await rotinas();
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
  await rotinas();
  const [r] = await prisma.$queryRaw`SELECT
    (SELECT max("updatedAt") FROM "Pedido" WHERE status = 'PENDENTE' AND "entregadorId" IS NULL) AS "dispMax",
    (SELECT count(*)::int FROM "Pedido" WHERE status = 'PENDENTE' AND "entregadorId" IS NULL) AS "dispQtd",
    (SELECT max("updatedAt") FROM "Pedido" WHERE "entregadorId" = ${entregadorId}) AS "meusMax",
    (SELECT "updatedAt" FROM "Entregador" WHERE id = ${entregadorId}) AS "eu",
    (SELECT max("createdAt") FROM "PromocaoEvento") AS "promoMax",
    (SELECT max("createdAt") FROM "ComissaoManual" WHERE "entregadorId" = ${entregadorId}) AS "comissaoMax",
    (SELECT max(m."createdAt") FROM "Mensagem" m JOIN "Conversa" c ON c.id = m."conversaId" WHERE c."entregadorId" = ${entregadorId}) AS "msgMax",
    (SELECT max("entregueEm") FROM "Pedido" WHERE status = 'ENTREGUE') AS "rankingMax"`;
  return {
    ranking: v(r.rankingMax),
    disponiveis: v(r.dispMax, r.dispQtd),
    meus: v(r.meusMax),
    eu: v(r.eu),
    avisos: v(r.promoMax, r.comissaoMax),
    mensagens: v(r.msgMax),
  };
}

// Sistema do comerciante: os pedidos da loja, a posição dos entregadores com pedidos dela e as mensagens.
async function versaoComercio(comercioId) {
  await rotinas();
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

module.exports = { versaoPainel, versaoEntregador, versaoComercio, desligarSemSinal, liberarAgendados, SEM_SINAL_MS };
