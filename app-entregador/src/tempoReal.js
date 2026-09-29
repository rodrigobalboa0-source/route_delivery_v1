// Tempo real do app: pergunta "algo mudou?" a cada 2 s enquanto o app está aberto na tela
// (GET /tempo-real devolve uma versão por assunto: disponiveis, meus, eu, avisos, mensagens).
// Quando um assunto muda, quem assinou recarrega na hora. Em segundo plano, pausa.
import { AppState } from "react-native";
import { api } from "./api";

const INTERVALO_MS = 2000;
const assinantes = new Set();
let versoes = null;
let timer = null;
let rodando = false;
let ativo = AppState.currentState !== "background";

async function verificar() {
  timer = null;
  if (!assinantes.size) { rodando = false; return; }
  if (!ativo) return; // volta quando o app reabrir
  try {
    const novas = await api.get("/tempo-real");
    if (versoes) {
      const mudaram = Object.keys(novas).filter(k => novas[k] !== versoes[k]);
      if (mudaram.length) assinantes.forEach(a => { if (mudaram.some(m => a.assuntos.has(m))) a.fn(); });
    }
    versoes = novas;
  } catch {
    // sem conexão: tenta de novo no próximo ciclo
  }
  if (!timer && assinantes.size) timer = setTimeout(verificar, INTERVALO_MS);
}

AppState.addEventListener("change", estado => {
  const antes = ativo;
  ativo = estado === "active";
  if (ativo && !antes && assinantes.size) {
    clearTimeout(timer);
    timer = null;
    verificar();
  }
});

export function assinarTempoReal(assuntos, fn) {
  const a = { assuntos: new Set(assuntos), fn };
  assinantes.add(a);
  if (!rodando) { rodando = true; verificar(); }
  return () => { assinantes.delete(a); };
}

// Ao sair da conta, esquece as versões (a próxima conta começa do zero).
export function reiniciarTempoReal() {
  versoes = null;
}
