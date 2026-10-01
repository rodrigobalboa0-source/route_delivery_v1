// Financeiro › Faturamento — gera as faturas dos comércios pelas entregas do período ainda não faturadas.
// Aba "Relatório de entregas": todas as entregas finalizadas no período, uma por linha.
// Downloads do faturamento e do relatório em Excel e PDF (com a logo do sistema).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../../api";
import { useAuth } from "../../auth";
import { useApi } from "../../hooks/useApi";
import { Abas, Badge, Botao, Cabecalho, Carregando, ErroCaixa, StatTile, Vazio, useAcao, useToast } from "../../components/ui";
import { FiltroPeriodo, usePeriodo } from "../../components/relatorios";
import { dataHora, moeda, numero, paraInputData } from "../../utils/format";

const dataBR = t => (t ? t.split("-").reverse().join("/") : "");
const textoPeriodo = p => `Período: ${dataBR(p.desde)} a ${dataBR(p.ate)}`;
const nomeArquivo = (base, p) => `${base}-${p.desde}-a-${p.ate}`;
const kmBR = v => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;

// Botões "Excel" e "PDF" de um download.
function Baixar({ rotulo, gerar, desabilitado }) {
  const [gerando, setGerando] = useState(null);
  const avisar = useToast();
  async function baixar(formato) {
    setGerando(formato);
    try {
      const { exportarExcel, exportarPdf } = await import("../../utils/exportar");
      await (formato === "excel" ? exportarExcel : exportarPdf)(await gerar());
    } catch (e) {
      avisar(`Não foi possível gerar o arquivo: ${e.message}`, "erro");
    } finally {
      setGerando(null);
    }
  }
  return (
    <div className="baixar-grupo" role="group" aria-label={`Baixar ${rotulo}`}>
      <span>{rotulo}</span>
      <Botao pequeno disabled={desabilitado || !!gerando} onClick={() => baixar("excel")}>{gerando === "excel" ? "Gerando…" : "Baixar Excel"}</Botao>
      <Botao pequeno disabled={desabilitado || !!gerando} onClick={() => baixar("pdf")}>{gerando === "pdf" ? "Gerando…" : "Baixar PDF"}</Botao>
    </div>
  );
}

// Colunas do relatório (tela, Excel e PDF usam as mesmas).
const COLUNAS_RELATORIO = [
  { titulo: "Entregue em", valor: l => l.entregueEm, tipo: "data", largura: 17, larguraPdf: 24 },
  { titulo: "Pedido", valor: l => [l.codigo, l.codigoExterno].filter(Boolean).join(" · "), largura: 18, larguraPdf: 24 },
  { titulo: "Comércio", valor: l => l.comercio, largura: 24 },
  { titulo: "Cliente", valor: l => l.cliente, largura: 22 },
  { titulo: "Endereço", valor: l => l.endereco, largura: 40, larguraPdf: 60 },
  { titulo: "Entregador", valor: l => l.entregador, largura: 22 },
  { titulo: "Km", valor: l => l.km, tipo: "km", largura: 11, larguraPdf: 16 },
  { titulo: "Retorno", valor: l => (l.retorno ? "Sim" : "Não"), largura: 9, larguraPdf: 17 },
  { titulo: "Fatura", valor: l => (l.fatura ? `Nº ${l.fatura.numero}${l.fatura.paga ? " (paga)" : ""}` : "A faturar"), largura: 14, larguraPdf: 20 },
  { titulo: "Valor", valor: l => l.valor, tipo: "moeda", largura: 13, larguraPdf: 20 },
];

function specRelatorio(dados, periodo, filtroTexto) {
  return {
    arquivo: nomeArquivo("relatorio-entregas", periodo),
    aba: "Entregas",
    titulo: "Relatório de entregas",
    subtitulo: [textoPeriodo(periodo), filtroTexto].filter(Boolean).join(" · "),
    resumo: [
      ["Entregas finalizadas", numero(dados.totais.entregas)],
      ["Valor das entregas", moeda(dados.totais.valor)],
      ["Já faturadas / a faturar", `${numero(dados.totais.faturadas)} / ${numero(dados.totais.aFaturar)}`],
      ["Km rodados", kmBR(dados.totais.km)],
    ],
    colunas: COLUNAS_RELATORIO,
    linhas: dados.linhas,
    totais: { 1: `${dados.totais.entregas} entrega(s)`, 6: dados.totais.km, 9: dados.totais.valor },
  };
}

