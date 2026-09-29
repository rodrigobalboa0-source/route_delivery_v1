import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Botao, Cabecalho, Campo, useAcao } from "../components/ui";
import { VEICULOS, km, moeda } from "../utils/format";

const VAZIO = {
  clienteNome: "", clienteTelefone: "", endereco: "", formaPagamento: "", prazoDesejado: "", observacao: "",
  notaFiscalNumero: "", notaFiscalChave: "", notaFiscalValor: "",
};
const PAGAMENTOS = ["Pago (online)", "Pix", "Cartão na entrega", "Dinheiro"];

export default function NovaEntrega() {
  const navegar = useNavigate();
  const { loja } = useAuth();
  const [v, setV] = useState(VAZIO);
  const [pronto, setPronto] = useState(true);
  const [veiculo, setVeiculo] = useState("MOTO");
  const [calculo, setCalculo] = useState(null);
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const { executar, ocupado } = useAcao();

  // Veículos com preço configurado para a loja (sem configuração: todos).
  const veiculos = loja?.precificacoesModal?.length ? loja.precificacoesModal.map(p => p.veiculo) : Object.keys(VEICULOS);

  const set = k => e => {
    setV({ ...v, [k]: e.target.value });
    if (k === "endereco") setCalculo(null);
  };

  async function calcular() {
    const r = await executar(() => api.post("/pedidos/calcular", { endereco: v.endereco, veiculo }));
    if (r) setCalculo(r);
  }

  async function criar(e) {
    e.preventDefault();
    const r = await executar(
      () => api.post("/pedidos", { ...v, pronto }),
      pronto ? "Entrega lançada! Já estamos chamando um entregador." : "Entrega lançada. Marque como pronto quando o pedido estiver pronto."
    );
    if (r) navegar(`/pedidos?abrir=${r.id}`);
  }

  return (
    <>
      <Cabecalho titulo="Nova entrega" subtitulo="Informe o cliente e o endereço. O valor é calculado pelo percurso real." />

      <form onSubmit={criar} className="cartao form-pagina">
        <h3 className="secao-titulo">Cliente e destino</h3>
        <div className="grade-campos">
          <Campo rotulo="Nome do cliente *"><input value={v.clienteNome} onChange={set("clienteNome")} required autoFocus /></Campo>
          <Campo rotulo="Telefone do cliente"><input type="tel" value={v.clienteTelefone} onChange={set("clienteTelefone")} placeholder="(11) 90000-0000" /></Campo>
          <Campo rotulo="Endereço de entrega *" largo dica="Rua, número, bairro e cidade.">
            <input value={v.endereco} onChange={set("endereco")} required placeholder="Ex.: Rua Augusta, 1500 - Consolação, São Paulo" />
          </Campo>
        </div>

        <h3 className="secao-titulo">Valor da entrega</h3>
        <div className="linha-acao">
          {veiculos.length > 1 && (
            <select value={veiculo} onChange={e => { setVeiculo(e.target.value); setCalculo(null); }} aria-label="Veículo" style={{ flex: "0 0 auto", minWidth: 105 }}>
              {veiculos.map(k => <option key={k} value={k}>{VEICULOS[k] || k}</option>)}
            </select>
          )}
          <Botao disabled={!v.endereco || ocupado} onClick={calcular}>Calcular valor</Botao>
          {calculo && (
            <span className="sucesso-inline">✓ {km(calculo.distanciaKm)} · <strong>{moeda(calculo.valor)}</strong></span>
          )}
        </div>
        <p className="campo-dica" style={{ marginTop: 6 }}>Se não calcular agora, o valor é calculado automaticamente ao lançar.</p>

        <div className="grade-campos" style={{ marginTop: 12 }}>
          <Campo rotulo="Forma de pagamento do cliente">
            <select value={v.formaPagamento} onChange={set("formaPagamento")}>
              <option value="">—</option>
              {PAGAMENTOS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Prazo desejado"><input value={v.prazoDesejado} onChange={set("prazoDesejado")} placeholder="Ex.: até 40 min" /></Campo>
          <Campo rotulo="Observação para o entregador" largo>
            <textarea rows={2} value={v.observacao} onChange={set("observacao")} placeholder="Ex.: troco para R$ 50, apto 12, interfone quebrado…" />
          </Campo>
        </div>

        <button type="button" className="link" onClick={() => setMaisOpcoes(m => !m)} aria-expanded={maisOpcoes} style={{ marginTop: 10 }}>
          {maisOpcoes ? "− Ocultar nota fiscal" : "+ Nota fiscal (opcional)"}
        </button>
        {maisOpcoes && (
          <div className="grade-campos" style={{ marginTop: 10 }}>
            <Campo rotulo="Nº da nota fiscal"><input value={v.notaFiscalNumero} onChange={set("notaFiscalNumero")} /></Campo>
            <Campo rotulo="Valor da nota (R$)"><input type="number" step="0.01" min="0" value={v.notaFiscalValor} onChange={set("notaFiscalValor")} /></Campo>
            <Campo rotulo="Chave de acesso da NF-e" largo dica="44 dígitos.">
              <input value={v.notaFiscalChave} inputMode="numeric" maxLength={54} onChange={e => setV({ ...v, notaFiscalChave: e.target.value.replace(/[^\d ]/g, "") })} />
            </Campo>
          </div>
        )}

        <label className="campo campo-switch campo-largo pronto-agora">
          <input type="checkbox" role="switch" checked={pronto} onChange={e => setPronto(e.target.checked)} />
          <span className="interruptor" aria-hidden="true" />
          <span>
            <strong>O pedido já está pronto</strong>
            <small className="campo-dica" style={{ display: "block" }}>
              {pronto ? "Os entregadores são chamados assim que você lançar." : "A entrega fica “Criada”; clique em “Pedido pronto” quando for a hora de chamar o entregador."}
            </small>
          </span>
        </label>

        <div className="form-rodape">
          <Botao variante="fantasma" onClick={() => { setV(VAZIO); setCalculo(null); }}>Limpar</Botao>
          <button type="submit" className="btn btn-primario" disabled={ocupado}>{pronto ? "Lançar e chamar entregador" : "Lançar entrega"}</button>
        </div>
      </form>
    </>
  );
}
