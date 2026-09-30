// Editar dados do pedido (loja): cliente, endereço (até o entregador sair), complemento, pagamento, observação e retorno.
// Ligar/desligar retorno ou trocar o endereço recalcula a taxa.
import { useState } from "react";
import { api } from "../api";
import { Botao, Campo, Modal, useAcao } from "./ui";
import CampoEndereco from "./CampoEndereco";

export default function EditarPedido({ pedido, onFechar, onSalvo, pct }) {
  const [v, setV] = useState({
    clienteNome: pedido.clienteNome || "", clienteTelefone: pedido.clienteTelefone || "", endereco: pedido.endereco || "",
    complemento: pedido.complemento || "", formaPagamento: pedido.formaPagamento || "", observacao: pedido.observacao || "",
    retorno: !!pedido.retorno,
  });
  const [destino, setDestino] = useState(null);
  const [aprox, setAprox] = useState(null);
  const { executar, ocupado } = useAcao();
  const set = k => e => setV({ ...v, [k]: e.target.value });
  const podeEndereco = ["PREPARANDO", "PENDENTE", "ATRIBUIDO"].includes(pedido.status);

  async function salvar(e) {
    e.preventDefault();
    const corpo = { ...v };
    if (!podeEndereco || v.endereco === pedido.endereco) delete corpo.endereco;
    else Object.assign(corpo, { destino, destinoAprox: aprox });
    const r = await executar(() => api.put(`/pedidos/${pedido.id}`, corpo), "Pedido atualizado. O entregador já vê os dados novos.");
    if (r) onSalvo(r);
  }

  return (
    <Modal titulo={`Editar ${pedido.codigo}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="grade-campos">
        <Campo rotulo="Nome do cliente *"><input value={v.clienteNome} onChange={set("clienteNome")} required /></Campo>
        <Campo rotulo="Telefone"><input value={v.clienteTelefone} onChange={set("clienteTelefone")} /></Campo>
        <Campo rotulo="Endereço de entrega" largo dica={podeEndereco ? "Trocar o endereço recalcula a distância e a taxa." : "O entregador já saiu — para mudar o endereço, fale com a equipe."}>
          {podeEndereco ? (
            <CampoEndereco valor={v.endereco} onChange={t => { setV(a => ({ ...a, endereco: t })); setDestino(null); setAprox(null); }}
              onEscolherEndereco={x => { setV(a => ({ ...a, endereco: x.endereco })); setDestino(x.exato ? { lat: x.lat, lng: x.lng } : null); setAprox(x.exato ? null : { lat: x.lat, lng: x.lng }); }} />
          ) : <input value={v.endereco} disabled />}
        </Campo>
        <Campo rotulo="Complemento"><input value={v.complemento} onChange={set("complemento")} /></Campo>
        <Campo rotulo="Pagamento do cliente"><input value={v.formaPagamento} onChange={set("formaPagamento")} /></Campo>
        <Campo rotulo="Observação para o entregador" largo><textarea rows={2} value={v.observacao} onChange={set("observacao")} /></Campo>
        <label className="campo campo-switch campo-largo">
          <input type="checkbox" role="switch" checked={v.retorno} onChange={e => setV({ ...v, retorno: e.target.checked })} />
          <span className="interruptor" aria-hidden="true" />
          <span>Retorno à loja (+{pct}% na taxa) — ligar ou tirar recalcula o valor</span>
        </label>
        <div className="form-rodape campo-largo">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-laranja" disabled={ocupado}>Salvar alterações</button>
        </div>
      </form>
    </Modal>
  );
}