function specFaturamento(dados, periodo) {
  const t = dados.totais;
  return {
    arquivo: nomeArquivo("faturamento", periodo),
    aba: "Faturamento",
    titulo: "Faturamento",
    subtitulo: textoPeriodo(periodo),
    resumo: [
      ["Entregas finalizadas no período", `${numero(t.finalizadas)} · ${moeda(t.valorFinalizadas)}`],
      ["A faturar", `${numero(t.entregas)} entregas · ${moeda(t.valor)}`],
      ["Comércios a faturar", numero(t.comercios)],
    ],
    colunas: [
      { titulo: "Comércio", valor: l => l.nome, largura: 30 },
      { titulo: "Razão social", valor: l => l.razaoSocial, largura: 30 },
      { titulo: "Entregas a faturar", valor: l => l.entregas, tipo: "numero", largura: 16 },
      { titulo: "Já faturadas no período", valor: l => l.jaFaturadas, tipo: "numero", largura: 18 },
      { titulo: "Pagamento preferido", valor: l => l.metodoPagamento, largura: 20 },
      { titulo: "Valor a faturar", valor: l => l.valor, tipo: "moeda", largura: 16 },
    ],
    linhas: dados.linhas,
    totais: { 2: t.entregas, 3: dados.linhas.reduce((s, l) => s + (l.jaFaturadas || 0), 0), 5: t.valor },
  };
}

function AbaFaturamento({ periodo, vencimento, pode }) {
  const [marcados, setMarcados] = useState(new Set());
  const [resultado, setResultado] = useState(null);
  const previa = useApi(`/financeiro/faturamento/previa${qs(periodo)}`);
  const { executar, ocupado } = useAcao();

  // Ao mudar a prévia, marca todos os comércios com valor a faturar.
  useEffect(() => { setMarcados(new Set((previa.dados?.linhas || []).map(l => l.comercioId))); setResultado(null); }, [previa.dados]);

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
    if (r) { previa.recarregar({ silencioso: true }).then(() => setResultado(r)); }
  }

  return (
    <>
      <ErroCaixa erro={previa.erro} />
      {resultado && (
        <div className="sucesso-caixa">
          {resultado.quantidade} fatura(s) gerada(s), total {moeda(resultado.valor)}.
          <Link to="/financeiro/contas-receber" className="link">Ver em Contas a Receber</Link>
        </div>
      )}

      {previa.dados && (
        <>
          <div className="grade-stats">
            <StatTile rotulo="Entregas finalizadas no período" valor={numero(previa.dados.totais.finalizadas)} detalhe={moeda(previa.dados.totais.valorFinalizadas)} />
            <StatTile rotulo="A faturar no período" valor={moeda(previa.dados.totais.valor)} detalhe={`${numero(previa.dados.totais.entregas)} entregas`} />
            <StatTile rotulo="Comércios" valor={numero(previa.dados.totais.comercios)} />
            <StatTile rotulo="Selecionado" valor={moeda(totalEscolhido)} detalhe={`${escolhidas.length} fatura(s)`} />
          </div>
          <div className="barra-downloads">
            <Baixar rotulo="Faturamento" gerar={async () => specFaturamento(previa.dados, periodo)} />
          </div>
        </>
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
    </>
  );
}

const SITUACOES = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "a_faturar", rotulo: "A faturar" },
  { valor: "faturadas", rotulo: "Já faturadas" },
];

