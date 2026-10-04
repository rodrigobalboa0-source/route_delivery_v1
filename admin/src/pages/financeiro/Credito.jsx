// Financeiro › Crédito — saldo pré-pago de cada comércio, com extrato e lançamentos.
import { useEffect, useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useApi } from "../../hooks/useApi";
import { Badge, Botao, BotaoConfirmar, Cabecalho, Campo, Carregando, ErroCaixa, Modal, StatTile, Vazio, useAcao } from "../../components/ui";
import { TabelaRelatorio } from "../../components/relatorios";
import { dataHora, moeda, numero } from "../../utils/format";

// Data URL -> endereço local (blob:) — o navegador abre PDF e imagem grandes sem travar.
function urlDoComprovante(dataUrl) {
  const [cab, b64] = dataUrl.split(",");
  const tipo = cab.slice(5, cab.indexOf(";"));
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { url: URL.createObjectURL(new Blob([bytes], { type: tipo })), pdf: tipo === "application/pdf" };
}

function Comprovante({ solicitacao, onFechar }) {
  const { dados, erro } = useApi(`/financeiro/creditos/solicitacoes/${solicitacao.id}/comprovante`);
  const [arq, setArq] = useState(null);
  useEffect(() => {
    if (!dados?.comprovante) return;
    const a = urlDoComprovante(dados.comprovante);
    setArq(a);
    return () => URL.revokeObjectURL(a.url);
  }, [dados]);
  return (
    <Modal titulo={`Comprovante — ${solicitacao.comercio} · ${moeda(solicitacao.valor)}`} onFechar={onFechar} largo>
      <ErroCaixa erro={erro} />
      {!arq ? <Carregando /> : (
        <>
          {arq.pdf
            ? <iframe title="Comprovante (PDF)" src={arq.url} className="comprovante-pdf" />
            : <img src={arq.url} alt="Comprovante do pagamento" className="comprovante-img" />}
          <p><a href={arq.url} target="_blank" rel="noreferrer">Abrir em nova aba</a></p>
        </>
      )}
    </Modal>
  );
}

const STATUS_SOLICITACAO = { PENDENTE: ["aviso", "Aguardando análise"], APROVADA: ["ok", "Aprovada"], RECUSADA: ["critico", "Recusada"] };

