// Chamada por proximidade: a corrida (ou rota) toca primeiro para o(s) entregador(es) mais perto da loja.
// Se ninguém daquela leva aceitar em `despachoTempoSegundos` (ou todos recusarem), chama os próximos mais perto,
// e assim por diante. Quando todos os que podem pegar já foram chamados, a corrida fica aberta para todos
// (inclusive quem ficar online depois). Só quem já foi chamado vê a corrida em "Disponíveis" e pode aceitar.
// Desligada em Configurações: volta ao jeito antigo (toca para todos de uma vez).
const prisma = require("../lib/prisma");
const { distanciaLinhaRetaKm } = require("../utils/geo");
const { emSegundoPlano } = require("../utils/segundoPlano");

const esperar = ms => new Promise(r => setTimeout(r, ms));
const kmTexto = km => `${String(Number(km.toFixed(1))).replace(".", ",")} km`;

async function parametros() {
  const c = await prisma.configuracao.findFirst({ select: { despachoProximidade: true, despachoPorVez: true, despachoTempoSegundos: true } });
  return { ativo: c?.despachoProximidade ?? true, porVez: c?.despachoPorVez ?? 1, tempo: c?.despachoTempoSegundos ?? 30 };
}

// Grupo oferecido junto: a rota inteira ou o pedido sozinho.
async function carregar({ pedidoId, rotaId }) {
  const { INCLUDE_AVISO } = require("./push.service");
  const where = rotaId ? { rotaId } : { id: pedidoId };
  const pedidos = await prisma.pedido.findMany({ where, orderBy: { ordemRota: "asc" }, include: INCLUDE_AVISO });
  const disponivel = pedidos.length > 0 && (rotaId ? pedidos.length >= 2 : !pedidos[0].rotaId)
    && pedidos.every(p => p.status === "PENDENTE" && !p.entregadorId && !p.aguardandoRotaAte && !p.comercio?.bloqueado);
  return { pedidos, disponivel };
}

function avisar({ pedidoId, rotaId }, somente) {
  const push = require("./push.service");
  return rotaId ? push.avisarNovaRota(rotaId, somente) : push.avisarNovaCorrida(pedidoId, somente);
}

// Começa (ou recomeça) a chamada de uma corrida/rota que acabou de ficar disponível.
async function iniciar(alvo) {
  const { pedidos, disponivel } = await carregar(alvo);
  if (!disponivel) return;
  const ids = pedidos.map(p => p.id);
  const prm = await parametros();
  if (!prm.ativo) {
    await prisma.pedido.updateMany({ where: { id: { in: ids } }, data: { despachoAberto: true, despachoPara: [], despachoOndaEm: new Date() } });
    return avisar(alvo);
  }
  await prisma.pedido.updateMany({ where: { id: { in: ids } }, data: { despachoAberto: false, despachoPara: [], despachoOndaEm: null } });
  return proximaLeva(alvo, null);
}

// Chama a próxima leva (os mais perto da loja que ainda não foram chamados).
// `anterior` = despachoOndaEm lido antes: se outro processo já avançou, este não repete.
async function proximaLeva(alvo, anterior) {
  const { pedidos, disponivel } = await carregar(alvo);
  if (!disponivel || pedidos[0].despachoAberto) return;
  const ids = pedidos.map(p => p.id);
  const prm = await parametros();
  const { entregadoresAptos } = require("./push.service");
  const jaChamados = new Set(pedidos[0].despachoPara);
  const loja = pedidos[0].comercio.enderecos[0];
  const distancia = e => (e.lat != null && loja?.lat != null ? distanciaLinhaRetaKm({ lat: e.lat, lng: e.lng }, { lat: loja.lat, lng: loja.lng }) : Infinity);
  const novos = (await entregadoresAptos(pedidos, { comToken: false }))
    .filter(e => !jaChamados.has(e.id))
    .map(e => ({ e, km: distancia(e) }))
    .sort((a, b) => a.km - b.km);

  const condicao = { id: { in: ids }, despachoAberto: false, despachoOndaEm: anterior };
  if (!novos.length) {
    // Todos que podem pegar já foram chamados: abre para todos (e para quem ficar online depois).
    const { count } = await prisma.pedido.updateMany({ where: condicao, data: { despachoAberto: true, despachoOndaEm: new Date() } });
    if (count && jaChamados.size) await registrar(ids, "Nenhum entregador chamado aceitou: corrida aberta para todos.");
    return;
  }
  const leva = novos.slice(0, prm.porVez);
  const agora = new Date();
  const { count } = await prisma.pedido.updateMany({
    where: condicao,
    data: { despachoPara: [...jaChamados, ...leva.map(x => x.e.id)], despachoOndaEm: agora },
  });
  if (count !== ids.length) return; // outro processo chamou esta leva
  const nomes = leva.map(x => `${x.e.nomeCompleto}${Number.isFinite(x.km) ? ` (${kmTexto(x.km)} da loja)` : ""}`).join(", ");
  await registrar(ids, `${jaChamados.size ? "Ninguém aceitou a tempo: chamando" : "Chamando primeiro o mais perto da loja:"} ${nomes}.`);
  await avisar(alvo, leva.map(x => x.e.id));
  // Passado o tempo da leva sem aceite, chama os próximos (no Vercel, waitUntil mantém a função viva).
  emSegundoPlano(async () => { await esperar(prm.tempo * 1000 + 300); await proximaLeva(alvo, agora); }, "Chamada por proximidade");
}

