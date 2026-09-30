// Conector iFood (Order API) — entrega própria feita pelos entregadores da Route Delivery.
//
// Entrada: eventos do iFood chegam pelo webhook (assinado com o Client Secret) e, de reserva, pelo polling.
//   PLC (pedido feito)       -> busca o pedido; se for DELIVERY com entrega pela loja (deliveredBy MERCHANT),
//                               cria a entrega no comércio vinculado à loja (Integrações › iFood › Lojas).
//                               Opcional: confirma o pedido no iFood (config.confirmarAutomaticamente).
//   CAN (cancelado)          -> cancela a entrega aqui (se ainda não foi entregue).
//   DELIVERY_DROP_CODE_REQUESTED -> o entregador precisa digitar o código de entrega do cliente para finalizar.
// Saída: quando a entrega fica "Em rota" -> dispatch no iFood; ao finalizar com código -> verifyDeliveryCode.
const prisma = require("../lib/prisma");
const ifood = require("../integracoes/ifood");
const { obterOuCriar, registrarEvento } = require("./integracoes.service");

const SLUG = "ifood";
const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const codigoDe = e => String(e?.fullCode || e?.code || "").toUpperCase();
const eh = (e, ...codigos) => codigos.includes(codigoDe(e)) || codigos.includes(String(e?.code || "").toUpperCase());

// ---------- Leitura do pedido do iFood ----------

function enderecoIfood(a = {}) {
  const linha = [a.streetName && `${a.streetName}${a.streetNumber ? `, ${a.streetNumber}` : ""}`, a.neighborhood].filter(Boolean).join(" - ");
  const cidade = [a.city, a.state].filter(Boolean).join(" - ");
  return [linha, cidade].filter(Boolean).join(", ") || a.formattedAddress || "";
}

const NOMES_PAGAMENTO = { CREDIT: "Crédito", DEBIT: "Débito", CASH: "Dinheiro", MEAL_VOUCHER: "Vale-refeição", FOOD_VOUCHER: "Vale-alimentação", PIX: "Pix", DIGITAL_WALLET: "Carteira digital", GIFT_CARD: "Vale-presente" };

function pagamentoIfood(p = {}) {
  const metodos = Array.isArray(p.methods) ? p.methods : [];
  const naEntrega = metodos.filter(m => String(m.type).toUpperCase() === "OFFLINE");
  if (!naEntrega.length) return "Pago online (iFood) — nada a cobrar";
  const partes = naEntrega.map(m => {
    const nome = NOMES_PAGAMENTO[String(m.method).toUpperCase()] || m.method || "Pagamento";
    if (String(m.method).toUpperCase() === "CASH") {
      const troco = Number(m.cash?.changeFor || 0);
      return `Dinheiro ${brl(m.value)}${troco > Number(m.value || 0) ? ` — levar troco para ${brl(troco)}` : " — sem troco"}`;
    }
    return `${nome}${m.card?.brand ? ` ${m.card.brand}` : ""} na entrega ${brl(m.value)} (levar maquininha)`;
  });
  return `Cobrar do cliente: ${partes.join(" + ")}`;
}

// Converte o pedido do iFood nos dados de criarPedido. Devolve { ignorar: "motivo" } quando não é para nós.
function dadosDaEntrega(o) {
  const tipo = String(o.orderType || "").toUpperCase();
  if (tipo && tipo !== "DELIVERY") return { ignorar: `Pedido ${tipo === "TAKEOUT" ? "para retirar" : tipo} — não tem entrega.` };
  const d = o.delivery || {};
  if (String(d.deliveredBy || "").toUpperCase() === "IFOOD") return { ignorar: "Entrega feita pelo iFood (não é entrega própria)." };
  const a = d.deliveryAddress || {};
  const endereco = enderecoIfood(a);
  if (!endereco) return { ignorar: "Pedido sem endereço de entrega." };
  const lat = Number(a.coordinates?.latitude), lng = Number(a.coordinates?.longitude);
  const fone = o.customer?.phone || {};
  const localizador = fone.localizer ? `Telefone iFood ${fone.number || ""} — código localizador ${fone.localizer}` : null;
  const obs = [d.observations && `Obs. do cliente: ${d.observations}`, localizador].filter(Boolean).join(" · ");
  const agendado = String(o.orderTiming || "").toUpperCase() === "SCHEDULED" && o.schedule?.deliveryDateTimeStart
    ? new Date(new Date(o.schedule.deliveryDateTimeStart).getTime() - 20 * 60000) : null;
  return {
    clienteNome: o.customer?.name || "Cliente iFood",
    clienteTelefone: fone.number || null,
    endereco,
    complemento: [a.complement, a.reference && `ref.: ${a.reference}`].filter(Boolean).join(" · ") || null,
    destino: Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null,
    // Sem coordenadas: o CEP localiza o cliente aproximadamente (para o km e o mapa do entregador).
    cepBusca: /\d{5}-?\d{3}/.test(String(a.postalCode || "")) ? [a.postalCode, a.city, a.state].filter(Boolean).join(", ") : null,
    formaPagamento: pagamentoIfood(o.payments),
    observacao: obs || null,
    codigoExterno: o.displayId ? `iFood #${o.displayId}` : null,
    agendadoPara: agendado && agendado.getTime() > Date.now() + 2 * 60000 ? agendado.toISOString() : null,
  };
}

