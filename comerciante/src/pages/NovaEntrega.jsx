import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Botao, Cabecalho, Campo, useAcao } from "../components/ui";
import CampoCliente from "../components/CampoCliente";
import { VEICULOS, dataHora, km, moeda } from "../utils/format";

const VAZIO = {
  clienteNome: "", clienteTelefone: "", endereco: "", complemento: "", formaPagamento: "", prazoDesejado: "", observacao: "",
  notaFiscalNumero: "", notaFiscalChave: "", notaFiscalValor: "", agendadoPara: "",
};
const PAGAMENTOS = ["Pago (online)", "Pix", "Cartão na entrega", "Dinheiro"];

// Valor para <input type="datetime-local"> daqui a N minutos (hora local).
function daquiA(min) {
  const d = new Date(Date.now() + min * 60000);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Solicitar Entrega (formulário completo). Com `agendar`, abre já com o horário para agendamento.
export default function NovaEntrega({ agendar = false }) {
  const navegar = useNavigate();
  const { loja } = useAuth();
  const [v, setV] = useState(() => ({ ...VAZIO, agendadoPara: agendar ? daquiA(60) : "" }));
  const [pronto, setPronto] = useState(true);
  const [retorno, setRetorno] = useState(false);
  const [agendado, setAgendado] = useState(agendar);
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
  const setTexto = k => valor => {
    setV(atual => ({ ...atual, [k]: valor }));
    if (k === "endereco") setCalculo(null);
  };
  const escolherCliente = c => {
    setV(atual => ({ ...atual, clienteNome: c.nome, clienteTelefone: c.telefone || "", endereco: c.endereco, complemento: c.complemento || "" }));
    setCalculo(null);
  };

  async function calcular() {
    const r = await executar(() => api.post("/pedidos/calcular", { endereco: v.endereco, veiculo }));
    if (r) setCalculo(r);
  }

  async function criar(e) {
    e.preventDefault();
    const agendadoPara = agendado && v.agendadoPara ? new Date(v.agendadoPara).toISOString() : null;
    const r = await executar(
      () => api.post("/pedidos", { ...v, agendadoPara, retorno, pronto: !agendadoPara && pronto }),
      agendadoPara ? "Entrega agendada." : pronto ? "Entrega lançada! Já estamos chamando um entregador." : "Entrega lançada. Marque como pronto quando o pedido estiver pronto."
    );
    if (r) navegar(agendadoPara ? "/agendamentos" : `/relatorios/entregas?abrir=${r.id}`);
  }

  const textoBotao = agendado ? "Agendar entrega" : pronto ? "Lançar e chamar entregador" : "Lançar entrega";

  return (
    <>
      <Cabecalho titulo={agendar ? "Novo agendamento" : "Solicitar Entrega"} subtitulo="Informe o cliente e o endereço. O valor é calculado pelo percurso real." />

      <form onSubmit={criar} className="painel-bloco form-pagina">
        <h3 className="secao-titulo">Cliente e destino</h3>
        <div className="grade-campos">
          <Campo rotulo="Nome do cliente *">
            <CampoCliente rotulo="Nome do cliente" valor={v.clienteNome} onChange={setTexto("clienteNome")} onEscolher={escolherCliente} obrigatorio autoFocus />
          </Campo>
          <Campo rotulo="Telefone do cliente">
            <CampoCliente rotulo="Telefone do cliente" tipo="tel" placeholder="(11) 90000-0000" valor={v.clienteTelefone} onChange={setTexto("clienteTelefone")} onEscolher={escolherCliente} />
          </Campo>
          <Campo rotulo="Endereço de entrega *" dica="Rua, número, bairro e cidade.">
            <CampoCliente rotulo="Endereço de entrega" placeholder="Ex.: Rua Augusta, 1500 - Consolação, São Paulo" valor={v.endereco} onChange={setTexto("endereco")} onEscolher={escolherCliente} obrigatorio />
          </Campo>
          <Campo rotulo="Complemento"><input value={v.complemento} onChange={set("complemento")} placeholder="Apto, bloco, ponto de referência" /></Campo>
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
            <textarea rows={2} value={v.observacao} onChange={set("observacao")} placeholder="Ex.: troco para R$ 50, interfone quebrado…" />
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

        <div className="opcoes-entrega">
          <label className="campo campo-switch opcao-entrega">
            <input type="checkbox" role="switch" checked={retorno} onChange={e => setRetorno(e.target.checked)} />
            <span className="interruptor" aria-hidden="true" />
            <span><strong>Retorno à loja</strong><small className="campo-dica">O entregador volta à loja depois (maquininha, troco, devolução).</small></span>
          </label>
          <label className="campo campo-switch opcao-entrega">
            <input type="checkbox" role="switch" checked={agendado} onChange={e => { setAgendado(e.target.checked); if (e.target.checked && !v.agendadoPara) setV(a => ({ ...a, agendadoPara: daquiA(60) })); }} />
            <span className="interruptor" aria-hidden="true" />
            <span><strong>Agendar</strong><small className="campo-dica">Chamar o entregador num horário marcado.</small></span>
          </label>
          {agendado ? (
            <label className="campo opcao-entrega">
              <span className="campo-rotulo">Chamar o entregador em *</span>
              <input type="datetime-local" value={v.agendadoPara} min={daquiA(2)} onChange={set("agendadoPara")} required />
              {v.agendadoPara && <small className="campo-dica">{dataHora(new Date(v.agendadoPara))}</small>}
            </label>
          ) : (
            <label className="campo campo-switch opcao-entrega">
              <input type="checkbox" role="switch" checked={pronto} onChange={e => setPronto(e.target.checked)} />
              <span className="interruptor" aria-hidden="true" />
              <span>
                <strong>O pedido já está pronto</strong>
                <small className="campo-dica">{pronto ? "Os entregadores são chamados assim que você lançar." : "Fica “Criado”; clique em “Pedido pronto” na hora certa."}</small>
              </span>
            </label>
          )}
        </div>

        <div className="form-rodape">
          <Botao variante="fantasma" onClick={() => { setV({ ...VAZIO, agendadoPara: agendado ? daquiA(60) : "" }); setCalculo(null); }}>Limpar</Botao>
          <button type="submit" className="btn btn-laranja" disabled={ocupado}>{textoBotao}</button>
        </div>
      </form>
    </>
  );
}
