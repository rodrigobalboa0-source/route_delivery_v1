// Relatórios › Entregas — lista detalhada de todas as entregas do período, exportável.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { BadgeMapa, Botao, Cabecalho, ErroCaixa } from "../../components/ui";
import { FiltroPeriodo, TabelaRelatorio, baixarCsv, duracao, usePeriodo } from "../../components/relatorios";
import { ORIGEM_PEDIDO, STATUS_PEDIDO, dataHora, km, moeda } from "../../utils/format";

// Zero ou negativo = desconhecido (horários reconstruídos de pedidos antigos).
const min = (a, b) => {
  if (!a || !b) return null;
  const m = (new Date(b) - new Date(a)) / 60000;
  return m > 0 ? m : null;
};
const quando = campo => ({
  valor: l => dataHora(l[campo]),
  ordenar: l => (l[campo] ? new Date(l[campo]).getTime() : null),
  csv: l => (l[campo] ? new Date(l[campo]).toLocaleString("pt-BR") : ""),
});

const COLUNAS = [
  { chave: "codigo", rotulo: "Pedido", valor: l => <strong>{l.codigo}</strong> },
  { chave: "createdAt", rotulo: "Criado", ...quando("createdAt") },
  { chave: "status", rotulo: "Status", valor: l => <BadgeMapa mapa={STATUS_PEDIDO} valor={l.status} />, csv: l => STATUS_PEDIDO[l.status]?.rotulo },
  { chave: "comercio", rotulo: "Comércio", valor: l => l.comercio?.nomeFantasia, ordenar: l => l.comercio?.nomeFantasia },
  { chave: "cliente", rotulo: "Cliente", valor: l => <>{l.clienteNome}<div className="celula-sub">{l.endereco}</div></>, ordenar: l => l.clienteNome, csv: l => l.clienteNome },
  { chave: "endereco", rotulo: "Endereço de entrega", valor: l => l.endereco },
  { chave: "entregador", rotulo: "Entregador", valor: l => l.entregador?.nomeCompleto || "—", ordenar: l => l.entregador?.nomeCompleto },
  { chave: "origem", rotulo: "Origem", valor: l => ORIGEM_PEDIDO[l.origem] || "—", csv: l => ORIGEM_PEDIDO[l.origem] || "" },
  { chave: "distanciaKm", rotulo: "Distância", num: true, valor: l => km(l.distanciaKm) },
  { chave: "valor", rotulo: "Valor", num: true, valor: l => moeda(l.valor) },
  { chave: "formaPagamento", rotulo: "Pagamento", valor: l => l.formaPagamento || "—" },
  { chave: "prontoEm", rotulo: "Pronto", ...quando("prontoEm") },
  { chave: "aceitoEm", rotulo: "Aceito", ...quando("aceitoEm") },
  { chave: "entregueEm", rotulo: "Entregue", ...quando("entregueEm") },
  { chave: "tempoTotal", rotulo: "Tempo total", num: true, valor: l => duracao(min(l.createdAt, l.entregueEm)), ordenar: l => min(l.createdAt, l.entregueEm) },
  { chave: "notaFiscalNumero", rotulo: "NF", valor: l => l.notaFiscalNumero || "—" },
];

// Na tela mostramos menos colunas; o CSV leva todas.
const VISIVEIS = ["codigo", "createdAt", "status", "comercio", "cliente", "entregador", "distanciaKm", "valor", "tempoTotal"];

export default function Entregas() {
  const navegar = useNavigate();
  const [periodo, setPeriodo] = usePeriodo(7);
  const [status, setStatus] = useState("");
  const [comercioId, setComercioId] = useState("");
  const [entregadorId, setEntregadorId] = useState("");
  const { dados: comercios } = useApi("/comercios");
  const { dados: entregadores } = useApi("/entregadores");
  const { dados, erro, carregando } = useApi(`/pedidos${qs({
    desde: `${periodo.desde}T00:00:00`, ate: `${periodo.ate}T23:59:59`, status, comercioId, entregadorId, limite: 1000,
  })}`);

  return (
    <>
      <Cabecalho titulo="Entregas" subtitulo="Todas as entregas do período, com horários de cada etapa. O CSV traz todas as colunas." />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo}>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_PEDIDO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
        </select>
        <select value={comercioId} onChange={e => setComercioId(e.target.value)} aria-label="Comércio">
          <option value="">Todos os comércios</option>
          {(comercios || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
        </select>
        <select value={entregadorId} onChange={e => setEntregadorId(e.target.value)} aria-label="Entregador">
          <option value="">Todos os entregadores</option>
          {(entregadores || []).map(e => <option key={e.id} value={e.id}>{e.nomeCompleto}</option>)}
        </select>
      </FiltroPeriodo>
      <ErroCaixa erro={erro} />
      {dados?.length === 1000 && <div className="aviso-caixa">Mostrando as 1.000 entregas mais recentes. Reduza o período para ver todas.</div>}
      <TabelaRelatorio
        colunas={COLUNAS.filter(c => VISIVEIS.includes(c.chave))}
        linhas={dados}
        carregando={carregando}
        chaveLinha={l => l.id}
        onLinha={l => navegar(`/operacao?abrir=${l.id}`)}
        nomeCsv={`entregas_${periodo.desde}_${periodo.ate}`}
      />
      <CsvCompleto linhas={dados} periodo={periodo} />
    </>
  );
}

// Botão extra: CSV com todas as colunas (a tabela exporta só as visíveis).
function CsvCompleto({ linhas, periodo }) {
  if (!linhas?.length) return null;
  return (
    <div className="botoes">
      <Botao pequeno onClick={() => baixarCsv(`entregas_completo_${periodo.desde}_${periodo.ate}`, COLUNAS, linhas)}>⬇ Exportar CSV completo (todas as colunas)</Botao>
    </div>
  );
}
