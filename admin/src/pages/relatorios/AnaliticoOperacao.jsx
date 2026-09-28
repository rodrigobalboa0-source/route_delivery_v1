// Relatórios › Analítico da Operação
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { Cabecalho, Carregando, ErroCaixa, StatTile } from "../../components/ui";
import GraficoColunas from "../../components/GraficoColunas";
import { FiltroPeriodo, duracao, porcento, usePeriodo } from "../../components/relatorios";
import { ORIGEM_PEDIDO, STATUS_PEDIDO, numero } from "../../utils/format";

// Rampa sequencial azul (paleta de referência) para o mapa de calor; 0 fica na cor da superfície.
const RAMPA = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const AUTORES = { ADMIN: "Painel", COMERCIANTE: "Comerciante", ENTREGADOR: "Entregador", SISTEMA: "Sistema" };

function MapaCalor({ matriz }) {
  const max = Math.max(1, ...matriz.flat());
  const cor = v => (v === 0 ? "var(--superficie-2)" : RAMPA[Math.min(RAMPA.length - 1, Math.floor((v / max) * RAMPA.length - 1e-9))]);
  return (
    <>
      <div className="tabela-rolagem">
        <table className="mapa-calor">
          <caption className="sr-only">Pedidos por dia da semana e hora do dia</caption>
          <thead>
            <tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h} scope="col">{h % 3 === 0 ? `${h}h` : ""}</th>)}</tr>
          </thead>
          <tbody>
            {matriz.map((linha, d) => (
              <tr key={d}>
                <th scope="row">{DIAS[d]}</th>
                {linha.map((v, h) => (
                  <td key={h} style={{ background: cor(v), color: v / max > 0.5 ? "#fff" : undefined }} title={`${DIAS[d]} ${h}h: ${v} pedido(s)`}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="escala-calor">
        <span>0</span>
        <span className="passo" style={{ background: "var(--superficie-2)", border: "1px solid var(--borda)" }} />
        {RAMPA.map(c => <span key={c} className="passo" style={{ background: c }} />)}
        <span>{max} pedidos</span>
      </div>
    </>
  );
}

function TileEtapa({ rotulo, etapa, dica }) {
  return (
    <StatTile
      rotulo={rotulo}
      valor={duracao(etapa.media)}
      detalhe={etapa.amostras ? `mediana ${duracao(etapa.p50)} · 90% até ${duracao(etapa.p90)} · ${etapa.amostras} pedidos` : dica || "Sem dados no período"}
    />
  );
}

export default function AnaliticoOperacao() {
  const [periodo, setPeriodo] = usePeriodo(30);
  const { dados, erro } = useApi(`/relatorios/operacao${qs(periodo)}`);
  const t = dados?.totais;

  return (
    <>
      <Cabecalho titulo="Analítico da Operação" subtitulo="Quando os pedidos chegam, quanto tempo cada etapa leva e como terminam" />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo} />
      <ErroCaixa erro={erro} />
      {!dados ? <Carregando /> : (
        <>
          <div className="grade-stats">
            <StatTile rotulo="Pedidos" valor={numero(t.pedidos)} detalhe={`média de ${numero(t.mediaPorDia)} por dia`} />
            <StatTile rotulo="Taxa de entrega" valor={porcento(t.taxaEntrega)} detalhe={`${numero(t.entregues)} entregues`} />
            <StatTile rotulo="Taxa de cancelamento" valor={porcento(t.taxaCancelamento)} detalhe={`${numero(t.cancelados)} cancelados`} tom={t.taxaCancelamento > 15 ? "aviso" : undefined} />
            <StatTile rotulo="Horário de pico" valor={t.horaPico == null ? "—" : `${t.horaPico}h–${t.horaPico + 1}h`} detalhe={`${numero(t.marcacoesDeAtraso)} marcação(ões) de atraso`} />
          </div>

          <section className="cartao">
            <div className="cartao-topo"><h2>Tempo de cada etapa</h2></div>
            <div className="tempos-etapas">
              <TileEtapa rotulo="Preparo (criação → pronto)" etapa={dados.tempos.preparo} />
              <TileEtapa rotulo="Espera por entregador (pronto → aceite)" etapa={dados.tempos.esperaEntregador} />
              <TileEtapa rotulo="Entrega (aceite → entregue)" etapa={dados.tempos.entrega} />
              <TileEtapa rotulo="Total (criação → entregue)" etapa={dados.tempos.total} />
            </div>
            <p className="apagado" style={{ marginTop: 10 }}>
              Os horários de pronto e aceite são registrados a partir desta versão; pedidos antigos entram só no tempo total.
            </p>
          </section>

          <div className="grade-2">
            <section className="cartao">
              <div className="cartao-topo"><h2>Pedidos por hora do dia</h2></div>
              <GraficoColunas titulo="Pedidos por hora do dia" dados={dados.porHora} valor={x => x.pedidos} rotuloX={x => `${x.hora}h`} formatar={v => numero(v)} />
            </section>
            <section className="cartao">
              <div className="cartao-topo"><h2>Pedidos por dia da semana</h2></div>
              <GraficoColunas titulo="Pedidos por dia da semana" dados={dados.porDiaSemana} valor={x => x.pedidos} rotuloX={x => x.dia} formatar={v => numero(v)} />
            </section>
          </div>

          <section className="cartao">
            <div className="cartao-topo"><h2>Mapa de calor · dia da semana × hora</h2></div>
            <MapaCalor matriz={dados.mapaCalor} />
          </section>

          <div className="grade-2">
            <section className="cartao">
              <div className="cartao-topo"><h2>Situação dos pedidos</h2></div>
              <table className="tabela tabela-compacta">
                <tbody>
                  {Object.entries(STATUS_PEDIDO).map(([st, info]) => (
                    <tr key={st}><td>{info.rotulo}</td><td className="num">{numero(dados.porStatus[st] || 0)}</td><td className="num apagado">{porcento(t.pedidos ? ((dados.porStatus[st] || 0) / t.pedidos) * 100 : 0)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="cartao">
              <div className="cartao-topo"><h2>Origem e cancelamentos</h2></div>
              <table className="tabela tabela-compacta">
                <thead><tr><th>Origem do pedido</th><th className="num">Pedidos</th></tr></thead>
                <tbody>
                  {Object.entries(dados.porOrigem).map(([o, n]) => <tr key={o}><td>{ORIGEM_PEDIDO[o] || "Não informada"}</td><td className="num">{numero(n)}</td></tr>)}
                </tbody>
              </table>
              <table className="tabela tabela-compacta" style={{ marginTop: 12 }}>
                <thead><tr><th>Cancelado por</th><th className="num">Cancelamentos</th></tr></thead>
                <tbody>
                  {Object.keys(dados.cancelamentosPor).length === 0
                    ? <tr><td colSpan={2} className="apagado">Nenhum cancelamento registrado no histórico</td></tr>
                    : Object.entries(dados.cancelamentosPor).map(([a, n]) => <tr key={a}><td>{AUTORES[a] || a}</td><td className="num">{numero(n)}</td></tr>)}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </>
  );
}
