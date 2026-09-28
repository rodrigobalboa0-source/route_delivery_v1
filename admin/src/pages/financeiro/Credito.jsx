// Financeiro › Crédito — saldo pré-pago de cada comércio, com extrato e lançamentos.
import { useState } from "react";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useApi } from "../../hooks/useApi";
import { Badge, Botao, Cabecalho, Campo, Carregando, ErroCaixa, StatTile, Vazio, useAcao } from "../../components/ui";
import { TabelaRelatorio } from "../../components/relatorios";
import { dataHora, moeda, numero } from "../../utils/format";

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
      <div className="aviso-caixa">Os lançamentos são manuais. O crédito ainda não é descontado automaticamente das entregas nem das faturas.</div>
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
