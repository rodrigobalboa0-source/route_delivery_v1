// Financeiro › Dashboard — visão geral da operação no período: faturamento, custo com entregadores, margem,
// entregas e cancelamentos, evolução por dia, principais comércios e entregadores, e o caixa de agora.
import { useNavigate } from "react-router-dom";
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { Cabecalho, Carregando, ErroCaixa, StatTile, Vazio } from "../../components/ui";
import { FiltroPeriodo, usePeriodo } from "../../components/relatorios";
import GraficoColunas from "../../components/GraficoColunas";
import Baixar from "../../components/Baixar";
import { moeda, numero } from "../../utils/format";

const dataBR = t => (t ? t.split("-").reverse().join("/") : "");
const pct = v => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const kmBR = v => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
const moedaCurta = v => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : moeda(v));
const rotuloPeriodo = (p, mes) => (mes ? `${p.slice(5, 7)}/${p.slice(2, 4)}` : `${p.slice(8, 10)}/${p.slice(5, 7)}`);

function specDashboard(d, periodo) {
  const o = d.operacao, mes = d.periodo.agrupamento === "MES";
  return {
    arquivo: `dashboard-${periodo.desde}-a-${periodo.ate}`, aba: "Dashboard", titulo: "Dashboard da operação",
    subtitulo: `Período: ${dataBR(periodo.desde)} a ${dataBR(periodo.ate)}`,
    resumo: [
      ["Faturamento", moeda(o.faturado)], ["Custo com entregadores", moeda(o.custo)], ["Margem", `${moeda(o.margem)} (${pct(o.margemPct)})`],
      ["Entregas finalizadas", numero(o.entregas)], ["Canceladas", `${numero(o.canceladas)} (${pct(o.cancelamentoPct)})`], ["Ticket médio", moeda(o.ticketMedio)],
      ["A receber (faturas)", moeda(d.caixa.aReceber)], ["Saques a pagar", moeda(d.caixa.saquesPendentes)],
    ],
    colunas: [
      { titulo: mes ? "Mês" : "Dia", valor: s => rotuloPeriodo(s.periodo, mes), largura: 12 },
      { titulo: "Entregas", valor: s => s.entregas, tipo: "numero", largura: 12 },
      { titulo: "Faturamento", valor: s => s.faturado, tipo: "moeda", largura: 16 },
      { titulo: "Custo entregadores", valor: s => s.custo, tipo: "moeda", largura: 18 },
      { titulo: "Margem", valor: s => s.margem, tipo: "moeda", largura: 16 },
    ],
    linhas: d.serie,
    totais: { 1: o.entregas, 2: o.faturado, 3: o.custoEntregas, 4: o.faturado - o.custoEntregas },
  };
}

