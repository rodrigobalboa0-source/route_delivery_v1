import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { assinarTempoReal } from "./tempoReal";

// Carrega um GET da API. `intervaloMs` ativa atualização periódica (reserva).
// `aoVivo`: assuntos do tempo real ("pedidos", "entregadores", "notificacoes", "mensagens") —
// quando um deles muda no sistema, recarrega em ~2 s, sem piscar a tela.
export function useApi(caminho, { intervaloMs, ativo = true, aoVivo } = {}) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const caminhoAtual = useRef(caminho);
  caminhoAtual.current = caminho;

  const recarregar = useCallback(async ({ silencioso = false } = {}) => {
    if (!caminhoAtual.current) return;
    if (!silencioso) setCarregando(true);
    try {
      const alvo = caminhoAtual.current;
      const r = await api.get(alvo);
      if (alvo === caminhoAtual.current) {
        setDados(r);
        setErro(null);
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (!ativo || !caminho) return;
    recarregar();
  }, [caminho, ativo, recarregar]);

  useEffect(() => {
    if (!ativo || !intervaloMs) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") recarregar({ silencioso: true });
    }, intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs, ativo, recarregar]);

  const chaveAoVivo = aoVivo ? aoVivo.join(",") : "";
  useEffect(() => {
    if (!ativo || !chaveAoVivo) return;
    return assinarTempoReal(chaveAoVivo.split(","), () => recarregar({ silencioso: true }));
  }, [chaveAoVivo, ativo, recarregar]);

  return { dados, setDados, erro, carregando, recarregar };
}
