// Telefone do cliente: máscara e busca do cliente salvo pela loja.
import { api } from "../api";

export const soDigitos = t => String(t || "").replace(/\D/g, "");

// (11) 98888-7777 / (11) 3333-4444
export function mascaraTelefone(valor) {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Telefone completo (DDD + 8 ou 9 dígitos)?
export const telefoneCompleto = t => [10, 11].includes(soDigitos(t).length);

// Cliente salvo com esse telefone, ou null (cliente novo / sem conexão).
export async function clientePorTelefone(telefone) {
  const d = soDigitos(telefone);
  if (d.length < 10) return null;
  try {
    return await api.get(`/clientes/telefone/${d}`);
  } catch {
    return null;
  }
}
