// Relatórios › Entregadores por período — quantos entregadores trabalharam em cada dia.
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { BadgeMapa, Cabecalho, Carregando, ErroCaixa, StatTile } from "../../components/ui";
import GraficoColunas from "../../components/GraficoColunas";
import { FiltroPeriodo, TabelaRelatorio, usePeriodo } from "../../components/relatorios";
import { STATUS_ENTREGADOR, VEICULOS, data, numero } from "../../utils/format";

const COLUNAS = [
  { chave: "nome", rotulo: "Entregador", valor: l => <><strong>{l.nome}</strong><div className="celula-sub">{VEICULOS[l.veiculoTipo]}</div></> },
  { chave: "status", rotulo: "Situação", valor: l => <BadgeMapa mapa={STATUS_ENTREGADOR} valor={l.status} />, csv: l => STATUS_ENTREGADOR[l.status]?.rotulo },
  { chave: "diasTrabalhados", rotulo: "Dias trabalhados", num: true, valor: l => numero(l.diasTrabalhados) },
  { chave: "entregas", rotulo: "Entregas", num: true, valor: l => numero(l.entregas) },
  { chave: "mediaEntregasPorDia", rotulo: "Entregas por dia trabalhado", num: true, valor: l => (l.diasTrabalhados ? numero(l.mediaEntregasPorDia) : "—") },
  { chave: "primeira", rotulo: "Primeira entrega", valor: l => data(l.primeira), ordenar: l => (l.primeira ? new Date(l.primeira).getTime() : null), csv: l => (l.primeira ? data(l.primeira) : "") },
  { chave: "ultima", rotulo: "Última entrega", valor: l => data(l.ultima), ordenar: l => (l.ultima ? new Date(l.ultima).getTime() : null), csv: l => (l.ultima ? data(l.ultima) : "") },
  { chave: "cadastradoEm", rotulo: "Cadastro", valor: l => data(l.cadastradoEm), ordenar: l => new Date(l.cadastradoEm).getTime(), csv: l => data(l.cadastradoEm) },
];

export default function EntregadoresPeriodo() {
  const [periodo, setPeriodo] = usePeriodo(30);
  const { dados, erro, carregando } = useApi(`/relatorios/entregadores-periodo${qs(periodo)}`);
  const t = dados?.totais;
  const rotuloDia = x => `${x.data.slice(8, 10)}/${x.data.slice(5, 7)}`;

  return (
    <>
      <Cabecalho titulo="Entregadores por período" subtitulo="Entregadores que concluíram ao menos uma entrega em cada dia, novos cadastros e dias trabalhados por pessoa" />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo} />
      <ErroCaixa erro={erro} />
      {!dados ? <Carregando /> : (
        <>
          <div className="grade-stats">
            <StatTile rotulo="Entregadores ativos no período" valor={numero(t.ativosNoPeriodo)} detalhe={`${numero(t.entregas)} entregas`} />
            <StatTile rotulo="Média de ativos por dia" valor={numero(t.mediaAtivosPorDia ?? 0)} detalhe={`pico de ${numero(t.picoAtivos)} num dia`} />
            <StatTile rotulo="Novos cadastros" valor={numero(t.novosCadastros)} />
          </div>
          <section className="cartao">
            <div className="cartao-topo"><h2>Entregadores ativos por dia</h2></div>
            <GraficoColunas
              titulo="Entregadores ativos por dia"
              dados={dados.serie}
              valor={x => x.ativos}
              rotuloX={rotuloDia}
              formatar={v => numero(v)}
              detalhe={x => `${x.entregas} entregas · ${x.novosCadastros} novo(s) cadastro(s)`}
            />
          </section>
        </>
      )}
      <TabelaRelatorio colunas={COLUNAS} linhas={dados?.entregadores} carregando={carregando} chaveLinha={l => l.entregadorId} nomeCsv={`entregadores_por_periodo_${periodo.desde}_${periodo.ate}`} />
    </>
  );
}
