// Integrações: entrada de pedidos por webhook e saída de eventos de status.
const prisma = require("../lib/prisma");
const { PORSLUG, STATUS_TODOS } = require("../integracoes/catalogo");
const { decifrar, novoToken, assinar } = require("../integracoes/cripto");

const TIMEOUT_SAIDA_MS = 5000;

function erroHttp(status, mensagem) {
  const err = new Error(mensagem);
  err.status = status;
  return err;
}

async function obterOuCriar(slug) {
  if (!PORSLUG[slug]) throw erroHttp(404, "Integração não encontrada.");
  const existente = await prisma.integracao.findUnique({ where: { slug } });
  if (existente) return existente;
  return prisma.integracao.upsert({ where: { slug }, update: {}, create: { slug, webhookToken: novoToken() } });
}

// Guarda o evento sem deixar o payload crescer demais.
function registrarEvento(integracaoId, { direcao, tipo, sucesso, mensagem, payload, pedidoId }) {
  let p = payload ?? null;
  if (p && JSON.stringify(p).length > 20000) p = { aviso: "payload grande demais — truncado", inicio: JSON.stringify(p).slice(0, 2000) };
  return prisma.integracaoEvento.create({
    data: { integracaoId, direcao, tipo, sucesso, mensagem: mensagem?.slice(0, 500) || null, payload: p, pedidoId: pedidoId || null },
  });
}

// ---------- Entrada: pedido recebido pelo webhook ----------

function validarEntrada(b) {
  const erros = [];
  if (!b || typeof b !== "object") return ["Envie um JSON no corpo da requisição."];
  if (!b.idExterno) erros.push('"idExterno" (id do pedido na plataforma) é obrigatório.');
  if (!b.loja) erros.push('"loja" (id da loja na plataforma) é obrigatório.');
  if (!b.cliente?.nome) erros.push('"cliente.nome" é obrigatório.');
  if (!b.endereco || (typeof b.endereco === "object" && !b.endereco.rua)) erros.push('"endereco" é obrigatório (texto ou objeto com "rua").');
  if (b.valorEntrega != null && !Number.isFinite(Number(b.valorEntrega))) erros.push('"valorEntrega" deve ser numérico.');
  return erros;
}

function enderecoTexto(e) {
  if (typeof e === "string") return e;
  const linha = [e.rua && `${e.rua}${e.numero ? ", " + e.numero : ""}`, e.complemento, e.bairro, e.cidade].filter(Boolean).join(" - ");
  return e.referencia ? `${linha} (ref.: ${e.referencia})` : linha;
}

// Retorna { status, corpo } para a rota pública responder.
async function receberPedido(token, corpo) {
  const integ = await prisma.integracao.findUnique({ where: { webhookToken: String(token || "") } });
  if (!integ) return { status: 404, corpo: { erro: "Integração não encontrada para este endereço." } };
  const cat = PORSLUG[integ.slug];
  const falhar = async (status, mensagem) => {
    await registrarEvento(integ.id, { direcao: "ENTRADA", tipo: "pedido.recebido", sucesso: false, mensagem, payload: corpo });
    return { status, corpo: { erro: mensagem } };
  };

  if (!integ.ativa) return falhar(403, `A integração ${cat.nome} está pausada no painel.`);
  if (cat.tipo === "saida") return falhar(400, `${cat.nome} só recebe eventos; não aceita pedidos.`);
  const erros = validarEntrada(corpo);
  if (erros.length) return falhar(400, erros.join(" "));

  const idExterno = String(corpo.idExterno);
  const duplicado = await prisma.pedido.findUnique({ where: { integracaoSlug_idExterno: { integracaoSlug: integ.slug, idExterno } } });
  if (duplicado) return { status: 200, corpo: { duplicado: true, pedidoId: duplicado.id, codigo: duplicado.codigo } };

  const loja = await prisma.integracaoLoja.findUnique({ where: { integracaoId_idExterno: { integracaoId: integ.id, idExterno: String(corpo.loja) } } });
  if (!loja) return falhar(422, `A loja "${corpo.loja}" não está vinculada a nenhum comércio nesta integração.`);

  // Import tardio: pedidos.service também usa este módulo (notificação de status).
  const { criarPedido } = require("./pedidos.service");
  const { carimbos, registrarStatusPedido } = require("./historico.service");
  const autor = { autorTipo: "SISTEMA", autorNome: cat.nome };
  let pedido;
  try {
    pedido = await criarPedido({
      comercioId: loja.comercioId,
      clienteNome: String(corpo.cliente.nome),
      clienteTelefone: corpo.cliente.telefone ? String(corpo.cliente.telefone) : null,
      endereco: enderecoTexto(corpo.endereco),
      formaPagamento: corpo.formaPagamento || null,
      prazoDesejado: corpo.prazoDesejado || null,
      observacao: corpo.observacao || null,
      valor: corpo.valorEntrega ?? undefined,
      notaFiscalNumero: corpo.notaFiscal?.numero,
      notaFiscalChave: corpo.notaFiscal?.chave,
      notaFiscalValor: corpo.notaFiscal?.valor,
      integracaoSlug: integ.slug,
      idExterno,
    }, "INTEGRACAO", autor);
  } catch (err) {
    // Dois envios simultâneos do mesmo pedido: o segundo cai na restrição única.
    if (err.code === "P2002") {
      const p = await prisma.pedido.findUnique({ where: { integracaoSlug_idExterno: { integracaoSlug: integ.slug, idExterno } } });
      return { status: 200, corpo: { duplicado: true, pedidoId: p?.id, codigo: p?.codigo } };
    }
    return falhar(err.status || 500, err.message);
  }

  // Liberar para os entregadores já na chegada (opção da integração ou do próprio pedido).
  if (corpo.pronto === true || integ.config?.liberarAutomaticamente) {
    pedido = await prisma.pedido.update({ where: { id: pedido.id }, data: { status: "PENDENTE", ...carimbos(pedido, "PENDENTE") } });
    await registrarStatusPedido({ pedidoId: pedido.id, de: "PREPARANDO", para: "PENDENTE", autor });
  }

  await registrarEvento(integ.id, { direcao: "ENTRADA", tipo: "pedido.recebido", sucesso: true, mensagem: `Pedido ${pedido.codigo} criado.`, payload: corpo, pedidoId: pedido.id });
  return { status: 201, corpo: { pedidoId: pedido.id, codigo: pedido.codigo, status: pedido.status, valorEntrega: pedido.valor, distanciaKm: pedido.distanciaKm } };
}

