// Tempo real do painel: pergunta à API "algo mudou?" a cada 2 s enquanto a aba está visível
// (GET /api/tempo-real devolve uma versão por assunto: pedidos, entregadores, notificacoes, mensagens).
// Quando a versão de um assunto muda, as telas que assinaram aquele assunto recarregam em silêncio.
import { api } from "../api";

const INTERVALO_MS = 2000;
const assinantes = new Set(); // { assuntos: Set, fn }
let versoes = null;
let timer = null;
let rodando = false;

async function verificar() {
  timer = null;
  if (!assinantes.size) { rodando = false; return; }
  if (typeof document !== "undefined" && document.visibilityState !== "visible") { agendar(); return; }
  try {
    const novas = await api.get("/tempo-real");
    if (versoes) {
      const mudaram = Object.keys(novas).filter(k => novas[k] !== versoes[k]);
      if (mudaram.length) assinantes.forEach(a => { if (mudaram.some(m => a.assuntos.has(m))) a.fn(); });
    }
    versoes = novas;
  } catch {
    // sem conexão ou sessão expirada: tenta de novo no próximo ciclo
  }
  agendar();
}

function agendar() {
  if (!timer && assinantes.size) timer = setTimeout(verificar, INTERVALO_MS);
}

if (typeof document !== "undefined") {
  // Voltou para a aba: verifica na hora.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && assinantes.size) {
      clearTimeout(timer);
      timer = null;
      verificar();
    }
  });
}

export function assinarTempoReal(assuntos, fn) {
  const a = { assuntos: new Set(assuntos), fn };
  assinantes.add(a);
  if (!rodando) { rodando = true; verificar(); }
  return () => assinantes.delete(a);
}
