// Roteirização: junta pedidos prontos com entregas próximas numa ROTA, oferecida inteira a um entregador.
//
// Automática (por comércio, em Configurações › Roteirização automática):
//   pedido fica pronto -> espera `rotaEsperaSegundos` (padrão 15 s) sem tocar para os entregadores;
//   no fim da espera, os pedidos que estão esperando são agrupados:
//     - escopo LOJA: só com pedidos da mesma loja;
//     - escopo TODOS: também com pedidos de outras lojas em TODOS, se as lojas estão até `rotaRaioColetaKm`;
//     - as entregas de uma rota ficam até `rotaDistanciaMaxKm` umas das outras; no máximo `rotaMaxPedidos`;
//   quem não combinar com ninguém sai sozinho (como antes).
// Manual: o ADM seleciona pedidos prontos e cria a rota (ou desfaz).
// O entregador aceita (ou recusa) a rota inteira; depois cada entrega segue o fluxo normal, na ordem da rota.
const prisma = require("../lib/prisma");
const { distanciaLinhaRetaKm } = require("../utils/geo");
const { emSegundoPlano } = require("../utils/segundoPlano");

const erroHttp = (status, mensagem) => Object.assign(new Error(mensagem), { status });
const dist = (a, b) => (a && b && a.lat != null && b.lat != null ? distanciaLinhaRetaKm(a, b) : Infinity);
const esperar = ms => new Promise(r => setTimeout(r, ms));
const TRAVA_ROTEIRIZACAO = 734221; // pg_advisory_xact_lock: uma roteirização por vez

async function parametros() {
  const c = await prisma.configuracao.findFirst({ select: { rotaEsperaSegundos: true, rotaMaxPedidos: true, rotaDistanciaMaxKm: true, rotaRaioColetaKm: true } });
  return {
    espera: c?.rotaEsperaSegundos ?? 15, max: c?.rotaMaxPedidos ?? 3,
    distMax: c?.rotaDistanciaMaxKm ?? 3, raioColeta: c?.rotaRaioColetaKm ?? 2,
  };
}

async function novoCodigo() {
  for (;;) {
    const codigo = `R-${Math.floor(10000 + Math.random() * 90000)}`;
    if (!(await prisma.rota.findUnique({ where: { codigo } }))) return codigo;
  }
}

const SELECT_CANDIDATO = {
  id: true, codigo: true, comercioId: true, latDestino: true, lngDestino: true, aguardandoRotaAte: true, createdAt: true,
  comercio: { select: { id: true, nomeFantasia: true, roteirizacaoAutomatica: true, roteirizacaoEscopo: true, enderecos: { where: { principal: true }, take: 1, select: { lat: true, lng: true } } } },
};
const destino = p => (p.latDestino != null ? { lat: p.latDestino, lng: p.lngDestino } : null);
const loja = p => p.comercio?.enderecos?.[0] || null;

// Ordem da rota: coletas (lojas) e depois as entregas pela mais próxima da posição anterior.
function ordenar(pedidos) {
  const lojas = [];
  pedidos.forEach(p => { if (!lojas.some(l => l.id === p.comercioId)) lojas.push({ id: p.comercioId, pos: loja(p) }); });
  let atual = lojas[lojas.length - 1]?.pos;
  const resto = [...pedidos];
  const ordem = [];
  while (resto.length) {
    resto.sort((a, b) => dist(atual, destino(a)) - dist(atual, destino(b)));
    const prox = resto.shift();
    ordem.push(prox);
    atual = destino(prox) || atual;
  }
  return ordem;
}

// Agrupa candidatos (mais antigos primeiro). Devolve { grupos: [[pedido...]], sozinhos: [pedido...] }.
function agrupar(candidatos, { max, distMax, raioColeta }) {
  const lista = [...candidatos].sort((a, b) => new Date(a.aguardandoRotaAte || a.createdAt) - new Date(b.aguardandoRotaAte || b.createdAt));
  const usados = new Set();
  const grupos = [];
  const sozinhos = [];
  const compativel = (a, b) => a.comercioId === b.comercioId
    || (a.comercio.roteirizacaoEscopo === "TODOS" && b.comercio.roteirizacaoEscopo === "TODOS" && dist(loja(a), loja(b)) <= raioColeta);
  for (const semente of lista) {
    if (usados.has(semente.id)) continue;
    usados.add(semente.id);
    const grupo = [semente];
    if (destino(semente)) {
      while (grupo.length < max) {
        let melhor = null, melhorD = Infinity;
        for (const o of lista) {
          if (usados.has(o.id) || !destino(o) || !grupo.every(g => compativel(g, o))) continue;
          const d = Math.min(...grupo.map(g => dist(destino(g), destino(o))));
          if (d <= distMax && d < melhorD) { melhor = o; melhorD = d; }
        }
        if (!melhor) break;
        usados.add(melhor.id);
        grupo.push(melhor);
      }
    }
    if (grupo.length > 1) grupos.push(grupo); else sozinhos.push(semente);
  }
  return { grupos, sozinhos };
}

