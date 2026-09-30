// Regras de pedido compartilhadas entre o painel ADM, o sistema do comerciante
// e o app do entregador — assim os três seguem exatamente o mesmo fluxo:
//   PREPARANDO (Criado) -> (comércio marca pronto) -> PENDENTE (Pedido pronto) -> (entregador aceita) -> ATRIBUIDO
//   -> NA_LOJA -> EM_ROTA -> NO_CLIENTE -> ENTREGUE  (ver utils/statusPedido.js)
const prisma = require("../lib/prisma");
const { geocodificarEndereco, calcularDistanciaRotaKm, calcularValorEntrega } = require("../utils/geo");
const { registrarStatusPedido } = require("./historico.service");

const INCLUDE_PADRAO = {
  comercio: {
    select: {
      id: true, nomeFantasia: true, telefone: true,
      // Endereço de coleta = endereço principal do comércio.
      enderecos: { where: { principal: true }, take: 1, select: { rua: true, numero: true, bairro: true, cidade: true } },
    },
  },
  entregador: { select: { id: true, nomeCompleto: true, telefone: true, veiculoTipo: true, fotoUrl: true } },
};

const ORIGENS = {
  PAINEL_ADMIN: "painel ADM",
  SISTEMA_COMERCIANTE: "sistema do comerciante",
  APP_COMERCIANTE: "app do comerciante",
  INTEGRACAO: "integração",
};

function erroHttp(status, mensagem) {
  const err = new Error(mensagem);
  err.status = status;
  return err;
}

async function gerarCodigoPedido() {
  const numero = Math.floor(10000 + Math.random() * 90000);
  const codigo = `PD-${numero}`;
  const existe = await prisma.pedido.findUnique({ where: { codigo } });
  return existe ? gerarCodigoPedido() : codigo;
}

async function registrarLog(pedidoId, texto) {
  await prisma.pedidoLog.create({ data: { pedidoId, texto } });
}

async function carregarComercioComOrigem(comercioId) {
  const comercio = await prisma.comercio.findUnique({
    where: { id: comercioId },
    include: { enderecos: true, precificacoesModal: { include: { tabelaPrecoKm: true } } },
  });
  if (!comercio) throw erroHttp(404, "Comércio não encontrado.");
  const origem = comercio.enderecos.find(e => e.principal) || comercio.enderecos[0] || null;
  return { comercio, origem };
}

// O cliente normalmente digita só rua/número/bairro: completa com a cidade do comércio.
// Endereço já completo (termina com o estado, " - SP", ou tem CEP — como os da busca) fica como está.
function enderecoComCidade(endereco, origem) {
  const t = String(endereco).trim();
  if (/[-,]\s*[A-Z]{2}\s*$/.test(t) || /\b\d{5}-?\d{3}\b/.test(t)) return t;
  const cidade = origem?.cidade && !t.toLowerCase().includes(origem.cidade.toLowerCase()) ? `, ${origem.cidade}` : "";
  return t + cidade;
}

// Posição escolhida na busca de endereços ({ lat, lng }); ignora valores fora do Brasil.
function posicaoInformada(p) {
  const lat = Number(p?.lat), lng = Number(p?.lng);
  if (!p || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -34 || lat > 5.5 || lng < -74.5 || lng > -34) return null;
  return { lat, lng, fonte: "openstreetmap" };
}

// Telefone só com dígitos, sem o +55 (para achar o cliente de novo do mesmo jeito que foi digitado).
function soDigitosTelefone(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d;
}

// Guarda (ou atualiza) o cliente da loja pelo telefone, para preencher sozinho na próxima entrega.
async function salvarCliente(comercioId, { telefone, nome, endereco, complemento, lat, lng }) {
  const fone = soDigitosTelefone(telefone);
  if (fone.length < 8 || !nome || !endereco) return null;
  const dados = { nome, endereco, complemento: complemento || null, ultimoPedidoEm: new Date(), ...(lat != null ? { lat, lng } : { lat: null, lng: null }) };
  return prisma.clienteComercio.upsert({
    where: { comercioId_telefone: { comercioId, telefone: fone } },
    create: { comercioId, telefone: fone, totalPedidos: 1, ...dados },
    update: { ...dados, totalPedidos: { increment: 1 } },
  });
}

