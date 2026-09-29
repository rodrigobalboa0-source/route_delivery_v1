import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { Botao, Cabecalho, Campo, useAcao } from "../components/ui";
import { VEICULOS, km, moeda } from "../utils/format";

const VAZIO = {
  comercioId: "", clienteNome: "", clienteTelefone: "", endereco: "", formaPagamento: "", prazoDesejado: "", valor: "", observacao: "",
  notaFiscalNumero: "", notaFiscalChave: "", notaFiscalValor: "",
};

export default function NovaEntrega() {
  const navegar = useNavigate();
  const { podeEditar } = useAuth();
  const { dados: comercios } = useApi("/comercios?bloqueado=false");
  const [v, setV] = useState(VAZIO);
  const [veiculo, setVeiculo] = useState("MOTO");
  const [calculo, setCalculo] = useState(null);
  const { executar, ocupado } = useAcao();

  const set = k => e => {
    setV({ ...v, [k]: e.target.value });
    if (k === "endereco" || k === "comercioId") setCalculo(null);
  };

  async function calcular() {
    const r = await executar(() => api.post("/nova-entrega/calcular", { comercioId: v.comercioId, endereco: v.endereco, veiculo }));
    if (r) {
      setCalculo(r);
      setV(atual => ({ ...atual, valor: r.valor }));
    }
  }

  async function criar(e) {
    e.preventDefault();
    const r = await executar(() => api.post("/nova-entrega", v), `Pedido criado.`);
    if (r) navegar(`/operacao?abrir=${r.id}`);
  }

  if (!podeEditar("pedidos")) {
    return (
      <>
        <Cabecalho titulo="Nova Entrega" />
        <div className="aviso-caixa">Sua conta não tem permissão para criar entregas.</div>
      </>
    );
  }

  return (
    <>
      <Cabecalho titulo="Nova Entrega" subtitulo="Crie uma entrega em nome de um comerciante. Ela entra como “Preparando” até ser marcada como pronta." />

      <form onSubmit={criar} className="cartao form-pagina">
        <h3 className="secao-titulo">Origem</h3>
        <div className="grade-campos">
          <Campo rotulo="Comerciante *" largo>
            <select value={v.comercioId} onChange={set("comercioId")} required>
              <option value="">Selecione…</option>
              {(comercios || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
            </select>
          </Campo>
        </div>

        <h3 className="secao-titulo">Cliente e destino</h3>
        <div className="grade-campos">
          <Campo rotulo="Nome do cliente *"><input value={v.clienteNome} onChange={set("clienteNome")} required /></Campo>
          <Campo rotulo="Telefone do cliente"><input value={v.clienteTelefone} onChange={set("clienteTelefone")} /></Campo>
          <Campo rotulo="Endereço de entrega *" largo dica="Rua, número e bairro. A distância é calculada pelo percurso real, não em linha reta.">
            <input value={v.endereco} onChange={set("endereco")} required />
          </Campo>
        </div>

        <h3 className="secao-titulo">Valor</h3>
        <div className="linha-acao">
          <select value={veiculo} onChange={e => { setVeiculo(e.target.value); setCalculo(null); }} aria-label="Veículo para o cálculo" style={{ flex: "0 0 auto", minWidth: 105 }}>
            {Object.entries(VEICULOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
          <Botao disabled={!v.comercioId || !v.endereco || ocupado} onClick={calcular}>Calcular distância e valor</Botao>
          {calculo && (
            <span className="sucesso-inline">
              ✓ {km(calculo.distanciaKm)} de percurso · {moeda(calculo.valor)}
              {calculo.fonte && <span className="apagado"> · rota pelo {calculo.fonte === "google" ? "Google Maps" : "OpenStreetMap"}</span>}
            </span>
          )}
        </div>
        <div className="grade-campos" style={{ marginTop: 12 }}>
          <Campo rotulo="Valor da entrega (R$)" dica="Em branco = cálculo automático ao criar.">
            <input type="number" step="0.01" min="0" value={v.valor} onChange={set("valor")} />
          </Campo>
          <Campo rotulo="Forma de pagamento"><input value={v.formaPagamento} onChange={set("formaPagamento")} placeholder="Pix, cartão, dinheiro…" /></Campo>
          <Campo rotulo="Prazo desejado"><input value={v.prazoDesejado} onChange={set("prazoDesejado")} placeholder="Ex.: até 40 min" /></Campo>
          <Campo rotulo="Observação para o entregador" largo>
            <textarea rows={2} value={v.observacao} onChange={set("observacao")} />
          </Campo>
        </div>

        <h3 className="secao-titulo">Nota fiscal (opcional)</h3>
        <div className="grade-campos">
          <Campo rotulo="Nº da nota fiscal"><input value={v.notaFiscalNumero} onChange={set("notaFiscalNumero")} /></Campo>
          <Campo rotulo="Valor da nota (R$)"><input type="number" step="0.01" min="0" value={v.notaFiscalValor} onChange={set("notaFiscalValor")} /></Campo>
          <Campo rotulo="Chave de acesso da NF-e" largo dica="44 dígitos.">
            <input value={v.notaFiscalChave} inputMode="numeric" maxLength={54} onChange={e => setV({ ...v, notaFiscalChave: e.target.value.replace(/[^\d ]/g, "") })} />
          </Campo>
        </div>

        <div className="form-rodape">
          <Botao variante="fantasma" onClick={() => { setV(VAZIO); setCalculo(null); }}>Limpar</Botao>
          <button type="submit" className="btn btn-primario" disabled={ocupado}>Criar entrega</button>
        </div>
      </form>
    </>
  );
}
