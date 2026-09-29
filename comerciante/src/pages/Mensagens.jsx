import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useApi } from "../hooks/useApi";
import { Cabecalho, Carregando, ErroCaixa, Vazio, useAcao } from "../components/ui";
import { marcarMensagensVistas } from "../components/Layout";
import { dataHora } from "../utils/format";

// Conversa da loja com a equipe Route Delivery (a equipe responde pelo painel ADM, em Mensagens).
export default function Mensagens() {
  const { dados, erro, recarregar } = useApi("/mensagens", { aoVivo: ["mensagens"] });
  const [texto, setTexto] = useState("");
  const { executar, ocupado } = useAcao();
  const fim = useRef(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
    if (dados) marcarMensagensVistas();
  }, [dados?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    if (await executar(() => api.post("/mensagens", { texto }))) {
      setTexto("");
      await recarregar({ silencioso: true });
    }
  }

  return (
    <>
      <Cabecalho titulo="Mensagens" subtitulo="Fale com a equipe Route Delivery: dúvidas, problemas numa entrega, faturas…" />
      <ErroCaixa erro={erro} onTentar={() => recarregar()} />
      <section className="cartao chat chat-loja">
        <div className="chat-topo"><strong>Equipe Route Delivery</strong></div>
        <div className="chat-mensagens">
          {!dados ? <Carregando /> : dados.length === 0 ? (
            <Vazio titulo="Nenhuma mensagem ainda">Escreva abaixo; a equipe responde por aqui mesmo.</Vazio>
          ) : dados.map(m => (
            // "bolha-nos" = lado direito (quem está usando a tela).
            <div key={m.id} className={`bolha ${m.minha ? "bolha-nos" : "bolha-eles"}`}>
              <span>{m.texto}</span>
              <small>{m.minha ? "Você" : "Equipe"} · {dataHora(m.createdAt)}</small>
            </div>
          ))}
          <div ref={fim} />
        </div>
        <form className="chat-envio" onSubmit={enviar}>
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escreva uma mensagem…" aria-label="Mensagem" maxLength={2000} />
          <button type="submit" className="btn btn-primario" disabled={ocupado || !texto.trim()}>Enviar</button>
        </form>
      </section>
    </>
  );
}