// ---------- Saída: eventos de status ----------

function eventosDaIntegracao(integ) {
  const cat = PORSLUG[integ.slug];
  return integ.config?.eventos?.length ? integ.config.eventos : cat.eventosPadrao || STATUS_TODOS;
}

function dadosDoPedido(p) {
  return {
    pedidoId: p.id,
    codigo: p.codigo,
    idExterno: p.idExterno,
    integracao: p.integracaoSlug,
    status: p.status,
    comercio: { id: p.comercio?.id, nome: p.comercio?.nomeFantasia },
    cliente: { nome: p.clienteNome },
    endereco: p.endereco,
    distanciaKm: p.distanciaKm,
    valorEntrega: p.valor,
    entregador: p.entregador ? { id: p.entregador.id, nome: p.entregador.nomeCompleto, telefone: p.entregador.telefone, veiculo: p.entregador.veiculoTipo, placa: p.entregador.veiculoPlaca, cpf: p.entregador.cpf } : null,
    horarios: { criado: p.createdAt, pronto: p.prontoEm, aceito: p.aceitoEm, entregue: p.entregueEm, cancelado: p.canceladoEm },
  };
}

// POST assinado para a URL de saída. Registra o resultado; nunca lança erro.
async function enviarWebhook(integ, tipo, dados, pedidoId = null) {
  const cat = PORSLUG[integ.slug];
  const corpo = JSON.stringify({ evento: tipo, integracao: integ.slug, enviadoEm: new Date().toISOString(), dados });
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "RouteDelivery-Webhook/1.0",
    "X-Route-Evento": tipo,
    "X-Route-Assinatura": assinar(corpo, integ.webhookToken),
  };
  try {
    const cred = decifrar(integ.credenciais);
    const campoBearer = cat.campos.find(c => c.bearer && cred[c.nome]);
    if (campoBearer) headers.Authorization = `Bearer ${cred[campoBearer.nome]}`;
  } catch {
    /* credencial ilegível: envia sem Authorization e registra abaixo se falhar */
  }

  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_SAIDA_MS);
  let sucesso = false;
  let mensagem;
  try {
    const r = await fetch(integ.webhookSaidaUrl, { method: "POST", headers, body: corpo, signal: controle.signal });
    sucesso = r.ok;
    mensagem = `HTTP ${r.status}${r.ok ? "" : ` — ${(await r.text().catch(() => "")).slice(0, 200)}`}`;
  } catch (err) {
    mensagem = err.name === "AbortError" ? `Sem resposta em ${TIMEOUT_SAIDA_MS / 1000} s.` : `Falha de conexão: ${err.message}`;
  } finally {
    clearTimeout(timer);
  }
  await registrarEvento(integ.id, { direcao: "SAIDA", tipo, sucesso, mensagem, payload: JSON.parse(corpo), pedidoId }).catch(() => {});
  return { sucesso, mensagem };
}

// Chamado a cada mudança de status (fora da requisição: não atrasa quem mudou o status).
async function notificarStatus(pedidoId, de, para) {
  const integracoes = await prisma.integracao.findMany({ where: { ativa: true, webhookSaidaUrl: { not: null } } });
  if (!integracoes.length) return;
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: { comercio: { select: { id: true, nomeFantasia: true } }, entregador: true },
  });
  if (!pedido) return;

  const alvos = integracoes.filter(i => {
    const cat = PORSLUG[i.slug];
    if (!cat || !eventosDaIntegracao(i).includes(para)) return false;
    // Plataformas de pedidos só recebem o status dos pedidos que vieram delas.
    return cat.tipo === "pedidos" ? pedido.integracaoSlug === i.slug : true;
  });
  await Promise.all(alvos.map(i => enviarWebhook(i, "pedido.status", { ...dadosDoPedido(pedido), statusAnterior: de }, pedido.id)));
}

function agendarNotificacao(pedidoId, de, para) {
  setImmediate(() => notificarStatus(pedidoId, de, para).catch(err => console.error("Webhook de saída:", err.message)));
}

module.exports = { obterOuCriar, registrarEvento, receberPedido, enviarWebhook, agendarNotificacao, eventosDaIntegracao };
