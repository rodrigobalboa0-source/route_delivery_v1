import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

// Carrega um GET da API. `intervaloMs` ativa atualização periódica (polling),
// usada nas telas operacionais (dashboard, pedidos, mapa).
export function useApi(caminho, { intervaloMs, ativo = true } = {}) {
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

  return { dados, setDados, erro, carregando, recarregar };
}