async function registrarCriacao(rota, pedidos, texto) {
  for (const [i, p] of pedidos.entries()) {
    await prisma.pedidoLog.create({ data: { pedidoId: p.id, texto: `${texto} Rota ${rota.codigo}: entrega ${i + 1} de ${pedidos.length}.` } });
  }
}

// Avisa os entregadores: rota nova (um aviso por rota) e pedidos que saíram sozinhos.
function avisar(rotas, sozinhos) {
  const push = require("./push.service");
  for (const r of rotas) emSegundoPlano(() => push.avisarNovaRota(r.id), "Push rota");
  for (const p of sozinhos) emSegundoPlano(() => push.avisarNovaCorrida(p.id), "Push nova corrida");
}

// Roteiriza os pedidos que estão esperando. Só age se algum já venceu a espera.
// Em transação com trava: duas execuções ao mesmo tempo não montam a mesma rota duas vezes.
async function roteirizar() {
  const prm = await parametros();
  const agora = new Date();
  const resultado = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${TRAVA_ROTEIRIZACAO})`);
    const candidatos = await tx.pedido.findMany({
      where: { aguardandoRotaAte: { not: null }, status: "PENDENTE", entregadorId: null, rotaId: null },
      select: SELECT_CANDIDATO,
    });
    if (!candidatos.some(p => p.aguardandoRotaAte <= agora)) return { rotas: [], sozinhos: [] };
    const { grupos, sozinhos } = agrupar(candidatos, prm);
    const rotas = [];
    for (const g of grupos) {
      const ordem = ordenar(g);
      const rota = await tx.rota.create({ data: { codigo: await novoCodigo(), origem: "AUTOMATICA", criadoPor: "Roteirização automática" } });
      for (const [i, p] of ordem.entries()) {
        await tx.pedido.update({ where: { id: p.id }, data: { rotaId: rota.id, ordemRota: i + 1, aguardandoRotaAte: null } });
      }
      rotas.push({ rota, pedidos: ordem });
    }
    // Quem não combinou: só libera os que já venceram a espera (os outros ainda podem ganhar companhia).
    const liberados = sozinhos.filter(p => p.aguardandoRotaAte <= agora);
    if (liberados.length) await tx.pedido.updateMany({ where: { id: { in: liberados.map(p => p.id) } }, data: { aguardandoRotaAte: null } });
    return { rotas, sozinhos: liberados };
  }, { timeout: 30000 });
  for (const r of resultado.rotas) await registrarCriacao(r.rota, r.pedidos, "Roteirização automática:");
  avisar(resultado.rotas.map(r => r.rota), resultado.sozinhos);
  return { rotas: resultado.rotas.length, sozinhos: resultado.sozinhos.length };
}

// Chamado quando o pedido fica pronto (PENDENTE). true = vai esperar a roteirização (não avisar agora).
async function aoFicarPronto(pedidoId) {
  const p = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { id: true, rotaId: true, entregadorId: true, agendadoPara: true, comercio: { select: { roteirizacaoAutomatica: true } } } });
  if (!p || p.rotaId || p.entregadorId || !p.comercio?.roteirizacaoAutomatica) return false;
  const { espera } = await parametros();
  await prisma.pedido.update({ where: { id: p.id }, data: { aguardandoRotaAte: new Date(Date.now() + espera * 1000) } });
  // Roteiriza quando a espera acabar (no Vercel, waitUntil mantém a função viva até lá).
  emSegundoPlano(async () => { await esperar(espera * 1000 + 300); await roteirizar(); }, "Roteirização automática");
  return true;
}

// Reserva: se a espera de algum pedido já venceu e ninguém roteirizou (ex.: servidor reiniciou), roteiriza agora.
let ultimaVerificacao = 0;
async function roteirizarSeVencido() {
  if (Date.now() - ultimaVerificacao < 3000) return null;
  ultimaVerificacao = Date.now();
  const vencido = await prisma.pedido.findFirst({ where: { aguardandoRotaAte: { lte: new Date() }, status: "PENDENTE", entregadorId: null, rotaId: null }, select: { id: true } });
  return vencido ? roteirizar() : null;
}

// ---------- Manual (ADM) ----------

async function criarRotaManual(pedidoIds, autorNome) {
  const ids = [...new Set((pedidoIds || []).filter(Boolean))];
  if (ids.length < 2) throw erroHttp(400, "Selecione pelo menos 2 pedidos para montar uma rota.");
  const { max } = await parametros();
  if (ids.length > Math.max(max, 10)) throw erroHttp(400, `Uma rota pode ter no máximo ${Math.max(max, 10)} entregas.`);
  const pedidos = await prisma.pedido.findMany({ where: { id: { in: ids } }, select: { ...SELECT_CANDIDATO, status: true, entregadorId: true, rotaId: true } });
  const fora = pedidos.filter(p => p.status !== "PENDENTE" || p.entregadorId || p.rotaId);
  if (pedidos.length !== ids.length || fora.length) {
    throw erroHttp(409, `Só pedidos prontos, sem entregador e fora de outra rota entram numa rota${fora.length ? ` (confira: ${fora.map(p => p.codigo).join(", ")})` : ""}.`);
  }
  const ordem = ordenar(pedidos);
  const rota = await prisma.$transaction(async tx => {
    const r = await tx.rota.create({ data: { codigo: await novoCodigo(), origem: "MANUAL", criadoPor: autorNome } });
    for (const [i, p] of ordem.entries()) {
      const { count } = await tx.pedido.updateMany({
        where: { id: p.id, status: "PENDENTE", entregadorId: null, rotaId: null },
        data: { rotaId: r.id, ordemRota: i + 1, aguardandoRotaAte: null },
      });
      if (!count) throw erroHttp(409, `O pedido ${p.codigo} acabou de mudar. Atualize a tela.`);
    }
    return r;
  });
  await registrarCriacao(rota, ordem, `Rota montada por ${autorNome}.`);
  avisar([rota], []);
  return { ...rota, pedidos: ordem.map((p, i) => ({ id: p.id, codigo: p.codigo, ordem: i + 1 })) };
}

// Tira um pedido da rota (cancelado, atribuído sozinho, voltou para a fila...). Rota não aceita que fica
// com 1 pedido é desfeita (ele volta a ser oferecido sozinho).
async function retirarDaRota(pedidoId, motivo) {
  const p = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { id: true, rotaId: true, rota: { select: { id: true, codigo: true, aceitaEm: true } } } });
  if (!p?.rotaId) return;
  await prisma.pedido.update({ where: { id: p.id }, data: { rotaId: null, ordemRota: null } });
  await prisma.pedidoLog.create({ data: { pedidoId: p.id, texto: `Saiu da rota ${p.rota.codigo}${motivo ? ` (${motivo})` : ""}.` } });
  if (p.rota.aceitaEm) return;
  const restantes = await prisma.pedido.findMany({ where: { rotaId: p.rotaId }, orderBy: { ordemRota: "asc" }, select: { id: true, status: true, entregadorId: true } });
  if (restantes.length >= 2) {
    for (const [i, r] of restantes.entries()) await prisma.pedido.update({ where: { id: r.id }, data: { ordemRota: i + 1 } });
    return;
  }
  await desfazer(p.rotaId, "a rota ficou com uma entrega só");
}

async function desfazer(rotaId, motivo) {
  const pedidos = await prisma.pedido.findMany({ where: { rotaId }, select: { id: true, status: true, entregadorId: true } });
  const rota = await prisma.rota.findUnique({ where: { id: rotaId } });
  await prisma.pedido.updateMany({ where: { rotaId }, data: { rotaId: null, ordemRota: null } });
  for (const p of pedidos) await prisma.pedidoLog.create({ data: { pedidoId: p.id, texto: `Rota ${rota?.codigo || ""} desfeita${motivo ? ` (${motivo})` : ""}.` } });
  // Os que continuam esperando entregador voltam a ser oferecidos um a um.
  avisar([], pedidos.filter(p => p.status === "PENDENTE" && !p.entregadorId));
  return pedidos.length;
}

async function desfazerRota(rotaId, autorNome) {
  const rota = await prisma.rota.findUnique({ where: { id: rotaId }, select: { id: true, aceitaEm: true } });
  if (!rota) throw erroHttp(404, "Rota não encontrada.");
  if (rota.aceitaEm) throw erroHttp(409, "Esta rota já foi aceita por um entregador. Para mudar, use Trocar entregador ou Buscar outro em cada pedido.");
  return { ok: true, pedidos: await desfazer(rotaId, `por ${autorNome}`) };
}

// ---------- Entregador ----------

// Aceite atômico da rota inteira: ou o entregador pega todas as entregas, ou nenhuma.
async function aceitarRota(rotaId, entregador, autor) {
  if (entregador.bloqueado) throw erroHttp(403, "Este entregador está bloqueado.");
  if (entregador.status !== "ATIVO") throw erroHttp(403, "Entregador ainda não está ativo.");
  const pedidos = await prisma.pedido.findMany({ where: { rotaId }, select: { id: true, comercioId: true } });
  if (pedidos.length < 2) throw erroHttp(409, "Esta rota não está mais disponível.");
  const bloqueios = await prisma.comercioEntregadorBloqueio.count({ where: { entregadorId: entregador.id, comercioId: { in: pedidos.map(p => p.comercioId) } } });
  if (bloqueios) throw erroHttp(409, "Esta rota não está mais disponível.");
  const agora = new Date();
  await prisma.$transaction(async tx => {
    const { count } = await tx.pedido.updateMany({
      where: { rotaId, status: "PENDENTE", entregadorId: null },
      data: { entregadorId: entregador.id, status: "ATRIBUIDO", aceitoEm: agora },
    });
    if (count !== pedidos.length) throw erroHttp(409, "Esta rota não está mais disponível.");
    const r = await tx.rota.updateMany({ where: { id: rotaId, aceitaEm: null }, data: { aceitaEm: agora, entregadorId: entregador.id } });
    if (!r.count) throw erroHttp(409, "Esta rota não está mais disponível.");
  });
  const { registrarStatusPedido } = require("./historico.service");
  const { registrarLog } = require("./pedidos.service");
  for (const p of pedidos) {
    await registrarStatusPedido({ pedidoId: p.id, de: "PENDENTE", para: "ATRIBUIDO", entregadorId: entregador.id, autor });
    await registrarLog(p.id, `${entregador.nomeCompleto} aceitou a rota (${pedidos.length} entregas).`);
  }
  return prisma.rota.findUnique({ where: { id: rotaId }, include: { pedidos: { orderBy: { ordemRota: "asc" }, select: { id: true, codigo: true, ordemRota: true, status: true } } } });
}

async function recusarRota(rotaId, entregador) {
  const pedidos = await prisma.pedido.findMany({ where: { rotaId, status: "PENDENTE", entregadorId: null }, select: { id: true } });
  for (const p of pedidos) {
    await prisma.pedidoRecusa.upsert({
      where: { pedidoId_entregadorId: { pedidoId: p.id, entregadorId: entregador.id } },
      create: { pedidoId: p.id, entregadorId: entregador.id }, update: {},
    });
  }
  return { ok: true };
}

// Mudança de status de um pedido em rota (chamado pelo histórico):
//   rota ainda não aceita e o pedido foi para outro caminho (atribuído sozinho, cancelado...) -> sai da rota;
//   rota aceita e o pedido voltou para a fila (Buscar outro entregador) -> sai da rota.
async function aoMudarStatus(pedidoId, de, para) {
  const p = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { rotaId: true, rota: { select: { aceitaEm: true } } } });
  if (!p?.rotaId) return;
  if (!p.rota.aceitaEm && para !== "PENDENTE") return retirarDaRota(pedidoId, para === "CANCELADO" ? "pedido cancelado" : "atribuído separadamente");
  if (p.rota.aceitaEm && ["PENDENTE", "PREPARANDO"].includes(para)) return retirarDaRota(pedidoId, "voltou para a fila");
}

module.exports = {
  aoFicarPronto, roteirizar, roteirizarSeVencido, criarRotaManual, desfazerRota, retirarDaRota,
  aceitarRota, recusarRota, aoMudarStatus, agrupar, ordenar, parametros,
};
