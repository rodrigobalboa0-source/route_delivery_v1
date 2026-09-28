// Seletor de status do pedido para o ADM da operação (lista da Operação e detalhe do pedido).
// Pede confirmação quando a mudança tem efeito colateral (cancelar, reabrir, liberar o motoboy).
import { useState } from "react";
import { api } from "../api";
import { Botao, Modal, useAcao } from "./ui";
import { COM_ENTREGADOR, FLUXO_PEDIDO, STATUS_PEDIDO } from "../utils/format";

const rotulo = s => STATUS_PEDIDO[s]?.rotulo || s;

function aviso(p, para) {
  if (para === "CANCELADO") return "O pedido será cancelado e sai da fila dos entregadores.";
  if (p.status === "ENTREGUE") return "O pedido deixa de contar como entregue (e a comissão automática da entrega, se houver, é retirada).";
  if (p.status === "CANCELADO") return "O pedido cancelado será reaberto.";
  if (["PREPARANDO", "PENDENTE"].includes(para) && p.entregador) return `${p.entregador.nomeCompleto} será liberado e o pedido volta para a fila.`;
  return null;
}

export default function SeletorStatus({ pedido, onAlterado, onPrecisaEntregador, compacto }) {
  const [confirmar, setConfirmar] = useState(null);
  const { executar, ocupado } = useAcao();
  const tom = STATUS_PEDIDO[pedido.status]?.tom || "neutro";

  async function aplicar(para) {
    setConfirmar(null);
    const r = await executar(() => api.patch(`/pedidos/${pedido.id}/status`, { status: para }), `${pedido.codigo}: ${rotulo(para)}.`);
    if (r) onAlterado?.(r);
  }

  function escolher(para) {
    if (para === pedido.status) return;
    if (COM_ENTREGADOR.includes(para) && para !== "ATRASADO" && !pedido.entregador) return onPrecisaEntregador?.(pedido);
    if (aviso(pedido, para)) return setConfirmar(para);
    aplicar(para);
  }

  return (
    <>
      <select
        className={`seletor-status tom-${tom}${compacto ? " compacto" : ""}`}
        value={pedido.status}
        disabled={ocupado}
        onChange={e => escolher(e.target.value)}
        onClick={e => e.stopPropagation()}
        aria-label={`Status do pedido ${pedido.codigo}`}
      >
        {FLUXO_PEDIDO.map(s => <option key={s} value={s}>{rotulo(s)}</option>)}
      </select>
      {confirmar && (
        <Modal
          titulo={`${pedido.codigo}: mudar para “${rotulo(confirmar)}”?`}
          onFechar={() => setConfirmar(null)}
          rodape={<>
            <Botao variante="fantasma" onClick={() => setConfirmar(null)}>Voltar</Botao>
            <Botao variante={confirmar === "CANCELADO" ? "perigo" : "primario"} disabled={ocupado} onClick={() => aplicar(confirmar)}>Confirmar</Botao>
          </>}
        >
          <p>De <strong>{rotulo(pedido.status)}</strong> para <strong>{rotulo(confirmar)}</strong>.</p>
          <p className="apagado">{aviso(pedido, confirmar)}</p>
        </Modal>
      )}
    </>
  );
}
