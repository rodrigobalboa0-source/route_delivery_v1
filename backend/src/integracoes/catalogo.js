// Catálogo das integrações exibidas no painel (ordem definida pelo cliente — não reordenar).
//
// tipo:
//   "pedidos" -> plataforma que ENVIA pedidos (entrada por webhook) e recebe o status de volta (saída).
//   "saida"   -> serviço que só RECEBE eventos dos pedidos (logística, seguro).
//   "generica"-> ainda sem definição de como se integra (entrada e saída disponíveis).
//
// A conexão direta com a API de cada plataforma exige credenciais de parceiro e
// homologação com a empresa. Enquanto isso, os pedidos entram pelo webhook de
// entrada no formato Route (ver README) — por exemplo, a partir de um integrador.
//
// campos: credenciais guardadas criptografadas. `bearer: true` = enviado como
// "Authorization: Bearer <valor>" nos webhooks de saída.

const { TODOS: STATUS_TODOS } = require("../utils/statusPedido");

const campoClient = [
  { nome: "clientId", rotulo: "Client ID" },
  { nome: "clientSecret", rotulo: "Client Secret", secreto: true },
];
const campoToken = [{ nome: "token", rotulo: "Token de API", secreto: true }];

const CATALOGO = [
  { slug: "ifood", nome: "iFood", categoria: "Marketplace", tipo: "pedidos", campos: campoClient,
    descricao: "Pedidos do iFood viram entregas automaticamente e o status volta para a plataforma." },
  { slug: "99food", nome: "99 Food", categoria: "Marketplace", tipo: "pedidos", campos: campoClient,
    descricao: "Receba os pedidos da 99 Food para entrega pelos seus entregadores." },
  { slug: "ze-delivery", nome: "Zé Delivery", categoria: "Marketplace", tipo: "pedidos", campos: campoToken,
    descricao: "Pedidos de bebidas do Zé Delivery direto na operação." },
  { slug: "anotaai", nome: "Anota AI", categoria: "Cardápio digital", tipo: "pedidos", campos: campoToken,
    descricao: "Pedidos do robô de atendimento e cardápio Anota AI viram entregas." },
  { slug: "neemo", nome: "Neemo", categoria: "Cardápio digital", tipo: "pedidos", campos: campoToken,
    descricao: "Pedidos do app e site próprios criados na Neemo." },
  { slug: "delivery-direto", nome: "Delivery Direto", categoria: "Cardápio digital", tipo: "pedidos", campos: campoToken,
    descricao: "Pedidos do app próprio do restaurante na Delivery Direto." },
  { slug: "meu-cardapio", nome: "Meu Cardápio", categoria: "Cardápio digital", tipo: "pedidos", campos: campoToken,
    descricao: "Pedidos do cardápio digital Meu Cardápio." },
  { slug: "instadelivery", nome: "InstaDelivery", categoria: "Cardápio digital", tipo: "pedidos", campos: campoToken,
    descricao: "Pedidos do cardápio InstaDelivery." },
  { slug: "open-delivery", nome: "Open Delivery", categoria: "Padrão aberto", tipo: "pedidos",
    campos: [...campoClient, { nome: "urlBase", rotulo: "URL base da API" }],
    descricao: "Padrão aberto de integração de pedidos (Abrasel), usado por vários sistemas de PDV e cardápio." },
  { slug: "servico-logistico", nome: "Serviço Logístico", categoria: "Logística", tipo: "saida",
    campos: [{ nome: "token", rotulo: "Token de autenticação", secreto: true, bearer: true }],
    eventosPadrao: STATUS_TODOS,
    descricao: "Envia cada mudança de status das entregas para um parceiro logístico ou sistema externo." },
  { slug: "iza-seguradora", nome: "Iza Seguradora", categoria: "Seguro", tipo: "saida",
    campos: [{ nome: "apiKey", rotulo: "Chave de API", secreto: true, bearer: true }, { nome: "apolice", rotulo: "Número da apólice" }],
    eventosPadrao: ["EM_ROTA", "ENTREGUE", "CANCELADO"],
    descricao: "Avisa a seguradora quando a corrida começa e termina, para cobertura do entregador por entrega." },
  { slug: "idex", nome: "Idex", categoria: "Outros", tipo: "generica", campos: campoToken,
    descricao: "Integração configurável. Confirme com a Idex como os dados são trocados (API, webhook ou arquivo)." },
];

const PORSLUG = Object.fromEntries(CATALOGO.map(c => [c.slug, c]));

module.exports = { CATALOGO, PORSLUG, STATUS_TODOS };