// ---------- Processamento dos eventos ----------

async function jaProcessado(evento) {
  if (!evento?.id) return false;
  try {
    await prisma.integracaoEventoRecebido.create({ data: { id: String(evento.id), slug: SLUG } });
    return false;
  } catch (err) {
    if (err.code === "P2002") return true;
    throw err;
  }
}

async function pedidoDaEntrega(orderId) {
  return prisma.pedido.findUnique({ where: { integracaoSlug_idExterno: { integracaoSlug: SLUG, idExterno: String(orderId) } } });
}

async function aoPedidoNovo(integ, evento) {
  const orderId = String(evento.orderId);
  if (await pedidoDaEntrega(orderId)) return "Pedido já recebido.";
  const loja = await prisma.integracaoLoja.findUnique({ where: { integracaoId_idExterno: { integracaoId: integ.id, idExterno: String(evento.merchantId) } } });
  if (!loja) throw Object.assign(new Error(`Loja iFood ${evento.merchantId} não está vinculada a nenhum comércio.`), { registrar: true });

  const o = await ifood.obterPedidoIfood(orderId);
  const { cepBusca, ...dados } = dadosDaEntrega(o);
  if (dados.ignorar) return dados.ignorar;
  if (!dados.destino && cepBusca) {
    dados.destinoAprox = await require("../utils/geo").geocodificarEndereco(cepBusca).catch(() => null);
  }

  const { criarPedido } = require("./pedidos.service");
  const { carimbos, registrarStatusPedido } = require("./historico.service");
  const autor = { autorTipo: "SISTEMA", autorNome: "iFood" };
  let pedido;
  try {
    pedido = await criarPedido({ ...dados, comercioId: loja.comercioId, integracaoSlug: SLUG, idExterno: orderId }, "INTEGRACAO", autor);
  } catch (err) {
    if (err.code === "P2002") return "Pedido já recebido.";
    throw err;
  }
  let msg = `Entrega ${pedido.codigo} criada (${dados.codigoExterno || orderId}).`;

  // Confirmação automática: ligada por padrão (o iFood cancela pedidos não confirmados em 8 minutos).
  if (integ.config?.confirmarAutomaticamente !== false) {
    const r = await ifood.confirmarPedidoIfood(orderId).catch(e => ({ ok: false, dados: { message: e.message } }));
    msg += r.ok ? " Pedido confirmado no iFood." : ` Não confirmou no iFood: ${ifood.mensagemIfood(r)}.`;
    await prisma.pedidoLog.create({ data: { pedidoId: pedido.id, texto: r.ok ? "Pedido confirmado no iFood." : `Falha ao confirmar no iFood: ${ifood.mensagemIfood(r)}` } });
  }
  if (integ.config?.liberarAutomaticamente && pedido.status === "PREPARANDO" && !pedido.agendadoPara) {
    pedido = await prisma.pedido.update({ where: { id: pedido.id }, data: { status: "PENDENTE", ...carimbos(pedido, "PENDENTE") } });
    await registrarStatusPedido({ pedidoId: pedido.id, de: "PREPARANDO", para: "PENDENTE", autor });
  }
  await prisma.notificacao.create({ data: { tipo: "pedido", texto: `Novo pedido do iFood (${dados.codigoExterno || orderId}) para ${dados.clienteNome}.` } }).catch(() => {});
  return { mensagem: msg, pedidoId: pedido.id };
}