async function registrar(ids, texto) {
  await prisma.pedidoLog.createMany({ data: ids.map(pedidoId => ({ pedidoId, texto })) }).catch(() => {});
}

// Um entregador recusou: se ninguém da leva atual ainda pode aceitar, chama os próximos já.
async function aoRecusar(alvo) {
  const { pedidos, disponivel } = await carregar(alvo);
  if (!disponivel || pedidos[0].despachoAberto) return;
  const { entregadoresAptos } = require("./push.service");
  const aptos = new Set((await entregadoresAptos(pedidos, { comToken: false })).map(e => e.id));
  if (!pedidos[0].despachoPara.some(id => aptos.has(id))) await proximaLeva(alvo, pedidos[0].despachoOndaEm);
}

// O entregador pode ver/aceitar este pedido agora? Só depois que a chamada começou (despachoOndaEm):
// assim ninguém vê o pedido no instante entre ficar pronto e a chamada decidir quem chama primeiro.
const liberadoPara = (pedido, entregadorId) => (pedido.despachoAberto && !!pedido.despachoOndaEm) || (pedido.despachoPara || []).includes(entregadorId);
const filtroLiberado = entregadorId => ({ OR: [{ despachoAberto: true, despachoOndaEm: { not: null } }, { despachoPara: { has: entregadorId } }] });

// Reserva (consultas de tempo real): levas vencidas que nenhum processo avançou (ex.: servidor reiniciou).
let ultimaVerificacao = 0;
async function avancarVencidos() {
  if (Date.now() - ultimaVerificacao < 3000) return;
  ultimaVerificacao = Date.now();
  const { tempo } = await parametros();
  const vencidos = await prisma.pedido.findMany({
    where: { status: "PENDENTE", entregadorId: null, despachoAberto: false, aguardandoRotaAte: null, despachoOndaEm: { lte: new Date(Date.now() - tempo * 1000 - 2000) } },
    select: { id: true, rotaId: true, despachoOndaEm: true }, take: 50,
  });
  const vistos = new Set();
  for (const p of vencidos) {
    const chave = p.rotaId || p.id;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    await proximaLeva(p.rotaId ? { rotaId: p.rotaId } : { pedidoId: p.id }, p.despachoOndaEm).catch(err => console.error("[despacho]", err.message));
  }
  // Prontos que nunca foram chamados (servidor caiu no meio, ou pedidos de antes desta regra): chama agora.
  const parados = await prisma.pedido.findMany({
    where: { status: "PENDENTE", entregadorId: null, aguardandoRotaAte: null, despachoOndaEm: null, updatedAt: { lte: new Date(Date.now() - 8000) } },
    select: { id: true, rotaId: true }, take: 50,
  });
  for (const p of parados) {
    const chave = p.rotaId || p.id;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    await iniciar(p.rotaId ? { rotaId: p.rotaId } : { pedidoId: p.id }).catch(err => console.error("[despacho]", err.message));
  }
}

module.exports = { iniciar, proximaLeva, aoRecusar, avancarVencidos, liberadoPara, filtroLiberado, parametros };