function Ranking({ titulo, linhas, colunas, vazio }) {
  return (
    <section className="cartao">
      <div className="cartao-topo"><h2>{titulo}</h2></div>
      {!linhas.length ? <Vazio titulo={vazio} /> : (
        <table className="tabela tabela-compacta">
          <thead><tr><th>#</th>{colunas.map(c => <th key={c.rotulo} className={c.num ? "num" : ""}>{c.rotulo}</th>)}</tr></thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}><td className="apagado">{i + 1}</td>{colunas.map(c => <td key={c.rotulo} className={c.num ? "num" : ""}>{c.valor(l)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function Dashboard() {
  const navegar = useNavigate();
  const [periodo, setPeriodo] = usePeriodo(30);
  const { dados: d, erro, carregando, recarregar } = useApi(`/financeiro/dashboard${qs(periodo)}`, { aoVivo: ["pedidos"] });
  const o = d?.operacao, c = d?.caixa, mes = d?.periodo.agrupamento === "MES";

  return (
    <>
      <Cabecalho titulo="Dashboard da operação" subtitulo="Faturamento, custos, margem e entregas do período — e o caixa de hoje" />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo}>
        <Baixar rotulo="Dashboard" desabilitado={!d} gerar={() => specDashboard(d, periodo)} />
      </FiltroPeriodo>
      <ErroCaixa erro={erro} onTentar={() => recarregar()} />
      {carregando && !d ? <Carregando /> : d && (
        <>
          <h3 className="secao-titulo">Operação no período</h3>
          <div className="grade-stats">
            <StatTile rotulo="Faturamento" valor={moeda(o.faturado)} detalhe={`${numero(o.entregas)} entregas finalizadas`} />
            <StatTile rotulo="Custo com entregadores" valor={moeda(o.custo)} detalhe={`${moeda(o.custoEntregas)} entregas · ${moeda(o.custoComissoes)} comissões`} />
            <StatTile rotulo="Margem" valor={moeda(o.margem)} tom={o.margem < 0 ? "critico" : undefined} detalhe={`${pct(o.margemPct)} do faturamento${o.taxasSaque ? ` · inclui ${moeda(o.taxasSaque)} de taxas de saque` : ""}`} />
            <StatTile rotulo="Ticket médio" valor={moeda(o.ticketMedio)} detalhe={`${kmBR(o.km)} rodados`} />
            <StatTile rotulo="Cancelamentos" valor={numero(o.canceladas)} tom={o.cancelamentoPct >= 10 ? "aviso" : undefined} detalhe={`${pct(o.cancelamentoPct)} dos pedidos`} />
            <StatTile rotulo="Quem trabalhou" valor={`${numero(o.entregadoresAtivos)} entregadores`} detalhe={`${numero(o.comerciosAtivos)} comércios com entregas`} />
          </div>

          <h3 className="secao-titulo">Caixa agora</h3>
          <div className="grade-stats">
            <StatTile rotulo="A receber (faturas)" valor={moeda(c.aReceber)} detalhe={`${numero(c.faturasAbertas)} fatura(s) no prazo`} onClick={() => navegar("/financeiro/contas-receber")} />
            <StatTile rotulo="Em atraso" valor={moeda(c.emAtraso)} tom={c.emAtraso > 0 ? "critico" : undefined} detalhe={`${numero(c.faturasAtrasadas)} fatura(s) vencida(s)`} onClick={() => navegar("/financeiro/contas-receber")} />
            <StatTile rotulo="Contas a pagar" valor={moeda(c.aPagar)} detalhe={`${numero(c.contasAPagar)} em aberto`} onClick={() => navegar("/financeiro/contas-pagar")} />
            <StatTile rotulo="Saques a pagar" valor={moeda(c.saquesPendentes)} tom={c.qtdSaquesPendentes ? "aviso" : undefined} detalhe={`${numero(c.qtdSaquesPendentes)} pedido(s) · ${moeda(o.sacadoNoPeriodo)} sacado no período`} onClick={() => navegar("/financeiro/saques")} />
            <StatTile rotulo="Crédito das lojas" valor={moeda(c.creditoLojas)} detalhe="saldo pré-pago em aberto" onClick={() => navegar("/financeiro/credito")} />
          </div>

          <div className="grade-2">
            <section className="cartao">
              <div className="cartao-topo"><h2>Faturamento por {mes ? "mês" : "dia"}</h2></div>
              {o.entregas === 0 ? <Vazio titulo="Nenhuma entrega finalizada no período" /> : (
                <GraficoColunas titulo={`Faturamento por ${mes ? "mês" : "dia"}`} dados={d.serie} valor={s => s.faturado} rotuloX={s => rotuloPeriodo(s.periodo, mes)}
                  formatar={moedaCurta} detalhe={s => `${numero(s.entregas)} entregas · custo ${moeda(s.custo)} · margem ${moeda(s.margem)}`} />
              )}
            </section>
            <section className="cartao">
              <div className="cartao-topo"><h2>Entregas por {mes ? "mês" : "dia"}</h2></div>
              {o.entregas === 0 ? <Vazio titulo="Nenhuma entrega finalizada no período" /> : (
                <GraficoColunas titulo={`Entregas por ${mes ? "mês" : "dia"}`} dados={d.serie} valor={s => s.entregas} rotuloX={s => rotuloPeriodo(s.periodo, mes)}
                  formatar={v => numero(Math.round(v))} detalhe={s => `faturamento ${moeda(s.faturado)}`} />
              )}
            </section>
          </div>

          <div className="grade-2">
            <Ranking titulo="Comércios que mais faturaram" vazio="Nenhum comércio com entregas" linhas={d.topComercios} colunas={[
              { rotulo: "Comércio", valor: l => l.nome },
              { rotulo: "Entregas", num: true, valor: l => numero(l.entregas) },
              { rotulo: "Faturamento", num: true, valor: l => <strong>{moeda(l.faturado)}</strong> },
              { rotulo: "% do total", num: true, valor: l => pct(o.faturado ? (l.faturado / o.faturado) * 100 : 0) },
            ]} />
            <Ranking titulo="Entregadores com mais entregas" vazio="Nenhum entregador com entregas" linhas={d.topEntregadores} colunas={[
              { rotulo: "Entregador", valor: l => l.nome },
              { rotulo: "Entregas", num: true, valor: l => <strong>{numero(l.entregas)}</strong> },
              { rotulo: "Km", num: true, valor: l => kmBR(l.km) },
              { rotulo: "Ganhou", num: true, valor: l => moeda(l.ganho) },
            ]} />
          </div>
        </>
      )}
    </>
  );
}
