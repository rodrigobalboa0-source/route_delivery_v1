const moedaFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numeroFmt = new Intl.NumberFormat("pt-BR");

export const moeda = v => (v == null || v === "" ? "—" : moedaFmt.format(Number(v)));
export const numero = v => (v == null ? "—" : numeroFmt.format(v));
export const km = v => (v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);

export function data(v) {
  if (!v) return "—";
  // Datas "só dia" (vencimento, nascimento) são gravadas à meia-noite UTC;
  // exibir em UTC evita mostrar o dia anterior no fuso do Brasil.
  const soDia = typeof v === "string" && v.includes("T00:00:00.000Z");
  return new Date(v).toLocaleDateString("pt-BR", soDia ? { timeZone: "UTC" } : undefined);
}

export function dataHora(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function tempoRelativo(v) {
  if (!v) return "—";
  const min = Math.round((Date.now() - new Date(v).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

// Valor para <input type="date">.
//   string da API ("2026-01-31T00:00:00.000Z", datas gravadas em UTC) -> "2026-01-31"
//   Date local (ex.: hoje)                                            -> dia local
export function paraInputData(v) {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  const p = n => String(n).padStart(2, "0");
  return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
}

// Rótulos e tons (classes de badge) para os enums da API.
// Fluxo: Criado -> Pedido pronto (aguarda motoboy) -> Atribuída -> Na loja -> Em rota -> Cheguei no cliente -> Entregue.
export const STATUS_PEDIDO = {
  PREPARANDO: { rotulo: "Criado", tom: "neutro" },
  PENDENTE: { rotulo: "Pedido pronto", tom: "aviso" },
  ATRIBUIDO: { rotulo: "Atribuída", tom: "info" },
  NA_LOJA: { rotulo: "Na loja", tom: "info" },
  EM_ROTA: { rotulo: "Em rota", tom: "info" },
  NO_CLIENTE: { rotulo: "Cheguei no cliente", tom: "info" },
  ENTREGUE: { rotulo: "Pedido entregue", tom: "ok" },
  ATRASADO: { rotulo: "Atrasado", tom: "critico" },
  CANCELADO: { rotulo: "Cancelada", tom: "apagado" },
};

// Ordem do fluxo (para listas e seletor de status). Atrasado é uma marcação à parte, no fim.
export const FLUXO_PEDIDO = ["PREPARANDO", "PENDENTE", "ATRIBUIDO", "NA_LOJA", "EM_ROTA", "NO_CLIENTE", "ENTREGUE", "CANCELADO", "ATRASADO"];
// Com motoboy trabalhando no pedido (do aceite até antes de entregar).
export const COM_ENTREGADOR = ["ATRIBUIDO", "NA_LOJA", "EM_ROTA", "NO_CLIENTE", "ATRASADO"];

export const STATUS_ENTREGADOR = {
  EM_ANALISE: { rotulo: "Em análise", tom: "aviso" },
  ATIVO: { rotulo: "Ativo", tom: "ok" },
  INATIVO: { rotulo: "Inativo", tom: "apagado" },
};

export const ORIGEM_PEDIDO = {
  PAINEL_ADMIN: "Painel ADM",
  SISTEMA_COMERCIANTE: "Sistema do comerciante",
  APP_COMERCIANTE: "App do comerciante",
  INTEGRACAO: "Integração",
};

export const VEICULOS ={ MOTO: "Moto", BIKE: "Bike", CARRO: "Carro" };
export const TIPO_ENTREGA = { PROPRIO: "Próprio", TERCEIRIZADO: "Terceirizado", PARCEIRO: "Parceiro" };
export const PERMISSAO_COLETA = { TODOS_CLIENTES: "Todos os comércios", SOMENTE_SELECIONADOS: "Somente comércios selecionados" };
export const CADASTRO_VIA = {
  SISTEMA_DO_COMERCIANTE: "Sistema do comerciante",
  APP_DO_COMERCIANTE: "App do comerciante",
  PAINEL_ADMIN: "Painel ADM",
  IMPORTACAO: "Importação",
};
export const CARGOS = { ADMINISTRADOR: "Administrador", FINANCEIRO: "Financeiro", SUPORTE: "Suporte", OPERACOES: "Operações" };
export const PERMISSOES = { TOTAL: "Total", FINANCEIRO: "Financeiro", OPERACIONAL: "Operacional", LEITURA: "Somente leitura" };

export function opcoes(mapa) {
  return Object.entries(mapa).map(([valor, r]) => ({ valor, rotulo: typeof r === "string" ? r : r.rotulo }));
}
