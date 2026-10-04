// Financeiro › Acerto de Entregadores — por entregador no período (início/fim): entregas finalizadas e canceladas,
// total de taxas, quanto retirou pelo app (saques) e o saldo que ficou na carteira. Abaixo, as retiradas do período
// (normais e rápidas, com a taxa de cada saque), que podem ser marcadas como pagamento pendente ou realizado.
import { useEffect, useState } from "react";
import { api, qs } from "../../api";
import { useAuth } from "../../auth";
import { useApi } from "../../hooks/useApi";
import { Badge, Botao, BotaoConfirmar, Cabecalho, Carregando, ErroCaixa, Vazio, useAcao } from "../../components/ui";
import Baixar from "../../components/Baixar";
import { VEICULOS, dataHora, moeda, numero, paraInputData } from "../../utils/format";

const dataBR = t => (t ? t.split("-").reverse().join("/") : "");
const pct = v => `${Number(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const TIPO = { NORMAL: "Normal", RAPIDO: "Rápido" };
const STATUS = { PENDENTE: ["aviso", "Pagamento pendente"], PAGO: ["ok", "Pagamento realizado"], RECUSADO: ["critico", "Recusado"] };

function specResumo(linhas, desde, ate, busca) {
  const soma = c => linhas.reduce((s, l) => s + (l[c] || 0), 0);
  return {
    arquivo: `acerto-entregadores-${desde}-a-${ate}`, aba: "Entregadores", titulo: "Acerto de Entregadores",
    subtitulo: [`Período: ${dataBR(desde)} a ${dataBR(ate)}`, busca && `Busca: ${busca}`].filter(Boolean).join(" · "),
    resumo: [["Entregas finalizadas", numero(soma("finalizadas"))], ["Total de taxas", moeda(soma("taxas"))], ["Retirado pelo app", moeda(soma("retirado"))], ["Saldo nas carteiras", moeda(soma("saldoAtual"))]],
    colunas: [
      { titulo: "Entregador", valor: l => l.nome, largura: 28 },
      { titulo: "Finalizadas", valor: l => l.finalizadas, tipo: "numero", largura: 12, larguraPdf: 22 },
      { titulo: "Canceladas", valor: l => l.canceladas, tipo: "numero", largura: 12, larguraPdf: 22 },
      { titulo: "Total de taxas", valor: l => l.taxas, tipo: "moeda", largura: 15 },
      { titulo: "Retirado", valor: l => l.retirado, tipo: "moeda", largura: 14 },
      { titulo: "Retirada rápida", valor: l => l.retiradoRapido, tipo: "moeda", largura: 15 },
      { titulo: "Taxas de saque", valor: l => l.taxasSaque, tipo: "moeda", largura: 15 },
      { titulo: "Saldo após retiradas", valor: l => l.saldoAtual, tipo: "moeda", largura: 18 },
    ],
    linhas,
    totais: { 1: soma("finalizadas"), 2: soma("canceladas"), 3: soma("taxas"), 4: soma("retirado"), 5: soma("retiradoRapido"), 6: soma("taxasSaque"), 7: soma("saldoAtual") },
  };
}

function specRetiradas(saques, desde, ate, tipo) {
  const validos = saques.filter(s => s.status !== "RECUSADO");
  const soma = (lista, c) => lista.reduce((s, x) => s + (x[c] || 0), 0);
  return {
    arquivo: `retiradas-${desde}-a-${ate}`, aba: "Retiradas", titulo: "Retiradas dos entregadores",
    subtitulo: [`Período: ${dataBR(desde)} a ${dataBR(ate)}`, tipo && `Somente saque ${TIPO[tipo].toLowerCase()}`].filter(Boolean).join(" · "),
    resumo: [["Retiradas", numero(validos.length)], ["Valor sacado", moeda(soma(validos, "valor"))], ["Taxas de saque", moeda(soma(validos, "valorTaxa"))], ["Pagamento pendente", moeda(soma(validos.filter(s => s.status === "PENDENTE"), "liquido"))]],
    colunas: [
      { titulo: "Data", valor: s => s.createdAt, tipo: "data", largura: 17, larguraPdf: 26 },
      { titulo: "Nº", valor: s => s.numero, largura: 7, larguraPdf: 12 },
      { titulo: "Entregador", valor: s => s.entregador, largura: 26 },
      { titulo: "Tipo", valor: s => TIPO[s.tipo], largura: 10, larguraPdf: 16 },
      { titulo: "Sacou", valor: s => s.valor, tipo: "moeda", largura: 13 },
      { titulo: "Taxa (%)", valor: s => pct(s.taxaPercentual), largura: 10, larguraPdf: 16 },
      { titulo: "Valor da taxa", valor: s => s.valorTaxa, tipo: "moeda", largura: 13 },
      { titulo: "A receber", valor: s => s.liquido, tipo: "moeda", largura: 13 },
      { titulo: "Status", valor: s => STATUS[s.status][1], largura: 20, larguraPdf: 32 },
    ],
    linhas: saques,
    totais: { 4: soma(validos, "valor"), 6: soma(validos, "valorTaxa"), 7: soma(validos, "liquido") },
  };
}

export default function Acerto() {
  const { podeEditar } = useAuth();
  const pode = podeEditar("financeiro");
  const hoje = paraInputData(new Date());
  const [desde, setDesde] = useState(paraInputData(new Date(Date.now() - 6 * 864e5)));
  const [ate, setAte] = useState(hoje);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [tipo, setTipo] = useState("");
  const [status, setStatus] = useState("");
  const { executar, ocupado } = useAcao();

  useEffect(() => { const t = setTimeout(() => setBuscaAplicada(busca.trim()), 350); return () => clearTimeout(t); }, [busca]);
  const { dados, erro, carregando, recarregar } = useApi(`/financeiro/acerto-entregadores${qs({ desde, ate, busca: buscaAplicada })}`);
  const linhas = dados?.linhas || [];
  const saques = (dados?.saques || []).filter(s => (!tipo || s.tipo === tipo) && (!status || s.status === status));
  const rapidas = (dados?.saques || []).filter(s => s.tipo === "RAPIDO" && s.status !== "RECUSADO");

  async function marcar(s, para) {
    const rota = para === "PAGO" ? "pagar" : "pendente";
    if (await executar(() => api.post(`/financeiro/saques/${s.id}/${rota}`, para === "PAGO" ? { formaPagamento: "PIX" } : {}),
      para === "PAGO" ? `Saque nº ${s.numero} confirmado como pago. O entregador foi avisado.` : `Saque nº ${s.numero} voltou para pagamento pendente.`)) {
      recarregar({ silencioso: true });
    }
  }

  async function excluir(s) {
    if (await executar(() => api.del(`/financeiro/saques/${s.id}`), `Saque nº ${s.numero} excluído: ${moeda(s.valor)} voltou para o saldo de ${s.entregador}.`)) {
      recarregar({ silencioso: true });
    }
  }

  return (
    <>
      <Cabecalho titulo="Acerto de Entregadores" subtitulo="Taxas, entregas e retiradas de cada entregador no período" />
      <div className="filtros">
        <label className="filtro-data">Início <input type="date" value={desde} max={ate || undefined} onChange={e => setDesde(e.target.value)} aria-label="Data de início" /></label>
        <label className="filtro-data">Fim <input type="date" value={ate} min={desde || undefined} onChange={e => setAte(e.target.value)} aria-label="Data de fim" /></label>
        <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar entregador" aria-label="Pesquisar entregador" />
      </div>
      <ErroCaixa erro={erro} onTentar={() => recarregar()} />

      <section className="cartao cartao-tabela">
        <div className="tabela-barra">
          <strong>Entregadores</strong>
          <Baixar rotulo="Resumo" desabilitado={!linhas.length} gerar={() => specResumo(linhas, desde, ate, buscaAplicada)} />
        </div>
        {carregando && !dados ? <Carregando /> : linhas.length === 0 ? <Vazio titulo="Nenhum entregador com movimento no período" /> : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Entregador</th>
                  <th className="num">Finalizadas</th>
                  <th className="num">Canceladas</th>
                  <th className="num">Total de taxas</th>
                  <th className="num">Retirado pelo app</th>
                  <th className="num">Retirada rápida</th>
                  <th className="num">Saldo após retiradas</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.entregadorId}>
                    <td><strong>{l.nome}</strong><div className="celula-sub">{VEICULOS[l.veiculoTipo] || ""}</div></td>
                    <td className="num"><Badge tom="ok">{numero(l.finalizadas)}</Badge></td>
                    <td className="num">{l.canceladas ? <Badge tom="critico">{numero(l.canceladas)}</Badge> : <span className="apagado">0</span>}</td>
                    <td className="num"><strong>{moeda(l.taxas)}</strong></td>
                    <td className="num">{moeda(l.retirado)}{l.aPagar > 0 && <div className="celula-sub">{moeda(l.aPagar)} a pagar</div>}</td>
                    <td className="num">{moeda(l.retiradoRapido)}{l.taxasSaque > 0 && <div className="celula-sub">taxas {moeda(l.taxasSaque)}</div>}</td>
                    <td className="num"><strong className={l.saldoAtual < 0 ? "texto-critico" : ""}>{moeda(l.saldoAtual)}</strong></td>
                  </tr>
                ))}
              </tbody>
              {linhas.length > 1 && (
                <tfoot>
                  <tr>
                    <td><strong>Total</strong></td>
                    {["finalizadas", "canceladas"].map(c => <td key={c} className="num"><strong>{numero(linhas.reduce((s, l) => s + l[c], 0))}</strong></td>)}
                    {["taxas", "retirado", "retiradoRapido", "saldoAtual"].map(c => <td key={c} className="num"><strong>{moeda(linhas.reduce((s, l) => s + l[c], 0))}</strong></td>)}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      <section className="cartao cartao-tabela">
        <div className="tabela-barra">
          <strong>Retiradas do período</strong>
          <div className="botoes">
            <select value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Tipo de retirada">
              <option value="">Todas as retiradas</option>
              <option value="RAPIDO">Só retirada rápida</option>
              <option value="NORMAL">Só retirada normal</option>
            </select>
            <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status do pagamento">
              <option value="">Todos os status</option>
              <option value="PENDENTE">Pagamento pendente</option>
              <option value="PAGO">Pagamento realizado</option>
              <option value="RECUSADO">Recusado</option>
            </select>
            <Baixar rotulo="Retiradas" desabilitado={!saques.length} gerar={() => specRetiradas(saques, desde, ate, tipo)} />
          </div>
        </div>
        {dados && rapidas.length > 0 && (
          <div className="tabela-barra apagado">
            <span>Retiradas rápidas no período: <strong>{numero(rapidas.length)}</strong> · sacado <strong>{moeda(rapidas.reduce((s, x) => s + x.valor, 0))}</strong> · taxas <strong>{moeda(rapidas.reduce((s, x) => s + x.valorTaxa, 0))}</strong></span>
          </div>
        )}
        {carregando && !dados ? <Carregando /> : saques.length === 0 ? <Vazio titulo="Nenhuma retirada no período" /> : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr><th>Retirada</th><th>Entregador</th><th>Tipo</th><th className="num">Sacou</th><th className="num">Taxa</th><th className="num">A receber</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {saques.map(s => (
                  <tr key={s.id}>
                    <td><strong>Nº {s.numero}</strong><div className="celula-sub">{dataHora(s.createdAt)}</div></td>
                    <td>{s.entregador}</td>
                    <td>{s.tipo === "RAPIDO" ? <Badge tom="aviso">Rápido</Badge> : <Badge>Normal</Badge>}</td>
                    <td className="num"><strong>{moeda(s.valor)}</strong></td>
                    <td className="num">{pct(s.taxaPercentual)}<div className="celula-sub">{moeda(s.valorTaxa)}</div></td>
                    <td className="num">{moeda(s.liquido)}</td>
                    <td>
                      <Badge tom={STATUS[s.status][0]}>{STATUS[s.status][1]}</Badge>
                      {s.pagoEm && <div className="celula-sub">{dataHora(s.pagoEm)}</div>}
                      {s.motivo && <div className="celula-sub">Motivo: {s.motivo}</div>}
                    </td>
                    <td className="botoes">
                      {pode && s.status === "PENDENTE" && <>
                        <Botao pequeno variante="primario" disabled={ocupado} onClick={() => marcar(s, "PAGO")}>Confirmar como pago</Botao>
                        <BotaoConfirmar pequeno confirmar={`Excluir e devolver ${moeda(s.valor)}?`} disabled={ocupado} onConfirm={() => excluir(s)}>Excluir</BotaoConfirmar>
                      </>}
                      {pode && s.status === "PAGO" && <Botao pequeno variante="fantasma" disabled={ocupado} onClick={() => marcar(s, "PENDENTE")}>Marcar como pendente</Botao>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
