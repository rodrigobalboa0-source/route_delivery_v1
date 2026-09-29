// Comunicação com o sistema Route Delivery (mesmo servidor do painel ADM).
// Troque o endereço com a variável EXPO_PUBLIC_API_URL (ex.: http://192.168.0.10:4000/api) para testar local.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://routedelivery.vercel.app/api").replace(/\/$/, "");
const BASE = `${API_URL}/app/entregador`;
const CHAVE_TOKEN = "route_entregador_token";

let token = null;
let aoSairForcado = () => {};

export async function carregarToken() {
  token = await AsyncStorage.getItem(CHAVE_TOKEN);
  return token;
}
export async function salvarToken(t) {
  token = t;
  if (t) await AsyncStorage.setItem(CHAVE_TOKEN, t);
  else await AsyncStorage.removeItem(CHAVE_TOKEN);
}
export function quandoSessaoExpirar(fn) {
  aoSairForcado = fn;
}

async function chamar(metodo, caminho, corpo) {
  let resp;
  try {
    resp = await fetch(BASE + caminho, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new Error("Sem conexão com o servidor. Verifique sua internet.");
  }
  const dados = await resp.json().catch(() => null);
  if (!resp.ok) {
    if (resp.status === 401 && token) aoSairForcado();
    throw new Error(dados?.erro || `Erro ${resp.status}`);
  }
  return dados;
}

export const api = {
  get: c => chamar("GET", c),
  post: (c, b) => chamar("POST", c, b || {}),
  patch: (c, b) => chamar("PATCH", c, b || {}),
};