// Ligar/desligar o retorno depois de criado: recalcula a taxa a partir da taxa sem acréscimo.
// Devolve { valor, acrescimoRetorno, texto } ou null se o pedido não tem valor calculado.
async function recalcularRetorno(atual, retorno) {
  if (atual.valor == null || !!atual.retorno === !!retorno) return null;
  const r2 = v => Math.round(v * 100) / 100;
  const base = r2((atual.valor || 0) - (atual.acrescimoRetorno || 0));
  const brl = v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (retorno) {
    const pct = await percentualRetorno();
    const acrescimo = r2((base * pct) / 100);
    return { valor: r2(base + acrescimo), acrescimoRetorno: acrescimo, texto: `Retorno ligado: taxa de ${brl(atual.valor)} para ${brl(base + acrescimo)} (+${pct}%).` };
  }
  return { valor: base, acrescimoRetorno: null, texto: `Retorno retirado: taxa de ${brl(atual.valor)} para ${brl(base)}.` };
}

async function percentualRetorno() {
  const c = await prisma.configuracao.findFirst({ select: { retornoPercentual: true } });
  return c?.retornoPercentual ?? 20;
}

// Só a posição do destino (para o mapa), sem calcular rota. Melhor esforço: null se falhar.
async function localizarDestino(comercioId, endereco) {
  try {
    const { origem } = await carregarComercioComOrigem(comercioId);
    return await geocodificarEndereco(enderecoComCidade(endereco, origem));
  } catch {
    return null;
  }
}

// Calcula distância de percurso e valor. Se o comércio tiver uma tabela de
// preço por KM vinculada ao modal escolhido, ela tem prioridade sobre a padrão.
// `destino` ({ lat, lng }) = posição escolhida na busca de endereços (dispensa localizar de novo).
// `retorno` = entrega com retorno à loja: acréscimo de Configurações › % do retorno (padrão 20%).
// `destinoAprox` = posição da rua (a busca achou a rua, não o número): usada se o número não for localizado.
async function calcularEntrega({ comercioId, endereco, veiculo = "MOTO", destino: informado, destinoAprox, retorno = false }) {
  const { comercio, origem } = await carregarComercioComOrigem(comercioId);
  if (!origem || origem.lat == null || origem.lng == null) {
    throw erroHttp(422, "Este comércio ainda não tem um endereço com coordenadas cadastradas.");
  }

  const destino = posicaoInformada(informado)
    || await geocodificarEndereco(enderecoComCidade(endereco, origem)).catch(() => null)
    || posicaoInformada(destinoAprox);
  if (!destino) throw erroHttp(422, "Endereço de destino não encontrado.");

  const distanciaKm = await calcularDistanciaRotaKm({ lat: origem.lat, lng: origem.lng }, destino);
  if (distanciaKm == null) throw erroHttp(422, "Não foi possível calcular a rota até esse endereço.");

  // Precificação do comércio para o modal: "Sem cobrança" zera; tabela de preço por KM
  // vinculada tem prioridade; sem tabela, vale a precificação padrão.
  const modal = comercio.precificacoesModal.find(p => p.veiculo === veiculo);
  const precificacaoPadrao = await prisma.precificacaoPadrao.findFirst();
  const valorBase = Number((modal?.tipoPrecificacao === "ZERAR"
    ? 0
    : calcularValorEntrega({ distanciaKm, precificacaoPadrao, tabelaPrecoKm: modal?.tabelaPrecoKm })).toFixed(2));
  const pct = retorno ? await percentualRetorno() : 0;
  const acrescimoRetorno = retorno ? Number((valorBase * pct / 100).toFixed(2)) : 0;

  return {
    distanciaKm: Number(distanciaKm.toFixed(2)),
    valor: Number((valorBase + acrescimoRetorno).toFixed(2)),
    valorBase,
    acrescimoRetorno,
    retornoPercentual: retorno ? pct : null,
    destino,
    calculadoPorPercurso: true,
    fonte: destino.fonte || null, // "google" (Google Maps) ou "openstreetmap"
  };
}

