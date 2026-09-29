// Cores e formatação do app (mesma identidade do painel: azul-marinho + azul da logo).
export const cor = {
  fundo: "#0b1628",
  superficie: "#13223a",
  superficie2: "#1a2d4a",
  borda: "#243a5c",
  texto: "#eef3fa",
  texto2: "#b6c4d8",
  texto3: "#7f93b0",
  primaria: "#2a78d6",
  primariaClara: "#4da3ff",
  ok: "#22c55e",
  aviso: "#f5a524",
  critico: "#ef4444",
  laranja: "#ea580c",
};

export const moeda = v => `R$ ${Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
export const km = v => (v == null ? "—" : `${Number(v).toFixed(1).replace(".", ",")} km`);
export const hora = d => (d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "");
export const dataCurta = d => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");

export const ETAPA = {
  ATRIBUIDO: { rotulo: "Indo buscar", botao: "Cheguei na loja", proxima: "NA_LOJA" },
  NA_LOJA: { rotulo: "Na loja", botao: "Saí para entrega", proxima: "EM_ROTA" },
  EM_ROTA: { rotulo: "Em rota", botao: "Cheguei no cliente", proxima: "NO_CLIENTE" },
  ATRASADO: { rotulo: "Atrasado", botao: "Cheguei no cliente", proxima: "NO_CLIENTE" },
  NO_CLIENTE: { rotulo: "No cliente", botao: "Finalizar entrega", proxima: "ENTREGUE" },
};

export const VEICULOS = { MOTO: "Moto", BIKE: "Bike", CARRO: "Carro" };

// Endereço de coleta (endereço principal da loja).
export function enderecoLoja(comercio) {
  const e = comercio?.enderecos?.[0];
  if (!e) return null;
  return [e.rua && `${e.rua}${e.numero ? `, ${e.numero}` : ""}`, e.bairro, e.cidade].filter(Boolean).join(" · ");
}
