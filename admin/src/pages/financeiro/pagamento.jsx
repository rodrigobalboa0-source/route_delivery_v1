// Peças compartilhadas do Financeiro: formas de pagamento, janela de pagamento e impressão de recibo/nota.
import { useState } from "react";
import { Botao, Campo, Modal } from "../../components/ui";
import { moeda, paraInputData } from "../../utils/format";

export const FORMAS_PAGAMENTO = ["Pix", "Transferência bancária", "Dinheiro", "Boleto", "Cartão", "Depósito"];
export const abrirImpressao = caminho => window.open(caminho, "_blank", "noopener");

export function ModalPagamento({ titulo, valor, onFechar, onConfirmar, rotuloData = "Data do pagamento" }) {
  const [forma, setForma] = useState("Pix");
  const [dia, setDia] = useState(paraInputData(new Date()));
  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <form onSubmit={e => { e.preventDefault(); onConfirmar({ formaPagamento: forma, data: dia }); }}>
        <div className="total-destaque">Valor <strong>{moeda(valor)}</strong></div>
        <div className="grade-campos">
          <Campo rotulo="Forma de pagamento">
            <select value={forma} onChange={e => setForma(e.target.value)}>{FORMAS_PAGAMENTO.map(f => <option key={f}>{f}</option>)}</select>
          </Campo>
          <Campo rotulo={rotuloData}><input type="date" value={dia} onChange={e => setDia(e.target.value)} required /></Campo>
        </div>
        <div className="form-rodape">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-primario">Confirmar</button>
        </div>
      </form>
    </Modal>
  );
}
