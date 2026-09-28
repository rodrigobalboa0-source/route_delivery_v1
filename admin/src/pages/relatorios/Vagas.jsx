// Relatórios › Histórico de Vagas
// Vaga = cada vez que um pedido ficou disponível aos entregadores (status Pronto),
// até alguém aceitar, o painel atribuir ou o pedido ser cancelado.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { Badge, Cabecalho, ErroCaixa, StatTile } from "../../components/ui";
import { FiltroPeriodo, TabelaRelatorio, duracao, usePeriodo } from "../../components/relatorios";
import { numero } from "../../utils/format";

const RESULTADO = {
  PREENCHIDA: { rotulo: "✓ Preenchida", tom: "ok" },
  CANCELADA: { rotulo: "Cancelada", tom: "apagado" },
  ABERTA: { rotulo: "● Em aberto", tom: "aviso" },
};
const MOTIVO = { PRONTO: "Pedido ficou pronto", DESISTENCIA: "Entregador desistiu", REPROCURA: "Devolvido à fila pelo painel" };
const quando = campo => ({
  valor: l => (l[campo] ? new Date(l[campo]).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"),
  ordenar: l => (l[campo] ? new Date(l[campo]).getTime() : null),
  csv: l => (l[campo] ? new Date(l[campo]).toLocaleString("pt-BR") : ""),
});

const COLUNAS = [
  { chave: "codigo", rotulo: "Pedido", valor: l => <strong>{l.codigo}</strong> },
  { chave: "comercio", rotulo: "Comércio" },
  { chave: "motivo", rotulo: "Vaga aberta por", valor: l => <>{MOTIVO[l.motivo]}{l.liberadaPor && <div className="celula-sub">{l.liberadaPor}</div>}</>, csv: l => MOTIVO[l.motivo] + (l.liberadaPor ? ` (${l.liberadaPor})` : "") },
  { chave: "abertaEm", rotulo: "Aberta em", ...quando("abertaEm") },
  { chave: "fechadaEm", rotulo: "Fechada em", ...quando("fechadaEm") },
  { chave: "minutosEmAberto", rotulo: "Tempo em aberto", num: true, valor: l => duracao(l.minutosEmAberto) },
  { chave: "resultado", rotulo: "Resultado", valor: l => <Badge tom={RESULTADO[l.resultado].tom}>{RESULTADO[l.resultado].rotulo}</Badge>, csv: l => RESULTADO[l.resultado].rotulo },
  { chave: "preenchidaPor", rotulo: "Preenchida por", valor: l => (l.preenchidaPor ? <>{l.preenchidaPor}{l.viaPainel && <div className="celula-sub">atribuído pelo painel</div>}</> : "—") },
];

export default function Vagas() {
  const navegar = useNavigate();
  const [periodo, setPeriodo] = usePeriodo(7);
  const [comercioId, setComercioId] = useState("");
  const { dados: comercios } = useApi("/comercios");
  const { dados, erro, carregando } = useApi(`/relatorios/vagas${qs({ ...periodo, comercioId })}`);
  const t = dados?.totais;

  return (
    <>
      <Cabecalho titulo="Histórico de Vagas" subtitulo="Cada vez que um pedido ficou disponível aos entregadores e quanto tempo levou para alguém assumir" />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo}>
        <select value={comercioId} onChange={e => setComercioId(e.target.value)} aria-label="Comércio">
          <option value="">Todos os comércios</option>
          {(comercios || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
        </select>
      </FiltroPeriodo>
      <ErroCaixa erro={erro} />
      {t && (
        <div className="grade-stats">
          <StatTile rotulo="Vagas abertas no período" valor={numero(t.vagas)} detalhe={`${numero(t.reaberturas)} reabertura(s) por desistência ou devolução`} />
          <StatTile rotulo="Preenchidas" valor={numero(t.preenchidas)} detalhe={`${numero(t.atribuidasPeloPainel)} pelo painel · ${numero(t.canceladas)} canceladas`} />
          <StatTile rotulo="Tempo médio até preencher" valor={duracao(t.tempoMedioParaPreencherMin)} detalhe={t.p90ParaPreencherMin != null ? `90% preenchidas em até ${duracao(t.p90ParaPreencherMin)}` : ""} />
          <StatTile rotulo="Em aberto agora" valor={numero(t.abertas)} tom={t.abertas ? "aviso" : undefined} />
        </div>
      )}
      <TabelaRelatorio
        colunas={COLUNAS}
        linhas={dados?.linhas}
        carregando={carregando}
        vazio="Nenhuma vaga aberta no período"
        chaveLinha={(l, i) => `${l.pedidoId}-${i}`}
        onLinha={l => navegar(`/operacao?abrir=${l.pedidoId}`)}
        nomeCsv={`historico_vagas_${periodo.desde}_${periodo.ate}`}
      />
      <p className="apagado">As vagas passaram a ser registradas nesta versão; pedidos anteriores não aparecem aqui.</p>
    </>
  );
}
