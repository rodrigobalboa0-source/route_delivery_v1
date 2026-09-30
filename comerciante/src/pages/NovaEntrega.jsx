import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Botao, Cabecalho, Campo } from "../components/ui";
import CampoCliente from "../components/CampoCliente";
import CampoEndereco from "../components/CampoEndereco";
import { useFormEntrega } from "../hooks/useFormEntrega";
import { AvisoCliente, ResumoValor } from "./Painel";
import { VEICULOS, dataHora } from "../utils/format";

const VAZIO = {
  clienteNome: "", clienteTelefone: "", endereco: "", complemento: "", formaPagamento: "", prazoDesejado: "", observacao: "",
  notaFiscalNumero: "", notaFiscalChave: "", notaFiscalValor: "",
};
const PAGAMENTOS = ["Pago (online)", "Pix", "Cartão na entrega", "Dinheiro"];

// Valor para <input type="datetime-local"> daqui a N minutos (hora local).
function daquiA(min) {
  const d = new Date(Date.now() + min * 60000);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Solicitar Entrega (formulário completo). Com `agendar`, abre já com data e horário para agendamento.
export default function NovaEntrega({ agendar = false }) {
  const navegar = useNavigate();
  const { loja } = useAuth();
  const f = useFormEntrega({ vazio: VAZIO });
  const { v, mudar, calculo, ocupado } = f;
  const [pronto, setPronto] = useState(false); // pronto manual: a loja marca quando o pedido estiver pronto
  const [agendado, setAgendado] = useState(agendar);
  const [agendadoPara, setAgendadoPara] = useState(agendar ? daquiA(60) : "");
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const pct = loja?.retornoPercentual ?? 20;
  const comCodigo = !!loja?.permissoes?.codigoTelefone; // telefone obrigatório: os 4 últimos números são o código de entrega

  // Veículos com preço configurado para a loja (sem configuração: todos).
  const veiculos = loja?.precificacoesModal?.length ? loja.precificacoesModal.map(p => p.veiculo) : Object.keys(VEICULOS);
  const set = k => e => mudar(k, e.target.value);
  const setTexto = k => valor => mudar(k, valor);

  async function criar(e) {
    e.preventDefault();
    const quando = agendado && agendadoPara ? new Date(agendadoPara).toISOString() : null;
    const r = await f.executar(
      () => api.post("/pedidos", f.corpo({ agendadoPara: quando, pronto: !quando && pronto })),
      quando ? `Entrega agendada para ${dataHora(quando)}. Ela vai para os entregadores sozinha nesse horário.`
        : pronto ? "Entrega lançada! Já estamos chamando um entregador." : "Entrega lançada. Marque como pronto quando o pedido estiver pronto."
    );
    if (r) navegar(quando ? "/agendamentos" : `/relatorios/entregas?abrir=${r.id}`);
  }

  const textoBotao = agendado ? "Agendar entrega" : pronto ? "Lançar e chamar entregador" : "Lançar entrega";

  return (
    <>
      <Cabecalho titulo={agendar ? "Novo agendamento" : "Solicitar Entrega"} subtitulo="Digite o telefone: se o cliente já pediu, os dados aparecem sozinhos. O endereço é buscado no mapa (OpenStreetMap)." />

      <form onSubmit={criar} className="painel-bloco form-pagina">
        <h3 className="secao-titulo">Cliente e destino</h3>
        <div className="grade-campos">
          <Campo rotulo={comCodigo ? "Telefone do cliente *" : "Telefone do cliente"} dica={<>
            <AvisoCliente cliente={f.cliente} />
            {comCodigo && <span className="apagado"> 🔒 Os 4 últimos números são o código para o entregador finalizar a entrega.</span>}
          </>}>
            <CampoCliente rotulo="Telefone do cliente" tipo="tel" placeholder="(11) 90000-0000" valor={v.clienteTelefone} onChange={setTexto("clienteTelefone")} onEscolher={f.aplicarCliente} autoFocus obrigatorio={comCodigo} />
          </Campo>
          <Campo rotulo="Nome do cliente *">
            <CampoCliente rotulo="Nome do cliente" valor={v.clienteNome} onChange={setTexto("clienteNome")} onEscolher={f.aplicarCliente} obrigatorio />
          </Campo>
          <Campo rotulo="Endereço de entrega *" dica="Comece a digitar a rua e o número e escolha na lista.">
            <CampoEndereco valor={v.endereco} onChange={setTexto("endereco")} onEscolherEndereco={f.escolherEndereco} onEscolherCliente={f.aplicarCliente} placeholder="Ex.: Rua Augusta, 1500" obrigatorio />
          </Campo>
          <Campo rotulo="Complemento"><input value={v.complemento} onChange={set("complemento")} placeholder="Apto, bloco, ponto de referência" /></Campo>
        </div>

        <h3 className="secao-titulo">Valor da entrega</h3>
        <div className="linha-acao">
          {veiculos.length > 1 && (
            <select value={f.veiculo} onChange={e => f.setVeiculo(e.target.value)} aria-label="Veículo" style={{ flex: "0 0 auto", minWidth: 105 }}>
              {veiculos.map(k => <option key={k} value={k}>{VEICULOS[k] || k}</option>)}
            </select>
          )}
          <Botao disabled={!v.endereco || ocupado} onClick={() => f.calcular()}>Calcular valor</Botao>
          {calculo && <span className="sucesso-inline"><ResumoValor calculo={calculo} /></span>}
        </div>
        <p className="campo-dica" style={{ marginTop: 6 }}>Ao escolher o endereço na lista, o valor é calculado na hora.</p>

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
              <input value={v.notaFiscalChave} inputMode="numeric" maxLength={54} onChange={e => mudar("notaFiscalChave", e.target.value.replace(/[^\d ]/g, ""))} />
            </Campo>
          </div>
        )}

        <div className="opcoes-entrega">
          <label className="campo campo-switch opcao-entrega">
            <input type="checkbox" role="switch" checked={f.retorno} onChange={e => f.setRetorno(e.target.checked)} />
            <span className="interruptor" aria-hidden="true" />
            <span><strong>Retorno à loja (+{pct}%)</strong><small className="campo-dica">O entregador volta à loja depois (maquininha, troco, devolução). A taxa fica {pct}% maior.</small></span>
          </label>
          <label className="campo campo-switch opcao-entrega">
            <input type="checkbox" role="switch" checked={agendado} onChange={e => { setAgendado(e.target.checked); if (e.target.checked && !agendadoPara) setAgendadoPara(daquiA(60)); }} />
            <span className="interruptor" aria-hidden="true" />
            <span><strong>Agendar</strong><small className="campo-dica">No dia e horário marcados o pedido fica pronto sozinho e vai para os entregadores aceitarem.</small></span>
          </label>
          {agendado ? (
            <label className="campo opcao-entrega">
              <span className="campo-rotulo">Data e horário *</span>
              <input type="datetime-local" value={agendadoPara} min={daquiA(2)} onChange={e => setAgendadoPara(e.target.value)} required aria-label="Data e horário do agendamento" />
              {agendadoPara && <small className="campo-dica">Entregadores chamados em {dataHora(new Date(agendadoPara))}</small>}
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
          <Botao variante="fantasma" onClick={() => f.limpar()}>Limpar</Botao>
          <button type="submit" className="btn btn-laranja" disabled={ocupado}>{textoBotao}</button>
        </div>
      </form>
    </>
  );
}
