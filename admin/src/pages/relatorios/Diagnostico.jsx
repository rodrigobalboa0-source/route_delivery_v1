// Relatórios › Diagnóstico de Entregadores — pendências de cadastro, documentos, acesso e atividade.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import { Abas, Badge, BadgeMapa, Cabecalho, ErroCaixa, StatTile } from "../../components/ui";
import { TabelaRelatorio } from "../../components/relatorios";
import { STATUS_ENTREGADOR, VEICULOS, data, numero } from "../../utils/format";

// Gravidade sempre com ícone + texto (nunca só cor).
const GRAVIDADE = {
  critico: { tom: "critico", icone: "⛔", rotulo: "Crítico" },
  aviso: { tom: "aviso", icone: "⚠", rotulo: "Atenção" },
  info: { tom: "info", icone: "ℹ", rotulo: "Informativo" },
  ok: { tom: "ok", icone: "✓", rotulo: "Sem pendências" },
};
const ORDEM = { critico: 0, aviso: 1, info: 2, ok: 3 };

const COLUNAS = [
  { chave: "gravidade", rotulo: "Situação", valor: l => <Badge tom={GRAVIDADE[l.gravidade].tom}>{GRAVIDADE[l.gravidade].icone} {GRAVIDADE[l.gravidade].rotulo}</Badge>, ordenar: l => ORDEM[l.gravidade], csv: l => GRAVIDADE[l.gravidade].rotulo },
  { chave: "nome", rotulo: "Entregador", valor: l => <><strong>{l.nome}</strong><div className="celula-sub">{VEICULOS[l.veiculoTipo]}</div></> },
  { chave: "status", rotulo: "Cadastro", valor: l => <span className="badges"><BadgeMapa mapa={STATUS_ENTREGADOR} valor={l.status} />{l.bloqueado && <Badge tom="critico">Bloqueado</Badge>}</span>, csv: l => STATUS_ENTREGADOR[l.status]?.rotulo },
  {
    chave: "problemas", rotulo: "Pendências",
    valor: l => (l.problemas.length === 0 ? <span className="apagado">Nenhuma</span> : (
      <ul className="lista-problemas">
        {l.problemas.map(p => <li key={p.codigo}><span aria-hidden="true">{GRAVIDADE[p.gravidade].icone}</span>{p.texto}</li>)}
      </ul>
    )),
    ordenar: l => l.problemas.length,
    csv: l => l.problemas.map(p => p.texto).join(" | "),
  },
  { chave: "ultimaEntrega", rotulo: "Última entrega", valor: l => data(l.ultimaEntrega), ordenar: l => (l.ultimaEntrega ? new Date(l.ultimaEntrega).getTime() : null), csv: l => (l.ultimaEntrega ? data(l.ultimaEntrega) : "") },
];

export default function Diagnostico() {
  const navegar = useNavigate();
  const [filtro, setFiltro] = useState("pendentes");
  const { dados, erro, carregando } = useApi("/relatorios/diagnostico-entregadores");
  const t = dados?.totais;
  const linhas = (dados?.linhas || []).filter(l => (filtro === "todos" ? true : filtro === "pendentes" ? l.gravidade !== "ok" : l.gravidade === filtro));

  return (
    <>
      <Cabecalho titulo="Diagnóstico de Entregadores" subtitulo="O que impede ou atrapalha cada entregador de trabalhar: aprovação, acesso ao app, documentos e atividade" />
      <ErroCaixa erro={erro} />
      {t && (
        <div className="grade-stats">
          <StatTile rotulo="⛔ Críticos" valor={numero(t.critico)} tom={t.critico ? "critico" : undefined} detalhe="Impedem de trabalhar" onClick={() => setFiltro("critico")} ativo={filtro === "critico"} />
          <StatTile rotulo="⚠ Atenção" valor={numero(t.aviso)} tom={t.aviso ? "aviso" : undefined} detalhe="Cadastro incompleto" onClick={() => setFiltro("aviso")} ativo={filtro === "aviso"} />
          <StatTile rotulo="ℹ Informativos" valor={numero(t.info)} detalhe="Atividade" onClick={() => setFiltro("info")} ativo={filtro === "info"} />
          <StatTile rotulo="✓ Sem pendências" valor={numero(t.ok)} detalhe={`de ${numero(t.entregadores)} entregadores`} onClick={() => setFiltro("ok")} ativo={filtro === "ok"} />
        </div>
      )}
      <Abas ativa={filtro} onChange={setFiltro} abas={[
        { valor: "pendentes", rotulo: "Com pendências" },
        { valor: "todos", rotulo: "Todos" },
      ]} />
      <TabelaRelatorio
        colunas={COLUNAS}
        linhas={dados ? linhas : null}
        carregando={carregando}
        vazio="Nenhum entregador nesta situação"
        chaveLinha={l => l.entregadorId}
        onLinha={() => navegar("/cadastros/entregadores")}
        nomeCsv="diagnostico_entregadores"
      />
      {dados?.porProblema?.length > 0 && (
        <TabelaRelatorio
          linhas={dados.porProblema}
          chaveLinha={l => l.codigo}
          colunas={[
            { chave: "problema", rotulo: "Pendência mais comum", valor: l => (dados.linhas.flatMap(x => x.problemas).find(p => p.codigo === l.codigo)?.texto.replace(/\d+/g, "N") || l.codigo) },
            { chave: "gravidade", rotulo: "Gravidade", valor: l => <Badge tom={GRAVIDADE[l.gravidade].tom}>{GRAVIDADE[l.gravidade].icone} {GRAVIDADE[l.gravidade].rotulo}</Badge>, ordenar: l => ORDEM[l.gravidade] },
            { chave: "quantidade", rotulo: "Entregadores", num: true, valor: l => numero(l.quantidade) },
          ]}
        />
      )}
    </>
  );
}