// Cria o pedido em PREPARANDO. O cálculo de rota é "melhor esforço": se o
// serviço de mapas falhar, o pedido é criado mesmo assim, sem valor/distância.
// `origem` é um valor de OrigemPedido (PAINEL_ADMIN, SISTEMA_COMERCIANTE...).
// `autor` = { autorTipo, autorNome } de quem criou (vai para o histórico de status).
async function criarPedido(dados, origem, autor = { autorTipo: "SISTEMA", autorNome: null }) {
  if (!ORIGENS[origem]) throw new Error(`Origem de pedido inválida: ${origem}`);
  const { comercioId, clienteNome, clienteTelefone, endereco, prazoDesejado, formaPagamento, entregadorId, observacao } = dados;
  const nf = dadosNotaFiscal(dados);
  if (!comercioId || !clienteNome || !endereco) {
    throw erroHttp(400, 'Informe "comercioId", "clienteNome" e "endereco".');
  }
  const agendadoPara = validarAgendamento(dados.agendadoPara);

  const { comercio } = await carregarComercioComOrigem(comercioId);
  if (comercio.bloqueado) throw erroHttp(403, "Este comércio está bloqueado e não pode criar pedidos.");

  const posicao = posicaoInformada(dados.destino);
  const retorno = !!dados.retorno;
  let calculo = null;
  let enderecoNaoEncontrado = false;
  try {
    calculo = await calcularEntrega({ comercioId, endereco, veiculo: dados.veiculo || "MOTO", destino: posicao, destinoAprox: dados.destinoAprox, retorno });
  } catch (err) {
    calculo = null;
    enderecoNaoEncontrado = err.message === "Endereço de destino não encontrado.";
  }
  // Sem rota (serviço de rotas fora do ar), ainda tenta guardar a posição do destino para o mapa.
  const destino = calculo?.destino || posicao || posicaoInformada(dados.destinoAprox) || (enderecoNaoEncontrado ? null : await localizarDestino(comercioId, endereco));
  // Valor digitado (painel ADM) vale como está; calculado já inclui o acréscimo do retorno.
  const valorManual = dados.valor != null && dados.valor !== "";

  const codigo = await gerarCodigoPedido();
  const pedido = await prisma.pedido.create({
    data: {
      codigo,
      comercioId,
      clienteNome,
      clienteTelefone,
      endereco,
      complemento: dados.complemento ? String(dados.complemento).trim() || null : null,
      retorno,
      acrescimoRetorno: !valorManual && retorno ? calculo?.acrescimoRetorno ?? null : null,
      agendadoPara,
      prazoDesejado,
      formaPagamento,
      observacao,
      entregadorId: entregadorId || null,
      status: "PREPARANDO",
      origem,
      distanciaKm: calculo?.distanciaKm ?? null,
      valor: valorManual ? Number(dados.valor) : calculo?.valor ?? null,
      latDestino: destino?.lat ?? null,
      lngDestino: destino?.lng ?? null,
      ...nf,
      integracaoSlug: dados.integracaoSlug || null,
      idExterno: dados.idExterno || null,
      codigoExterno: dados.codigoExterno || null,
      logs: { create: [
        { texto: `Pedido ${codigo} criado (${origem === "INTEGRACAO" ? autor.autorNome : ORIGENS[origem]}) e enviado para preparo.` },
        ...(agendadoPara ? [{ texto: `Agendado: o entregador será chamado em ${agendadoPara.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}.` }] : []),
        ...(retorno ? [{ texto: calculo?.acrescimoRetorno && !valorManual
          ? `Entrega com retorno à loja (+${calculo.retornoPercentual}% na taxa: ${calculo.acrescimoRetorno.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`
          : "Entrega com retorno à loja." }] : []),
      ] },
      historicoStatus: { create: [{ de: null, para: "PREPARANDO", autorTipo: autor.autorTipo, autorNome: autor.autorNome }] },
    },
    include: INCLUDE_PADRAO,
  });
  require("./integracoes.service").agendarNotificacao(pedido.id, null, "PREPARANDO");
  // Cliente salvo pelo telefone (não atrapalha o pedido se falhar).
  await salvarCliente(comercioId, {
    telefone: clienteTelefone, nome: clienteNome, endereco, complemento: pedido.complemento, lat: destino?.lat ?? null, lng: destino?.lng ?? null,
  }).catch(err => console.error("[clientes] não foi possível salvar:", err.message));
  return pedido;
}