async function aoCancelado(evento) {
  const p = await pedidoDaEntrega(evento.orderId);
  if (!p) return "Cancelado no iFood (entrega não existia aqui).";
  if (["ENTREGUE", "CANCELADO"].includes(p.status)) return `Cancelado no iFood; entrega já estava ${p.status === "ENTREGUE" ? "entregue" : "cancelada"}.`;
  const { carimbos, registrarStatusPedido } = require("./historico.service");
  await prisma.pedido.update({ where: { id: p.id }, data: { status: "CANCELADO", ...carimbos(p, "CANCELADO") } });
  await registrarStatusPedido({ pedidoId: p.id, de: p.status, para: "CANCELADO", autor: { autorTipo: "SISTEMA", autorNome: "iFood" } });
  const motivo = evento.metadata?.CANCEL_REASON || evento.metadata?.reason || evento.metadata?.cancelReason || "";
  await prisma.pedidoLog.create({ data: { pedidoId: p.id, texto: `Pedido cancelado no iFood${motivo ? ` — ${motivo}` : ""}.` } });
  await prisma.notificacao.create({ data: { tipo: "pedido", texto: `Pedido ${p.codigoExterno || p.codigo} foi cancelado no iFood${p.entregadorId ? " — avise o entregador" : ""}.` } }).catch(() => {});
  return { mensagem: `Entrega ${p.codigo} cancelada.`, pedidoId: p.id };
}

async function aoCodigoEntregaPedido(evento) {
  const p = await pedidoDaEntrega(evento.orderId);
  if (!p) return "Pedido de código de entrega para entrega inexistente.";
  if (!p.exigeCodigoEntrega) {
    await prisma.pedido.update({ where: { id: p.id }, data: { exigeCodigoEntrega: true } });
    await prisma.pedidoLog.create({ data: { pedidoId: p.id, texto: "iFood pede o código de entrega: o entregador digita o código informado pelo cliente para finalizar." } });
  }
  return { mensagem: `Entrega ${p.codigo}: código de entrega exigido.`, pedidoId: p.id };
}

// Processa uma lista de eventos (webhook ou polling). Devolve um resumo.
async function processarEventos(eventos, origem = "webhook") {
  const integ = await obterOuCriar(SLUG);
  const resumo = { recebidos: eventos.length, novos: 0, ignorados: 0, erros: 0 };
  for (const e of eventos) {
    if (!e || !e.orderId) { resumo.ignorados++; continue; }
    if (await jaProcessado(e)) { resumo.ignorados++; continue; }
    const codigo = codigoDe(e);
    let r = null;
    try {
      if (!integ.ativa) r = "Integração pausada no painel — evento ignorado.";
      else if (eh(e, "PLC", "PLACED")) r = await aoPedidoNovo(integ, e);
      else if (eh(e, "CAN", "CANCELLED", "CANCELED")) r = await aoCancelado(e);
      else if (codigo.includes("DELIVERY_DROP_CODE_REQUESTED")) r = await aoCodigoEntregaPedido(e);
      else { resumo.ignorados++; continue; } // demais eventos (confirmado, pronto, concluído...) só servem de informação
      if (typeof r === "object" && r?.pedidoId) resumo.novos++;
      await registrarEvento(integ.id, {
        direcao: "ENTRADA", tipo: `ifood.${codigo.toLowerCase()}`, sucesso: true,
        mensagem: `${typeof r === "string" ? r : r.mensagem} (${origem})`, payload: e, pedidoId: r?.pedidoId,
      });
    } catch (err) {
      resumo.erros++;
      // Libera o evento para tentar de novo no próximo polling.
      await prisma.integracaoEventoRecebido.delete({ where: { id: String(e.id) } }).catch(() => {});
      await registrarEvento(integ.id, { direcao: "ENTRADA", tipo: `ifood.${codigo.toLowerCase()}`, sucesso: false, mensagem: `${err.message} (${origem})`, payload: e }).catch(() => {});
    }
  }
  return resumo;
}

// ---------- Polling de reserva ----------

