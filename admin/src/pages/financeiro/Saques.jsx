// Financeiro › Saques — pedidos de saque dos entregadores (Carteira do app).
// Faça a transferência para a conta mostrada e clique em "Marcar como pago"; ou recuse (o valor volta ao saldo).
import { useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useApi } from "../../hooks/useApi";
import { Badge, Botao, Cabecalho, Campo, Carregando, ErroCaixa, Modal, StatTile, Vazio, useAcao } from "../../components/ui";
import { dataHora, moeda, numero } from "../../utils/format";

const STATUS = { PENDENTE: ["aviso", "Aguardando pagamento"], PAGO: ["ok", "Pago"], RECUSADO: ["critico", "Recusado"] };
const TIPO = { NORMAL: "Normal", RAPIDO: "Rápido" };
const TIPO_CONTA = { CORRENTE: "Conta corrente", POUPANCA: "Poupança", PAGAMENTO: "Conta de pagamento" };
const doc = d => (d?.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d?.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") : d || "—");

function Conta({ c }) {
  if (!c) return <span className="apagado">—</span>;
  return (
    <div className="conta-saque">
      {c.pixChave && <div><strong>PIX ({c.pixTipo?.toLowerCase()}):</strong> {c.pixChave}</div>}
      <div>{c.banco} · Ag. {c.agencia} · {TIPO_CONTA[c.tipoConta] || "Conta"} {c.conta}</div>
      <div className="celula-sub">{c.titular} · {doc(c.documento)}</div>
    </div>
  );
}

export default function Saques() {
  const { podeEditar } = useAuth();
  const pode = podeEditar("financeiro");
  const [filtro, setFiltro] = useState("PENDENTE");
  const { dados, erro, carregando, recarregar } = useApi(`/financeiro/saques?status=${filtro}`);
  const [pagando, setPagando] = useState(null);
  const [recusando, setRecusando] = useState(null);
  const [v, setV] = useState({ formaPagamento: "PIX", observacao: "", motivo: "" });
  const { executar, ocupado } = useAcao();
  const lista = dados || [];
  const total = lista.reduce((s, x) => s + x.valor, 0);

  async function pagar(e) {
    e.preventDefault();
    if (await executar(() => api.post(`/financeiro/saques/${pagando.id}/pagar`, { formaPagamento: v.formaPagamento, observacao: v.observacao }), `Saque nº ${pagando.numero} marcado como pago. O entregador foi avisado.`)) {
      setPagando(null); recarregar({ silencioso: true });
    }
  }
  async function recusar(e) {
    e.preventDefault();
    if (await executar(() => api.post(`/financeiro/saques/${recusando.id}/recusar`, { motivo: v.motivo }), `Saque nº ${recusando.numero} recusado. O valor voltou ao saldo do entregador.`)) {
      setRecusando(null); recarregar({ silencioso: true });
    }
  }

  return (
    <>
      <Cabecalho titulo="Saques" subtitulo="Pedidos de saque feitos pelos entregadores na Carteira do app">
        <select value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Mostrar">
          <option value="PENDENTE">Aguardando pagamento</option>
          <option value="PAGO">Pagos</option>
          <option value="RECUSADO">Recusados</option>
          <option value="">Todos</option>
        </select>
      </Cabecalho>
      <ErroCaixa erro={erro} />
      {dados && (
        <div className="grade-stats">
          <StatTile rotulo={filtro === "PENDENTE" ? "A pagar" : "Total listado"} valor={moeda(total)} />
          <StatTile rotulo="Pedidos" valor={numero(lista.length)} />
        </div>
      )}
      <div className="aviso-caixa">O valor do saque sai do saldo do entregador assim que ele pede. Transfira para a conta mostrada e marque como pago; ao recusar, o valor volta para o saldo dele.</div>
      <section className="cartao cartao-tabela">
        {carregando && !dados ? <Carregando /> : lista.length === 0 ? <Vazio titulo={filtro === "PENDENTE" ? "Nenhum saque aguardando pagamento" : "Nenhum saque"} /> : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Pedido</th><th>Entregador</th><th>Conta para pagamento</th><th>Status</th><th className="num">Valor</th><th /></tr></thead>
              <tbody>
                {lista.map(s => (
                  <tr key={s.id}>
                    <td><strong>Nº {s.numero}</strong><div className="celula-sub">{dataHora(s.createdAt)} · {TIPO[s.tipo]}</div></td>
                    <td>{s.entregador?.nomeCompleto}<div className="celula-sub">Saldo atual: {moeda(s.saldoAtual)}</div></td>
                    <td><Conta c={s.conta} /></td>
                    <td>
                      <Badge tom={STATUS[s.status][0]}>{STATUS[s.status][1]}</Badge>
                      {s.pagoEm && <div className="celula-sub">{dataHora(s.pagoEm)}{s.formaPagamento ? ` · ${s.formaPagamento}` : ""}{s.analisadoPor ? ` · ${s.analisadoPor}` : ""}</div>}
                      {s.motivo && <div className="celula-sub">Motivo: {s.motivo}</div>}
                    </td>
                    <td className="num">
                      <strong>{moeda(s.valor)}</strong>
                      {s.valorTaxa > 0 && <div className="celula-sub">taxa {s.taxaPercentual}% ({moeda(s.valorTaxa)}) · pagar {moeda(s.valor - s.valorTaxa)}</div>}
                    </td>
                    <td className="botoes">
                      {pode && s.status === "PAGO" && <Botao pequeno variante="fantasma" disabled={ocupado} onClick={async () => { if (await executar(() => api.post(`/financeiro/saques/${s.id}/pendente`), `Saque nº ${s.numero} voltou para pagamento pendente.`)) recarregar({ silencioso: true }); }}>Marcar como pendente</Botao>}
                      {pode && s.status === "PENDENTE" && <>
                        <Botao pequeno variante="primario" disabled={ocupado} onClick={() => { setPagando(s); setV({ ...v, formaPagamento: "PIX", observacao: "" }); }}>Confirmar como pago</Botao>
                        <Botao pequeno variante="perigo-leve" disabled={ocupado} onClick={() => { setRecusando(s); setV({ ...v, motivo: "" }); }}>Recusar</Botao>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pagando && (
        <Modal titulo={`Pagar saque nº ${pagando.numero} — ${moeda(pagando.valor)}`} onFechar={() => setPagando(null)}>
          <form onSubmit={pagar}>
            <p>Transfira <strong>{moeda(pagando.valor - (pagando.valorTaxa || 0))}</strong> para {pagando.entregador?.nomeCompleto}{pagando.valorTaxa > 0 ? ` (sacou ${moeda(pagando.valor)}, taxa de ${pagando.taxaPercentual}%)` : ""}:</p>
            <Conta c={pagando.conta} />
            <Campo rotulo="Forma de pagamento">
              <select value={v.formaPagamento} onChange={e => setV({ ...v, formaPagamento: e.target.value })}>
                <option>PIX</option><option>TED</option><option>Transferência</option><option>Dinheiro</option>
              </select>
            </Campo>
            <Campo rotulo="Observação (opcional)"><input value={v.observacao} onChange={e => setV({ ...v, observacao: e.target.value })} placeholder="Ex.: ID da transação" /></Campo>
            <div className="form-rodape">
              <Botao variante="fantasma" onClick={() => setPagando(null)}>Cancelar</Botao>
              <button type="submit" className="btn btn-primario" disabled={ocupado}>Confirmar pagamento</button>
            </div>
          </form>
        </Modal>
      )}
      {recusando && (
        <Modal titulo={`Recusar saque nº ${recusando.numero} — ${moeda(recusando.valor)}`} onFechar={() => setRecusando(null)}>
          <form onSubmit={recusar}>
            <Campo rotulo="Motivo (o entregador vê no app) *">
              <textarea rows={3} value={v.motivo} onChange={e => setV({ ...v, motivo: e.target.value })} required placeholder="Ex.: dados bancários não conferem com o titular" autoFocus />
            </Campo>
            <div className="form-rodape">
              <Botao variante="fantasma" onClick={() => setRecusando(null)}>Cancelar</Botao>
              <button type="submit" className="btn btn-perigo" disabled={ocupado}>Recusar saque</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
