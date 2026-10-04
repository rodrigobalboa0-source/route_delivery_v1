// Registros usados pelos relatórios: histórico de status (pedido e entregador),
// carimbos de horário das etapas do pedido e rastro de localização.
const prisma = require("../lib/prisma");
const { distanciaLinhaRetaKm } = require("../utils/geo");
const { COM_ENTREGADOR } = require("../utils/statusPedido");

// Quem está fazendo a ação, a partir da sessão (req.conta) ou do tipo informado.
function autorDe(req) {
  const c = req?.conta;
  if (!c) return { autorTipo: "SISTEMA", autorNome: null };
  return { autorTipo: c.tipo || "ADMIN", autorNome: c.nome || c.email || null };
}

// Campos de horário a gravar quando o pedido muda de `atual` para `para`.
//   prontoEm: só na primeira vez que fica pronto; aceitoEm: a cada aceite (vale o último);
//   entregueEm / canceladoEm: no fim.
//   naLojaEm / saiuEm / noClienteEm: primeira vez em cada etapa do entregador.
function carimbos(atual, para, agora = new Date()) {
  const c = {};
  if (para === "PENDENTE" && !atual?.prontoEm) c.prontoEm = agora;
  if (COM_ENTREGADOR.includes(para) && para !== "ATRASADO" && !COM_ENTREGADOR.includes(atual?.status)) c.aceitoEm = agora;
  if (para === "NA_LOJA" && !atual?.naLojaEm) c.naLojaEm = agora;
  if (para === "EM_ROTA" && !atual?.saiuEm) c.saiuEm = agora;
  if (para === "NO_CLIENTE" && !atual?.noClienteEm) c.noClienteEm = agora;
  if (para === "RETORNANDO" && !atual?.retornandoEm) c.retornandoEm = agora;
  if (para === "ENTREGUE") c.entregueEm = agora;
  if (para === "CANCELADO") c.canceladoEm = agora;
  return c;
}

// Grava a mudança e avisa as integrações com webhook de saída (em segundo plano).
async function registrarStatusPedido({ pedidoId, de = null, para, entregadorId = null, autor }) {
  if (de === para) return null;
  const registro = await prisma.pedidoStatusHistorico.create({
    data: { pedidoId, de, para, entregadorId, autorTipo: autor.autorTipo, autorNome: autor.autorNome },
  });
  // Import tardio: integracoes.service também importa este módulo.
  require("./integracoes.service").agendarNotificacao(pedidoId, de, para);
  // Roteirização: pedido de rota que foi cancelado, atribuído sozinho ou devolvido à fila sai da rota.
  const rotas = require("./rotas.service");
  await rotas.aoMudarStatus(pedidoId, de, para).catch(err => console.error("[rotas]", err.message));
  // Pedido liberado para os entregadores: se a loja usa roteirização automática, espera alguns segundos para
  // juntar outros pedidos; senão, notificação no celular na hora (toca o alarme), depois da resposta.
  if (para === "PENDENTE") {
    // Nenhum entregador vê o pedido até a chamada (por proximidade) começar de novo.
    await prisma.pedido.update({ where: { id: pedidoId }, data: { despachoOndaEm: null, despachoPara: [] } }).catch(() => {});
    require("../utils/segundoPlano").emSegundoPlano(async () => {
      if (!(await rotas.aoFicarPronto(pedidoId))) await require("./despacho.service").iniciar({ pedidoId });
    }, "Push nova corrida");
  }
  await require("./comissaoAutomatica.service").aoMudarStatus(pedidoId, de, para);
  return registro;
}

function registrarStatusEntregador({ entregadorId, tipo, de = null, para, autor }) {
  if (de != null && String(de) === String(para)) return null;
  return prisma.entregadorStatusHistorico.create({
    data: { entregadorId, tipo, de: de == null ? null : String(de), para: String(para), autorTipo: autor.autorTipo, autorNome: autor.autorNome },
  });
}

// Guarda a posição no rastro, ignorando pontos repetidos: só grava se passaram
// 15 s desde o último ponto ou se o entregador andou mais de 30 m.
async function registrarLocalizacao(entregadorId, lat, lng) {
  const ultimo = await prisma.entregadorLocalizacao.findFirst({ where: { entregadorId }, orderBy: { createdAt: "desc" } });
  if (ultimo) {
    const segundos = (Date.now() - ultimo.createdAt.getTime()) / 1000;
    const metros = distanciaLinhaRetaKm({ lat: ultimo.lat, lng: ultimo.lng }, { lat, lng }) * 1000;
    if (segundos < 15 && metros < 30) return null;
  }
  return prisma.entregadorLocalizacao.create({ data: { entregadorId, lat, lng } });
}

module.exports = { autorDe, carimbos, registrarStatusPedido, registrarStatusEntregador, registrarLocalizacao };
