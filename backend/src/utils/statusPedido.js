// Status do pedido e grupos usados em todo o backend (um lugar só para não divergir).
//   PREPARANDO (Criado) -> PENDENTE (Pedido pronto) -> ATRIBUIDO (Atribuída) -> NA_LOJA (Na loja)
//   -> EM_ROTA (Em rota) -> NO_CLIENTE (Cheguei no cliente) -> ENTREGUE (Entregue); CANCELADO (Cancelada).
//   ATRASADO: marcação de atraso de um pedido em andamento.

const TODOS = ["PREPARANDO", "PENDENTE", "ATRIBUIDO", "NA_LOJA", "EM_ROTA", "NO_CLIENTE", "ENTREGUE", "ATRASADO", "CANCELADO"];

// Com entregador trabalhando nele (do aceite até antes de entregar).
const COM_ENTREGADOR = ["ATRIBUIDO", "NA_LOJA", "EM_ROTA", "NO_CLIENTE", "ATRASADO"];

// Ainda não terminou (nem entregue nem cancelado).
const ABERTOS = ["PREPARANDO", "PENDENTE", ...COM_ENTREGADOR];

const FINAIS = ["ENTREGUE", "CANCELADO"];

// Etapas que o entregador informa pelo app, em ordem.
const ETAPAS_ENTREGADOR = ["ATRIBUIDO", "NA_LOJA", "EM_ROTA", "NO_CLIENTE"];

const ROTULOS = {
  PREPARANDO: "Criado", PENDENTE: "Pedido pronto", ATRIBUIDO: "Atribuída", NA_LOJA: "Na loja", EM_ROTA: "Em rota",
  NO_CLIENTE: "Cheguei no cliente", ENTREGUE: "Pedido entregue", ATRASADO: "Atrasado", CANCELADO: "Cancelada",
};

// Um evento de histórico é "aceite" quando o pedido passa a ter entregador trabalhando nele.
const ehAceite = ev => COM_ENTREGADOR.includes(ev.para) && ev.para !== "ATRASADO" && !COM_ENTREGADOR.includes(ev.de);
// Entregador (ou o painel) tirou o pedido de quem estava com ele e devolveu para a fila.
const ehDevolucao = ev => ev.para === "PENDENTE" && COM_ENTREGADOR.includes(ev.de);

module.exports = { TODOS, COM_ENTREGADOR, ABERTOS, FINAIS, ETAPAS_ENTREGADOR, ROTULOS, ehAceite, ehDevolucao };
