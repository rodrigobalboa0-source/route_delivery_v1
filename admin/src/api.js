// Cliente HTTP do painel. Todas as chamadas passam por aqui para anexar o token
// e padronizar erros ({ erro: "..." } vindo da API vira Error com .message).
// Em produção o painel é servido pela própria API, então "/api" (mesmo endereço) basta.
// No desenvolvimento, .env.development aponta para http://localhost:4000/api.
const BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const CHAVE_TOKEN = "rd_admin_token";

let aoExpirar = () => {};

export function definirAoExpirar(fn) {
  aoExpirar = fn;
}

export function obterToken() {
  return localStorage.getItem(CHAVE_TOKEN);
}

export function salvarToken(token) {
  if (token) localStorage.setItem(CHAVE_TOKEN, token);
  else localStorage.removeItem(CHAVE_TOKEN);
}

async function requisicao(metodo, caminho, corpo) {
  const headers = { "Content-Type": "application/json" };
  const token = obterToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let resp;
  try {
    resp = await fetch(BASE + caminho, {
      method: metodo,
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error("Não foi possível conectar à API. Verifique se o backend está rodando.");
  }

  if (resp.status === 204) return null;
  const dados = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    if (resp.status === 401 && token && !caminho.startsWith("/auth/login")) aoExpirar();
    const err = new Error(dados.erro || `Erro ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return dados;
}

// Monta query string ignorando valores vazios.
export function qs(params = {}) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  get: caminho => requisicao("GET", caminho),
  post: (caminho, corpo = {}) => requisicao("POST", caminho, corpo),
  put: (caminho, corpo = {}) => requisicao("PUT", caminho, corpo),
  patch: (caminho, corpo = {}) => requisicao("PATCH", caminho, corpo),
  del: caminho => requisicao("DELETE", caminho),
};
