// Cliente HTTP do sistema do comerciante. Todas as chamadas vão para /api/app/comerciante
// com o token da loja; erros da API ({ erro: "..." }) viram Error com .message.
// Em produção usa a API online; no desenvolvimento, .env.development aponta para http://localhost:4000/api.
const API = import.meta.env.VITE_API_BASE_URL || "https://routedelivery.vercel.app/api";
const BASE = `${API}/app/comerciante`;
const CHAVE_TOKEN = "rd_loja_token";

let aoExpirar = () => {};

export function definirAoExpirar(fn) {
  aoExpirar = fn;
}

export function obterToken() {
  try { return localStorage.getItem(CHAVE_TOKEN); } catch { return null; }
}

export function salvarToken(token) {
  try {
    if (token) localStorage.setItem(CHAVE_TOKEN, token);
    else localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    // navegador sem armazenamento: a sessão dura só enquanto a aba está aberta
  }
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
    throw new Error("Sem conexão com o servidor. Verifique sua internet e tente de novo.");
  }

  if (resp.status === 204) return null;
  const dados = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    if ((resp.status === 401 || resp.status === 403) && token && caminho !== "/login") aoExpirar(dados.erro);
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
