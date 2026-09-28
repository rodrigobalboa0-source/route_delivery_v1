// Relatórios › Analítico de Embarcadores (comércios que enviam as entregas)
import { useNavigate } from "react-router-dom";
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { Badge, Cabecalho, ErroCaixa, StatTile } from "../../components/ui";
import { FiltroPeriodo, TabelaRelatorio, duracao, porcento, usePeriodo } from "../../components/relatorios";
import { data, km, moeda, numero } from "../../utils/format";

const COLUNAS = [
  { chave: "nome", rotulo: "Embarcador", valor: l => <><strong>{l.nome}</strong>{l.bloqueado && <> <Badge tom="critico">Bloqueado</Badge></>}<div className="celula-sub">{[l.segmento, l.cidade].filter(Boolean).join(" · ")}</div></> },
  { chave: "pedidos", rotulo: "Pedidos", num: true, valor: l => numero(l.pedidos) },
  { chave: "entregues", rotulo: "Entregues", num: true, valor: l => numero(l.entregues) },
  { chave: "cancelados", rotulo: "Cancelados", num: true, valor: l => numero(l.cancelados) },
  { chave: "taxaEntrega", rotulo: "Taxa de entrega", num: true, valor: l => (l.pedidos ? porcento(l.taxaEntrega) : "—") },
  { chave: "receita", rotulo: "Receita", num: true, valor: l => moeda(l.receita) },
  { chave: "ticketMedio", rotulo: "Ticket médio", num: true, valor: l => (l.entregues ? moeda(l.ticketMedio) : "—") },
  { chave: "distanciaMediaKm", rotulo: "Distância média", num: true, valor: l => km(l.distanciaMediaKm) },
  { chave: "tempoPreparoMin", rotulo: "Preparo médio", num: true, valor: l => duracao(l.tempoPreparoMin) },
  { chave: "tempoTotalMin", rotulo: "Tempo total médio", num: true, valor: l => duracao(l.tempoTotalMin) },
  { chave: "ultimoPedido", rotulo: "Último pedido", valor: l => data(l.ultimoPedido), ordenar: l => (l.ultimoPedido ? new Date(l.ultimoPedido).getTime() : null), csv: l => (l.ultimoPedido ? data(l.ultimoPedido) : "") },
];

export default function Embarcadores() {
  const navegar = useNavigate();
  const [periodo, setPeriodo] = usePeriodo(30);
  const { dados, erro, carregando } = useApi(`/relatorios/embarcadores${qs(periodo)}`);
  const t = dados?.totais;

  return (
    <>
      <Cabecalho titulo="Analítico de Embarcadores" subtitulo="Desempenho de cada comércio: volume, conversão, receita e tempos (pedidos criados no período)" />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo} />
      <ErroCaixa erro={erro} />
      {t && (
        <div className="grade-stats">
          <StatTile rotulo="Embarcadores com pedidos" valor={`${numero(t.comerciosComPedidos)} de ${numero(t.comercios)}`} />
          <StatTile rotulo="Pedidos" valor={numero(t.pedidos)} detalhe={`${numero(t.entregues)} entregues · ${numero(t.cancelados)} cancelados`} />
          <StatTile rotulo="Taxa de entrega" valor={porcento(t.taxaEntrega)} />
          <StatTile rotulo="Receita" valor={moeda(t.receita)} />
        </div>
      )}
      <TabelaRelatorio
        colunas={COLUNAS}
        linhas={dados?.linhas}
        carregando={carregando}
        nomeCsv={`embarcadores_${periodo.desde}_${periodo.ate}`}
        chaveLinha={l => l.comercioId}
        onLinha={l => navegar(`/cadastros/comercios?abrir=${l.comercioId}`)}
      />
    </>
  );
}
