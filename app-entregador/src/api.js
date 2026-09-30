// Comunicação com o sistema Route Delivery (mesmo servidor do painel ADM).
// Troque o endereço com a variável EXPO_PUBLIC_API_URL (ex.: http://192.168.0.10:4000/api) para testar local.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://routedelivery.vercel.app/api").replace(/\/$/, "");
const BASE = `${API_URL}/app/entregador`;
const CHAVE_TOKEN = "route_entregador_token";
const CHAVE_APARELHO = "route_entregador_aparelho";

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
// Chamado quando o servidor encerra a sessão (outro aparelho, senha trocada, liberado pelo ADM). Recebe a mensagem.
export function quandoSessaoExpirar(fn) {
  aoSairForcado = fn;
}

// Identificador deste celular (criado na primeira vez e guardado). A conta só fica logada em um aparelho.
let aparelho = null;
export async function aparelhoAtual() {
  if (aparelho) return aparelho;
  let id = await AsyncStorage.getItem(CHAVE_APARELHO);
  if (!id) {
    id = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    await AsyncStorage.setItem(CHAVE_APARELHO, id);
  }
  const modelo = Platform.constants?.Model || Platform.constants?.model || (Platform.OS === "web" ? "Navegador" : Platform.OS);
  aparelho = { aparelhoId: id, aparelhoNome: String(modelo).slice(0, 80) };
  return aparelho;
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
    if (resp.status === 401 && token) aoSairForcado(dados?.codigo === "SESSAO_ENCERRADA" ? dados.erro : null);
    const erro = new Error(dados?.erro || `Erro ${resp.status}`);
    erro.status = resp.status;
    erro.dados = dados;
    throw erro;
  }
  return dados;
}

export const api = {
  get: c => chamar("GET", c),
  post: (c, b) => chamar("POST", c, b || {}),
  patch: (c, b) => chamar("PATCH", c, b || {}),
};
