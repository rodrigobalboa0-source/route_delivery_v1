// Financeiro › Faturamento — gera as faturas dos comércios pelas entregas do período ainda não faturadas.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../../api";
import { useAuth } from "../../auth";
import { useApi } from "../../hooks/useApi";
import { Botao, Cabecalho, Campo, Carregando, ErroCaixa, StatTile, Vazio, useAcao } from "../../components/ui";
import GraficoColunas from "../../components/GraficoColunas";
import { FiltroPeriodo, usePeriodo } from "../../components/relatorios";
import { moeda, numero, paraInputData } from "../../utils/format";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const moedaCurta = v => (v >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : moeda(v));

export default function Faturamento() {
  const { podeEditar } = useAuth();
  const pode = podeEditar("financeiro");
  const [periodo, setPeriodo] = usePeriodo(30);
  const [vencimento, setVencimento] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return paraInputData(d); });
  const [marcados, setMarcados] = useState(new Set());
  const [resultado, setResultado] = useState(null);
  const previa = useApi(`/financeiro/faturamento/previa${qs(periodo)}`);
  const receita = useApi("/financeiro/receita-mensal");
  const { executar, ocupado } = useAcao();

  // Ao mudar a prévia, marca todos os comércios com valor a faturar.
  useEffect(() => { setMarcados(new Set((previa.dados?.linhas || []).map(l => l.comercioId))); }, [previa.dados]);

  const linhas = previa.dados?.linhas || [];
  const escolhidas = linhas.filter(l => marcados.has(l.comercioId));
  const totalEscolhido = escolhidas.reduce((s, l) => s + l.valor, 0);

  function alternar(id) {
    const n = new Set(marcados);
    if (n.has(id)) n.delete(id); else n.add(id);
    setMarcados(n);
  }

  async function gerar() {
    const r = await executar(() => api.post("/financeiro/faturamento", { ...periodo, vencimento, comercioIds: escolhidas.map(l => l.comercioId) }),
      `${escolhidas.length} fatura(s) gerada(s).`);
    if (r) { setResultado(r); previa.recarregar({ silencioso: true }); }
  }

  return (
    <>
      <Cabecalho titulo="Faturamento" subtitulo="Fecha o período: gera a fatura de cada comércio com as entregas concluídas ainda não faturadas" />
      <FiltroPeriodo valor={periodo} onChange={p => { setPeriodo(p); setResultado(null); }}>
        <label className="campo-inline">Vencimento das faturas <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} /></label>
      </FiltroPeriodo>
      <ErroCaixa erro={previa.erro} />

      {resultado && (
        <div className="sucesso-caixa">
          {resultado.quantidade} fatura(s) gerada(s), total {moeda(resultado.valor)}.
          <Link to="/financeiro/contas-receber" className="link">Ver em Contas a Receber</Link>
        </div>
      )}

      {previa.dados && (
        <div className="grade-stats">
          <StatTile rotulo="A faturar no período" valor={moeda(previa.dados.totais.valor)} detalhe={`${numero(previa.dados.totais.entregas)} entregas`} />
          <StatTile rotulo="Comércios" valor={numero(previa.dados.totais.comercios)} />
          <StatTile rotulo="Selecionado" valor={moeda(totalEscolhido)} detalhe={`${escolhidas.length} fatura(s)`} />
        </div>
      )}

      <section className="cartao cartao-tabela">
        {previa.carregando && !previa.dados ? <Carregando /> : linhas.length === 0 ? (
          <Vazio titulo="Nada a faturar neste período">Todas as entregas concluídas no período já estão em alguma fatura.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="col-check"><input type="checkbox" aria-label="Selecionar todos" checked={escolhidas.length === linhas.length}
                    onChange={() => setMarcados(escolhidas.length === linhas.length ? new Set() : new Set(linhas.map(l => l.comercioId)))} /></th>
                  <th>Comércio</th><th className="num">Entregas a faturar</th><th className="num">Já faturadas no período</th><th>Pagamento preferido</th><th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.comercioId}>
                    <td className="col-check"><input type="checkbox" checked={marcados.has(l.comercioId)} onChange={() => alternar(l.comercioId)} aria-label={`Faturar ${l.nome}`} /></td>
                    <td><strong>{l.nome}</strong>{l.razaoSocial && <div className="celula-sub">{l.razaoSocial}</div>}</td>
                    <td className="num">{numero(l.entregas)}{l.semValor > 0 && <div className="celula-sub texto-critico">{l.semValor} sem valor</div>}</td>
                    <td className="num apagado">{numero(l.jaFaturadas)}</td>
                    <td>{l.metodoPagamento || "—"}</td>
                    <td className="num"><strong>{moeda(l.valor)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pode && linhas.length > 0 && (
          <div className="form-rodape" style={{ padding: "0 14px 14px" }}>
            <Botao variante="primario" disabled={!escolhidas.length || ocupado} onClick={gerar}>
              Gerar {escolhidas.length} fatura(s) · {moeda(totalEscolhido)}
            </Botao>
          </div>
        )}
      </section>

      <section className="cartao">
        <div className="cartao-topo"><h2>Receita de entregas por mês · últimos 12 meses</h2></div>
        {receita.dados ? (
          <GraficoColunas titulo="Receita de entregas por mês" dados={receita.dados} valor={x => x.valor}
            rotuloX={x => `${MESES[Number(x.mes.slice(5, 7)) - 1]}/${x.mes.slice(2, 4)}`} formatar={moedaCurta} />
        ) : <Carregando />}
      </section>
    </>
  );
}
