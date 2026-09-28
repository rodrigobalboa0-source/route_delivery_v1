// Relatórios › Alteração de Status por Entregador — linha do tempo de mudanças ligadas a cada entregador.
import { useState } from "react";
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { Badge, Cabecalho, ErroCaixa } from "../../components/ui";
import { FiltroPeriodo, TabelaRelatorio, usePeriodo } from "../../components/relatorios";
import { STATUS_ENTREGADOR, STATUS_PEDIDO, numero } from "../../utils/format";

const CATEGORIAS = {
  PEDIDO: { rotulo: "Pedido", tom: "info" },
  ONLINE: { rotulo: "Online/offline", tom: "neutro" },
  STATUS: { rotulo: "Aprovação", tom: "aviso" },
  BLOQUEIO: { rotulo: "Bloqueio", tom: "critico" },
  CADASTRO: { rotulo: "Cadastro", tom: "ok" },
};
const AUTORES = { ADMIN: "Painel", COMERCIANTE: "Comerciante", ENTREGADOR: "Entregador", SISTEMA: "Sistema" };
const VALORES = { ONLINE: "Online", OFFLINE: "Offline", BLOQUEADO: "Bloqueado", LIBERADO: "Liberado" };

function rotuloValor(ev, v) {
  if (v == null) return "—";
  if (ev.categoria === "PEDIDO") return STATUS_PEDIDO[v]?.rotulo || v;
  return VALORES[v] || STATUS_ENTREGADOR[v]?.rotulo || v;
}

const COLUNAS = [
  { chave: "data", rotulo: "Quando", valor: l => new Date(l.data).toLocaleString("pt-BR"), ordenar: l => new Date(l.data).getTime(), csv: l => new Date(l.data).toLocaleString("pt-BR") },
  { chave: "entregador", rotulo: "Entregador", valor: l => <strong>{l.entregador}</strong> },
  { chave: "categoria", rotulo: "Tipo", valor: l => <Badge tom={CATEGORIAS[l.categoria]?.tom}>{CATEGORIAS[l.categoria]?.rotulo || l.categoria}</Badge>, csv: l => CATEGORIAS[l.categoria]?.rotulo || l.categoria },
  { chave: "mudanca", rotulo: "Mudança", valor: l => <>{rotuloValor(l, l.de)} → <strong>{rotuloValor(l, l.para)}</strong></>, ordenar: l => l.para, csv: l => `${rotuloValor(l, l.de)} -> ${rotuloValor(l, l.para)}` },
  { chave: "pedido", rotulo: "Pedido", valor: l => l.pedido || "—" },
  { chave: "autor", rotulo: "Feito por", valor: l => <>{AUTORES[l.autorTipo] || l.autorTipo}{l.autorNome && <div className="celula-sub">{l.autorNome}</div>}</>, ordenar: l => l.autorTipo, csv: l => `${AUTORES[l.autorTipo] || l.autorTipo}${l.autorNome ? " — " + l.autorNome : ""}` },
];

export default function AlteracoesStatus() {
  const [periodo, setPeriodo] = usePeriodo(7);
  const [entregadorId, setEntregadorId] = useState("");
  const [tipo, setTipo] = useState("");
  const { dados: entregadores } = useApi("/entregadores");
  const { dados, erro, carregando } = useApi(`/relatorios/alteracoes-status${qs({ ...periodo, entregadorId, tipo })}`);

  return (
    <>
      <Cabecalho titulo="Alteração de Status por Entregador" subtitulo="Quem mudou o quê e quando: aprovação, bloqueio, online/offline e mudanças nos pedidos de cada entregador" />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo}>
        <select value={entregadorId} onChange={e => setEntregadorId(e.target.value)} aria-label="Entregador">
          <option value="">Todos os entregadores</option>
          {(entregadores || []).map(e => <option key={e.id} value={e.id}>{e.nomeCompleto}</option>)}
        </select>
        <select value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo de alteração">
          <option value="">Pedidos e cadastro</option>
          <option value="pedido">Só pedidos</option>
          <option value="entregador">Só cadastro/online</option>
        </select>
      </FiltroPeriodo>
      <ErroCaixa erro={erro} />
      {dados?.resumo?.length > 0 && (
        <TabelaRelatorio
          linhas={dados.resumo}
          chaveLinha={l => l.entregadorId}
          onLinha={l => setEntregadorId(l.entregadorId)}
          colunas={[
            { chave: "entregador", rotulo: "Entregador", valor: l => <strong>{l.entregador}</strong> },
            { chave: "total", rotulo: "Total", num: true, valor: l => numero(l.total) },
            { chave: "PEDIDO", rotulo: "Pedidos", num: true, valor: l => numero(l.PEDIDO) },
            { chave: "ONLINE", rotulo: "Online/offline", num: true, valor: l => numero(l.ONLINE) },
            { chave: "STATUS", rotulo: "Aprovação", num: true, valor: l => numero(l.STATUS) },
            { chave: "BLOQUEIO", rotulo: "Bloqueio", num: true, valor: l => numero(l.BLOQUEIO) },
          ]}
        />
      )}
      <TabelaRelatorio
        colunas={COLUNAS}
        linhas={dados?.eventos}
        carregando={carregando}
        vazio="Nenhuma alteração registrada no período"
        chaveLinha={l => l.id}
        nomeCsv={`alteracoes_status_${periodo.desde}_${periodo.ate}`}
      />
      <p className="apagado">As alterações passaram a ser registradas nesta versão; períodos anteriores não têm histórico.</p>
    </>
  );
}