function AbaRelatorio({ periodo }) {
  const [comercioId, setComercioId] = useState("");
  const [situacao, setSituacao] = useState("todas");
  const comercios = useApi("/comercios/permissoes"); // lista leve: id e nome de cada loja
  const rel = useApi(`/financeiro/faturamento/relatorio${qs({ ...periodo, comercioId, situacao })}`);
  const d = rel.dados;
  const nomeLoja = comercios.dados?.find(c => c.id === comercioId)?.nomeFantasia;
  const filtroTexto = [nomeLoja && `Comércio: ${nomeLoja}`, situacao !== "todas" && SITUACOES.find(s => s.valor === situacao).rotulo].filter(Boolean).join(" · ");

  return (
    <>
      <div className="filtros">
        <label className="campo-inline">Comércio
          <select value={comercioId} onChange={e => setComercioId(e.target.value)}>
            <option value="">Todos</option>
            {(comercios.dados || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
          </select>
        </label>
        <div className="segmentado" role="group" aria-label="Situação">
          {SITUACOES.map(s => (
            <button key={s.valor} type="button" className={situacao === s.valor ? "ativo" : ""} aria-pressed={situacao === s.valor} onClick={() => setSituacao(s.valor)}>{s.rotulo}</button>
          ))}
        </div>
      </div>
      <ErroCaixa erro={rel.erro} />
      {d && (
        <>
          <div className="grade-stats">
            <StatTile rotulo="Entregas finalizadas" valor={numero(d.totais.entregas)} detalhe={`${numero(d.totais.comercios)} comércio(s)`} />
            <StatTile rotulo="Valor das entregas" valor={moeda(d.totais.valor)} />
            <StatTile rotulo="Já faturadas / a faturar" valor={`${numero(d.totais.faturadas)} / ${numero(d.totais.aFaturar)}`} />
            <StatTile rotulo="Km rodados" valor={kmBR(d.totais.km)} />
          </div>
          <div className="barra-downloads">
            <Baixar rotulo="Relatório de entregas" desabilitado={!d.linhas.length} gerar={async () => specRelatorio(d, periodo, filtroTexto)} />
          </div>
          {d.limite && <div className="aviso-caixa">Mostrando as primeiras 10.000 entregas. Diminua o período para ver todas.</div>}
        </>
      )}
      <section className="cartao cartao-tabela">
        {rel.carregando && !d ? <Carregando /> : !d?.linhas.length ? (
          <Vazio titulo="Nenhuma entrega finalizada">Não há entregas finalizadas neste período com estes filtros.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela tabela-compacta">
              <thead>
                <tr>
                  <th>Entregue em</th><th>Pedido</th><th>Comércio</th><th>Cliente</th><th>Entregador</th>
                  <th className="num">Km</th><th>Fatura</th><th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {d.linhas.map(l => (
                  <tr key={l.id}>
                    <td>{dataHora(l.entregueEm)}</td>
                    <td><strong>{l.codigo}</strong>{l.codigoExterno && <div className="celula-sub">{l.codigoExterno}</div>}</td>
                    <td>{l.comercio}</td>
                    <td>{l.cliente}<div className="celula-sub">{l.endereco}</div></td>
                    <td>{l.entregador}</td>
                    <td className="num">{l.km != null ? kmBR(l.km) : "—"}</td>
                    <td>{l.fatura ? <Badge tom={l.fatura.paga ? "ok" : "info"}>Nº {l.fatura.numero}{l.fatura.paga ? " · paga" : ""}</Badge> : <Badge tom="aviso">A faturar</Badge>}</td>
                    <td className="num">{moeda(l.valor)}{l.retorno && <div className="celula-sub">com retorno</div>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}><strong>Total · {numero(d.totais.entregas)} entrega(s)</strong></td>
                  <td className="num"><strong>{kmBR(d.totais.km)}</strong></td>
                  <td />
                  <td className="num"><strong>{moeda(d.totais.valor)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function Faturamento() {
  const { podeEditar } = useAuth();
  const pode = podeEditar("financeiro");
  const [periodo, setPeriodo] = usePeriodo(30);
  const [aba, setAba] = useState("faturamento");
  const [vencimento, setVencimento] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); return paraInputData(d); });

  return (
    <>
      <Cabecalho titulo="Faturamento" subtitulo="Fecha o período: gera a fatura de cada comércio com as entregas concluídas ainda não faturadas" />
      <Abas ativa={aba} onChange={setAba} abas={[{ valor: "faturamento", rotulo: "Faturamento" }, { valor: "relatorio", rotulo: "Relatório de entregas" }]} />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo}>
        {aba === "faturamento" && <label className="campo-inline">Vencimento das faturas <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} /></label>}
      </FiltroPeriodo>
      {aba === "faturamento" ? <AbaFaturamento periodo={periodo} vencimento={vencimento} pode={pode} /> : <AbaRelatorio periodo={periodo} />}
    </>
  );
}