let ultimoPolling = 0;
async function sincronizar({ forcar = false } = {}) {
  if (!forcar && Date.now() - ultimoPolling < 30000) return null;
  ultimoPolling = Date.now();
  const integ = await prisma.integracao.findUnique({ where: { slug: SLUG }, include: { lojas: true } });
  if (!integ?.credenciais || !integ.lojas.length) return null;
  // Pausada: não busca (para não confirmar ao iFood eventos que seriam ignorados).
  if (!integ.ativa) return forcar ? { recebidos: 0, novos: 0, ignorados: 0, erros: 0, aviso: "Ative a integração para receber os pedidos." } : null;
  const eventos = await ifood.buscarEventosIfood(integ.lojas.map(l => l.idExterno));
  const resumo = await processarEventos(eventos, "polling");
  // Confirma o recebimento dos eventos (os que deram erro voltam no próximo polling).
  if (eventos.length) await ifood.confirmarRecebimentoEventos(eventos.map(e => e.id).filter(Boolean)).catch(() => {});
  if (Math.random() < 0.02) await prisma.integracaoEventoRecebido.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 864e5) } } }).catch(() => {});
  return resumo;
}

// ---------- Saída: status da entrega -> iFood ----------

// Etapas a partir de "saiu para entrega": ao chegar em qualquer uma (mesmo pulando etapas pelo painel),
// avisa o dispatch ao iFood uma única vez — é depois dele que o iFood pode pedir o código de entrega.
const SAIU_OU_DEPOIS = ["EM_ROTA", "NO_CLIENTE", "ENTREGUE"];

async function aoMudarStatus(pedidoId, de, para) {
  if (!SAIU_OU_DEPOIS.includes(para) || SAIU_OU_DEPOIS.includes(de)) return;
  const p = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { id: true, integracaoSlug: true, idExterno: true } });
  if (p?.integracaoSlug !== SLUG || !p.idExterno) return;
  const integ = await obterOuCriar(SLUG);
  const jaAvisado = await prisma.integracaoEvento.findFirst({ where: { integracaoId: integ.id, pedidoId: p.id, tipo: "ifood.dispatch", sucesso: true } });
  if (jaAvisado) return;
  const r = await ifood.despacharPedidoIfood(p.idExterno).catch(err => ({ ok: false, dados: { message: err.message } }));
  const msg = r.ok ? "iFood avisado: pedido saiu para entrega." : `Falha ao avisar a saída no iFood: ${ifood.mensagemIfood(r)}`;
  await prisma.pedidoLog.create({ data: { pedidoId: p.id, texto: msg } }).catch(() => {});
  await registrarEvento(integ.id, { direcao: "SAIDA", tipo: "ifood.dispatch", sucesso: !!r.ok, mensagem: msg, pedidoId: p.id }).catch(() => {});
}

// Finalizar pelo app com o código que o cliente informou. Lança erro 422 se o iFood recusar.
async function validarCodigoEntrega(pedido, codigo) {
  const c = String(codigo || "").replace(/\s/g, "");
  if (!c) throw Object.assign(new Error("Peça ao cliente o código de entrega do iFood e digite para finalizar."), { status: 422, extra: { codigo: "CODIGO_ENTREGA" } });
  const r = await ifood.verificarCodigoEntregaIfood(pedido.idExterno, c);
  const integ = await obterOuCriar(SLUG);
  await registrarEvento(integ.id, { direcao: "SAIDA", tipo: "ifood.verifyDeliveryCode", sucesso: !!r.ok, mensagem: r.ok ? "Código de entrega aceito." : ifood.mensagemIfood(r), pedidoId: pedido.id }).catch(() => {});
  if (!r.ok) throw Object.assign(new Error(r.status >= 500 ? "O iFood não respondeu. Tente de novo em instantes." : "Código de entrega incorreto. Confira com o cliente."), { status: 422, extra: { codigo: "CODIGO_ENTREGA" } });
}

// Antes de finalizar: o aviso "exige código" chega pouco depois do dispatch. Se ainda não chegou pelo webhook,
// busca os eventos pendentes agora e relê o pedido.
async function atualizarAntesDeFinalizar(pedido) {
  if (pedido.integracaoSlug !== SLUG || pedido.exigeCodigoEntrega) return pedido;
  await sincronizar({ forcar: true }).catch(() => {});
  return (await prisma.pedido.findUnique({ where: { id: pedido.id } })) || pedido;
}

module.exports = { processarEventos, sincronizar, aoMudarStatus, validarCodigoEntrega, dadosDaEntrega, atualizarAntesDeFinalizar };