// Horário para chamar o entregador: vazio = agora; precisa ser futuro e em até 30 dias.
function validarAgendamento(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw erroHttp(400, "Data do agendamento inválida.");
  if (d.getTime() < Date.now() + 60 * 1000) throw erroHttp(400, "O agendamento precisa ser para daqui a pelo menos 1 minuto.");
  if (d.getTime() > Date.now() + 30 * 864e5) throw erroHttp(400, "Agende para no máximo 30 dias à frente.");
  return d;
}

// Campos de nota fiscal vindos de formulário (vazios viram null; chave só com dígitos).
function dadosNotaFiscal(d) {
  const r = {};
  if (d.notaFiscalNumero !== undefined) r.notaFiscalNumero = d.notaFiscalNumero ? String(d.notaFiscalNumero).trim() : null;
  if (d.notaFiscalChave !== undefined) {
    const chave = String(d.notaFiscalChave || "").replace(/\D/g, "");
    if (chave && chave.length !== 44) throw erroHttp(400, "A chave de acesso da nota fiscal tem 44 dígitos.");
    r.notaFiscalChave = chave || null;
  }
  if (d.notaFiscalValor !== undefined) {
    r.notaFiscalValor = d.notaFiscalValor === "" || d.notaFiscalValor === null ? null : Number(String(d.notaFiscalValor).replace(",", "."));
  }
  return r;
}

// Aceite atômico: só um entregador consegue pegar o pedido, mesmo que dois
// toquem em "aceitar" ao mesmo tempo.
async function aceitarPedido(pedidoId, entregadorId) {
  const entregador = await prisma.entregador.findUnique({ where: { id: entregadorId } });
  if (!entregador) throw erroHttp(404, "Entregador não encontrado.");
  if (entregador.bloqueado) throw erroHttp(403, "Este entregador está bloqueado.");
  if (entregador.status !== "ATIVO") throw erroHttp(403, "Entregador ainda não está ativo.");

  const { count } = await prisma.pedido.updateMany({
    where: { id: pedidoId, status: "PENDENTE", entregadorId: null },
    data: { entregadorId, status: "ATRIBUIDO", aceitoEm: new Date() },
  });
  if (count === 0) throw erroHttp(409, "Pedido não está mais disponível.");

  await registrarStatusPedido({
    pedidoId, de: "PENDENTE", para: "ATRIBUIDO", entregadorId,
    autor: { autorTipo: "ENTREGADOR", autorNome: entregador.nomeCompleto },
  });
  await registrarLog(pedidoId, `${entregador.nomeCompleto} aceitou a corrida.`);
  return prisma.pedido.findUnique({ where: { id: pedidoId }, include: INCLUDE_PADRAO });
}

module.exports = {
  localizarDestino,
  INCLUDE_PADRAO,
  ORIGENS,
  dadosNotaFiscal,
  erroHttp,
  gerarCodigoPedido,
  registrarLog,
  calcularEntrega,
  criarPedido,
  aceitarPedido,
  salvarCliente,
  soDigitosTelefone,
  percentualRetorno,
  recalcularRetorno,
  posicaoInformada,
};
