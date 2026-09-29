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
function enderecoComCidade(endereco, origem) {
  const cidade = origem?.cidade && !endereco.toLowerCase().includes(origem.cidade.toLowerCase()) ? `, ${origem.cidade}` : "";
  return endereco + cidade;
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
async function calcularEntrega({ comercioId, endereco, veiculo = "MOTO" }) {
  const { comercio, origem } = await carregarComercioComOrigem(comercioId);
  if (!origem || origem.lat == null || origem.lng == null) {
    throw erroHttp(422, "Este comércio ainda não tem um endereço com coordenadas cadastradas.");
  }

  const destino = await geocodificarEndereco(enderecoComCidade(endereco, origem));
  if (!destino) throw erroHttp(422, "Endereço de destino não encontrado.");

  const distanciaKm = await calcularDistanciaRotaKm({ lat: origem.lat, lng: origem.lng }, destino);
  if (distanciaKm == null) throw erroHttp(422, "Não foi possível calcular a rota até esse endereço.");

  // Precificação do comércio para o modal: "Sem cobrança" zera; tabela de preço por KM
  // vinculada tem prioridade; sem tabela, vale a precificação padrão.
  const modal = comercio.precificacoesModal.find(p => p.veiculo === veiculo);
  const precificacaoPadrao = await prisma.precificacaoPadrao.findFirst();
  const valor = modal?.tipoPrecificacao === "ZERAR"
    ? 0
    : calcularValorEntrega({ distanciaKm, precificacaoPadrao, tabelaPrecoKm: modal?.tabelaPrecoKm });

  return {
    distanciaKm: Number(distanciaKm.toFixed(2)),
    valor: Number(valor.toFixed(2)),
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

  let calculo = null;
  let enderecoNaoEncontrado = false;
  try {
    calculo = await calcularEntrega({ comercioId, endereco });
  } catch (err) {
    calculo = null;
    enderecoNaoEncontrado = err.message === "Endereço de destino não encontrado.";
  }
  // Sem rota (serviço de rotas fora do ar), ainda tenta guardar a posição do destino para o mapa.
  const destino = calculo?.destino || (enderecoNaoEncontrado ? null : await localizarDestino(comercioId, endereco));

  const codigo = await gerarCodigoPedido();
  const pedido = await prisma.pedido.create({
    data: {
      codigo,
      comercioId,
      clienteNome,
      clienteTelefone,
      endereco,
      complemento: dados.complemento ? String(dados.complemento).trim() || null : null,
      retorno: !!dados.retorno,
      agendadoPara,
      prazoDesejado,
      formaPagamento,
      observacao,
      entregadorId: entregadorId || null,
      status: "PREPARANDO",
      origem,
      distanciaKm: calculo?.distanciaKm ?? null,
      valor: dados.valor != null && dados.valor !== "" ? Number(dados.valor) : calculo?.valor ?? null,
      latDestino: destino?.lat ?? null,
      lngDestino: destino?.lng ?? null,
      ...nf,
      integracaoSlug: dados.integracaoSlug || null,
      idExterno: dados.idExterno || null,
      logs: { create: [
        { texto: `Pedido ${codigo} criado (${origem === "INTEGRACAO" ? autor.autorNome : ORIGENS[origem]}) e enviado para preparo.` },
        ...(agendadoPara ? [{ texto: `Agendado: o entregador será chamado em ${agendadoPara.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}.` }] : []),
        ...(dados.retorno ? [{ texto: "Entrega com retorno à loja." }] : []),
      ] },
      historicoStatus: { create: [{ de: null, para: "PREPARANDO", autorTipo: autor.autorTipo, autorNome: autor.autorNome }] },
    },
    include: INCLUDE_PADRAO,
  });
  require("./integracoes.service").agendarNotificacao(pedido.id, null, "PREPARANDO");
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
};
