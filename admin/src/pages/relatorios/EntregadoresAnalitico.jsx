// Relatórios › Analítico de Entregadores
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { Badge, BadgeMapa, Cabecalho, ErroCaixa, StatTile } from "../../components/ui";
import { FiltroPeriodo, TabelaRelatorio, duracao, porcento, usePeriodo } from "../../components/relatorios";
import { STATUS_ENTREGADOR, TIPO_ENTREGA, VEICULOS, dataHora, km, moeda, numero } from "../../utils/format";

const COLUNAS = [
  { chave: "nome", rotulo: "Entregador", valor: l => <><strong>{l.nome}</strong><div className="celula-sub">{VEICULOS[l.veiculoTipo]} · {TIPO_ENTREGA[l.tipoEntrega]}</div></> },
  { chave: "status", rotulo: "Situação", valor: l => <span className="badges"><BadgeMapa mapa={STATUS_ENTREGADOR} valor={l.status} />{l.bloqueado && <Badge tom="critico">Bloqueado</Badge>}</span> },
  { chave: "entregas", rotulo: "Entregas", num: true, valor: l => numero(l.entregas) },
  { chave: "aceites", rotulo: "Aceites", num: true, valor: l => numero(l.aceites) },
  { chave: "desistencias", rotulo: "Desistências", num: true, valor: l => numero(l.desistencias) },
  { chave: "taxaConclusao", rotulo: "Conclusão", num: true, valor: l => (l.entregas + l.desistencias ? porcento(l.taxaConclusao) : "—") },
  { chave: "diasAtivos", rotulo: "Dias ativos", num: true, valor: l => numero(l.diasAtivos) },
  { chave: "distanciaKm", rotulo: "Distância", num: true, valor: l => km(l.distanciaKm) },
  { chave: "tempoMedioEntregaMin", rotulo: "Tempo médio (aceite → entrega)", num: true, valor: l => duracao(l.tempoMedioEntregaMin) },
  { chave: "valorEntregas", rotulo: "Valor das entregas", num: true, valor: l => moeda(l.valorEntregas) },
  { chave: "repasseEstimado", rotulo: "Repasse estimado", num: true, valor: l => (l.repasseEstimado == null ? <span className="apagado">sem taxa</span> : moeda(l.repasseEstimado)) },
  { chave: "ultimaEntrega", rotulo: "Última entrega", valor: l => dataHora(l.ultimaEntrega), ordenar: l => (l.ultimaEntrega ? new Date(l.ultimaEntrega).getTime() : null), csv: l => (l.ultimaEntrega ? dataHora(l.ultimaEntrega) : "") },
];

export default function EntregadoresAnalitico() {
  const [periodo, setPeriodo] = usePeriodo(30);
  const { dados, erro, carregando } = useApi(`/relatorios/entregadores-analitico${qs(periodo)}`);
  const t = dados?.totais;

  return (
    <>
      <Cabecalho titulo="Analítico de Entregadores" subtitulo="Produtividade de cada entregador: entregas concluídas no período, aceites, desistências, tempos e repasse" />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo} />
      <ErroCaixa erro={erro} />
      {t && (
        <div className="grade-stats">
          <StatTile rotulo="Entregadores com entregas" valor={`${numero(t.comEntregas)} de ${numero(t.entregadores)}`} />
          <StatTile rotulo="Entregas concluídas" valor={numero(t.entregas)} detalhe={`${numero(t.desistencias)} desistência(s)`} />
          <StatTile rotulo="Distância percorrida" valor={km(t.distanciaKm)} detalhe="Soma das distâncias de entrega" />
          <StatTile rotulo="Repasse estimado" valor={moeda(t.repasseEstimado)} />
        </div>
      )}
      <TabelaRelatorio colunas={COLUNAS} linhas={dados?.linhas} carregando={carregando} nomeCsv={`entregadores_${periodo.desde}_${periodo.ate}`} chaveLinha={l => l.entregadorId} />
    </>
  );
}