// Pedidos de crédito das lojas: ver o comprovante e aprovar (lança o crédito) ou recusar (com motivo).
function Solicitacoes({ pode, onAlterado }) {
  const [filtro, setFiltro] = useState("PENDENTE");
  const { dados, erro, recarregar } = useApi(`/financeiro/creditos/solicitacoes?status=${filtro}`);
  const [comprovante, setComprovante] = useState(null);
  const [recusando, setRecusando] = useState(null);
  const [motivo, setMotivo] = useState("");
  const { executar, ocupado } = useAcao();

  async function aprovar(s) {
    if (await executar(() => api.post(`/financeiro/creditos/solicitacoes/${s.id}/aprovar`), `Crédito de ${moeda(s.valor)} lançado para ${s.comercio}.`)) {
      recarregar({ silencioso: true }); onAlterado();
    }
  }
  async function recusar(e) {
    e.preventDefault();
    if (await executar(() => api.post(`/financeiro/creditos/solicitacoes/${recusando.id}/recusar`, { motivo }), "Solicitação recusada. A loja vê o motivo.")) {
      setRecusando(null); setMotivo(""); recarregar({ silencioso: true });
    }
  }

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>Solicitações de crédito {filtro === "PENDENTE" && dados?.length > 0 && <Badge tom="aviso">{dados.length}</Badge>}</h2>
        <select value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Mostrar">
          <option value="PENDENTE">Aguardando análise</option>
          <option value="APROVADA">Aprovadas</option>
          <option value="RECUSADA">Recusadas</option>
          <option value="">Todas</option>
        </select>
      </div>
      <p className="apagado" style={{ marginTop: 0 }}>Pedidos feitos pelas lojas em Créditos, com o comprovante do pagamento. Aprovar lança o valor como crédito no saldo da loja.</p>
      <ErroCaixa erro={erro} />
      {!dados ? <Carregando /> : dados.length === 0 ? <Vazio titulo={filtro === "PENDENTE" ? "Nenhuma solicitação aguardando análise" : "Nenhuma solicitação"} /> : (
        <table className="tabela tabela-compacta">
          <thead><tr><th>Pedido em</th><th>Comércio</th><th>Método</th><th>Observação</th><th>Status</th><th className="num">Valor</th><th /></tr></thead>
          <tbody>
            {dados.map(s => (
              <tr key={s.id}>
                <td>{dataHora(s.createdAt)}</td>
                <td><strong>{s.comercio}</strong></td>
                <td>{s.metodo === "PIX" ? "PIX" : "Outros"}</td>
                <td className="apagado">{s.observacao || "—"}</td>
                <td>
                  <Badge tom={STATUS_SOLICITACAO[s.status][0]}>{STATUS_SOLICITACAO[s.status][1]}</Badge>
                  {s.analisadoEm && <div className="celula-sub">{s.analisadoPor || "—"} · {dataHora(s.analisadoEm)}</div>}
                  {s.motivo && <div className="celula-sub">Motivo: {s.motivo}</div>}
                </td>
                <td className="num"><strong>{moeda(s.valor)}</strong></td>
                <td className="botoes">
                  <Botao pequeno variante="fantasma" onClick={() => setComprovante(s)}>Ver comprovante</Botao>
                  {pode && s.status === "PENDENTE" && <>
                    <BotaoConfirmar pequeno variante="primario" confirmar={`Lançar ${moeda(s.valor)}?`} disabled={ocupado} onConfirm={() => aprovar(s)}>Aprovar</BotaoConfirmar>
                    <Botao pequeno variante="perigo-leve" disabled={ocupado} onClick={() => { setRecusando(s); setMotivo(""); }}>Recusar</Botao>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {comprovante && <Comprovante solicitacao={comprovante} onFechar={() => setComprovante(null)} />}
      {recusando && (
        <Modal titulo={`Recusar ${moeda(recusando.valor)} — ${recusando.comercio}`} onFechar={() => setRecusando(null)}>
          <form onSubmit={recusar}>
            <Campo rotulo="Motivo (a loja vai ver) *">
              <textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} required placeholder="Ex.: comprovante ilegível, valor não confere com o PIX recebido…" autoFocus />
            </Campo>
            <div className="form-rodape">
              <Botao variante="fantasma" onClick={() => setRecusando(null)}>Cancelar</Botao>
              <button type="submit" className="btn btn-perigo" disabled={ocupado}>Recusar solicitação</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function Extrato({ comercio, pode, onAlterado }) {
  const { dados, recarregar } = useApi(`/financeiro/creditos/${comercio.comercioId}`);
  const [v, setV] = useState({ tipo: "CREDITO", valor: "", descricao: "" });
  const { executar, ocupado } = useAcao();

  async function lancar(e) {
    e.preventDefault();
    const r = await executar(() => api.post("/financeiro/creditos", { comercioId: comercio.comercioId, ...v }), v.tipo === "CREDITO" ? "Crédito lançado." : "Débito lançado.");
    if (r) { setV({ tipo: v.tipo, valor: "", descricao: "" }); recarregar({ silencioso: true }); onAlterado(); }
  }

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>{comercio.nome}</h2>
        <span>Saldo <strong className={dados?.saldo < 0 ? "texto-critico" : ""}>{moeda(dados?.saldo ?? comercio.saldo)}</strong></span>
      </div>
      {pode && (
        <form onSubmit={lancar} className="grade-campos lancamento-credito">
          <Campo rotulo="Tipo">
            <select value={v.tipo} onChange={e => setV({ ...v, tipo: e.target.value })}>
              <option value="CREDITO">Crédito (+) — recarga, bônus, estorno</option>
              <option value="DEBITO">Débito (−) — uso, ajuste</option>
            </select>
          </Campo>
          <Campo rotulo="Valor (R$) *"><input type="number" step="0.01" min="0.01" value={v.valor} onChange={e => setV({ ...v, valor: e.target.value })} required /></Campo>
          <Campo rotulo="Descrição *" largo><input value={v.descricao} onChange={e => setV({ ...v, descricao: e.target.value })} required placeholder="Ex.: Recarga via Pix" /></Campo>
          <div className="form-rodape campo-largo"><button type="submit" className="btn btn-primario" disabled={ocupado}>Lançar</button></div>
        </form>
      )}
      {!dados ? <Carregando /> : dados.extrato.length === 0 ? <Vazio titulo="Nenhum lançamento" /> : (
        <table className="tabela tabela-compacta">
          <thead><tr><th>Data</th><th>Descrição</th><th>Lançado por</th><th className="num">Valor</th><th className="num">Saldo</th></tr></thead>
          <tbody>
            {dados.extrato.map(m => (
              <tr key={m.id}>
                <td>{dataHora(m.createdAt)}</td>
                <td>{m.descricao}</td>
                <td className="apagado">{m.autorNome || "—"}</td>
                <td className="num">{m.tipo === "CREDITO" ? <span className="texto-ok">+ {moeda(m.valor)}</span> : <span className="texto-critico">− {moeda(m.valor)}</span>}</td>
                <td className="num">{moeda(m.saldoApos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function Credito() {
  const { podeEditar } = useAuth();
  const pode = podeEditar("financeiro");
  const { dados, erro, carregando, recarregar } = useApi("/financeiro/creditos");
  const [aberto, setAberto] = useState(null);
  const comSaldo = (dados?.linhas || []).filter(l => l.saldo > 0).length;

  return (
    <>
      <Cabecalho titulo="Crédito" subtitulo="Saldo pré-pago de cada comerciante: recargas, usos e ajustes" />
      <ErroCaixa erro={erro} />
      {dados && (
        <div className="grade-stats">
          <StatTile rotulo="Crédito total em aberto" valor={moeda(dados.total)} />
          <StatTile rotulo="Comércios com saldo" valor={numero(comSaldo)} detalhe={`de ${numero(dados.linhas.length)}`} />
        </div>
      )}
      <Solicitacoes pode={pode} onAlterado={() => recarregar({ silencioso: true })} />
      <div className="aviso-caixa">Os lançamentos são manuais (ou pela aprovação das solicitações). O crédito ainda não é descontado automaticamente das entregas nem das faturas.</div>
      <TabelaRelatorio
        linhas={dados?.linhas}
        carregando={carregando}
        chaveLinha={l => l.comercioId}
        onLinha={l => setAberto(l)}
        nomeCsv="creditos_comercios"
        colunas={[
          { chave: "nome", rotulo: "Comércio", valor: l => <><strong>{l.nome}</strong>{l.bloqueado && <> <Badge tom="critico">Bloqueado</Badge></>}</> },
          { chave: "saldo", rotulo: "Saldo", num: true, valor: l => <strong>{moeda(l.saldo)}</strong> },
          { chave: "ultimoMovimento", rotulo: "Último lançamento", valor: l => (l.ultimoMovimento ? dataHora(l.ultimoMovimento) : "—"), ordenar: l => (l.ultimoMovimento ? new Date(l.ultimoMovimento).getTime() : null), csv: l => (l.ultimoMovimento ? dataHora(l.ultimoMovimento) : "") },
          { chave: "acao", rotulo: "", csv: () => "", valor: l => <Botao pequeno variante="fantasma" onClick={() => setAberto(l)}>{pode ? "Extrato e lançamentos" : "Extrato"}</Botao> },
        ]}
      />
      {aberto && <Extrato key={aberto.comercioId} comercio={aberto} pode={pode} onAlterado={() => recarregar({ silencioso: true })} />}
    </>
  );
}
