// Financeiro › Acerto de Entregadores — ganhos do período (início/fim) e fechamento do pagamento.
import { useState } from "react";
import { api, qs } from "../../api";
import { useAuth } from "../../auth";
import { useApi } from "../../hooks/useApi";
import { Badge, Botao, BotaoConfirmar, Cabecalho, Campo, Carregando, ErroCaixa, Modal, StatTile, useAcao } from "../../components/ui";
import { FiltroPeriodo, TabelaRelatorio, usePeriodo } from "../../components/relatorios";
import { VEICULOS, data, dataHora, moeda, numero, paraInputData } from "../../utils/format";

export const FORMAS_PAGAMENTO = ["Pix", "Transferência bancária", "Dinheiro", "Boleto", "Cartão", "Depósito"];
export const abrirImpressao = caminho => window.open(caminho, "_blank", "noopener");

function ModalFechar({ linha, periodo, onFechar, onFeito }) {
  const [ajustes, setAjustes] = useState("");
  const [descricaoAjustes, setDescricaoAjustes] = useState("");
  const [vencimento, setVencimento] = useState(paraInputData(new Date()));
  const [observacao, setObservacao] = useState("");
  const { executar, ocupado } = useAcao();
  const ajusteNum = Number(String(ajustes).replace(",", ".")) || 0;
  const total = linha.comissaoPendente + (linha.comissaoAutoPendente || 0) + ajusteNum;

  async function fechar(e) {
    e.preventDefault();
    const r = await executar(() => api.post("/financeiro/acertos", {
      entregadorId: linha.entregadorId, ...periodo, ajustes: ajusteNum, descricaoAjustes, vencimento, observacao,
    }), "Acerto fechado — conta a pagar gerada.");
    if (r) onFeito();
  }

  return (
    <Modal titulo={`Fechar acerto · ${linha.nome}`} onFechar={onFechar}>
      <form onSubmit={fechar}>
        <dl className="detalhes">
          <dt>Período</dt><dd>{data(`${periodo.desde}T12:00:00`)} a {data(`${periodo.ate}T12:00:00`)}</dd>
          <dt>Entregas pendentes</dt><dd>{numero(linha.pendentes)}</dd>
          <dt>Comissão das entregas</dt><dd>{moeda(linha.comissaoPendente)}</dd>
          {linha.comissaoAutoPendente > 0 && <><dt>Comissão automática</dt><dd>{moeda(linha.comissaoAutoPendente)} <span className="apagado">(extra pago pela empresa)</span></dd></>}
        </dl>
        {linha.semRegra > 0 && <div className="aviso-caixa">{linha.semRegra} entrega(s) sem regra de comissão entram com R$ 0. Ajuste o cadastro antes, ou compense no ajuste.</div>}
        <div className="grade-campos">
          <Campo rotulo="Ajuste (R$)" dica="Bônus positivo, desconto negativo (ex.: -15).">
            <input type="number" step="0.01" value={ajustes} onChange={e => setAjustes(e.target.value)} />
          </Campo>
          <Campo rotulo="Vencimento do pagamento"><input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} required /></Campo>
          {ajusteNum !== 0 && (
            <Campo rotulo="Motivo do ajuste *" largo><input value={descricaoAjustes} onChange={e => setDescricaoAjustes(e.target.value)} required /></Campo>
          )}
          <Campo rotulo="Observação" largo><input value={observacao} onChange={e => setObservacao(e.target.value)} /></Campo>
        </div>
        <div className="total-destaque">Total a pagar <strong>{moeda(total)}</strong></div>
        <div className="form-rodape">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-primario" disabled={ocupado || total < 0}>Fechar acerto</button>
        </div>
      </form>
    </Modal>
  );
}

export function ModalPagamento({ titulo, valor, onFechar, onConfirmar, rotuloData = "Data do pagamento" }) {
  const [forma, setForma] = useState("Pix");
  const [dia, setDia] = useState(paraInputData(new Date()));
  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <form onSubmit={e => { e.preventDefault(); onConfirmar({ formaPagamento: forma, data: dia }); }}>
        <div className="total-destaque">Valor <strong>{moeda(valor)}</strong></div>
        <div className="grade-campos">
          <Campo rotulo="Forma de pagamento">
            <select value={forma} onChange={e => setForma(e.target.value)}>{FORMAS_PAGAMENTO.map(f => <option key={f}>{f}</option>)}</select>
          </Campo>
          <Campo rotulo={rotuloData}><input type="date" value={dia} onChange={e => setDia(e.target.value)} required /></Campo>
        </div>
        <div className="form-rodape">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-primario">Confirmar</button>
        </div>
      </form>
    </Modal>
  );
}

function DetalheAcerto({ id, onFechar }) {
  const { dados: a } = useApi(`/financeiro/acertos/${id}`);
  const autoPorPedido = Object.fromEntries((a?.comissoes || []).filter(c => c.pedidoId).map(c => [c.pedidoId, c.valor]));
  return (
    <Modal titulo={a ? `Acerto nº ${a.numero} · ${a.entregador.nomeCompleto}` : "Acerto"} onFechar={onFechar} largo>
      {!a ? <Carregando /> : (
        <>
          <dl className="detalhes">
            <dt>Período</dt><dd>{data(a.inicio)} a {data(a.fim)}</dd>
            <dt>Comissão</dt><dd>{moeda(a.valorComissao)} ({a.entregas} entregas)</dd>
            {a.comissoesAutomaticas > 0 && <><dt>Comissão automática</dt><dd>{moeda(a.comissoesAutomaticas)} ({a.comissoes.length} entrega(s), extra pago pela empresa)</dd></>}
            <dt>Ajuste</dt><dd>{a.ajustes ? `${moeda(a.ajustes)} — ${a.descricaoAjustes}` : "—"}</dd>
            <dt>Total</dt><dd><strong>{moeda(a.valorTotal)}</strong></dd>
            <dt>Situação</dt><dd>{a.pago ? `Pago em ${data(a.pagoEm)} (${a.formaPagamento || "—"})` : "Pendente de pagamento"}</dd>
            <dt>Fechado por</dt><dd>{a.autorNome || "—"} em {dataHora(a.createdAt)}</dd>
          </dl>
          <table className="tabela tabela-compacta">
            <thead><tr><th>Pedido</th><th>Entregue</th><th>Comércio</th><th className="num">Valor</th><th className="num">Comissão</th><th className="num">Automática</th></tr></thead>
            <tbody>
              {a.pedidos.map(p => (
                <tr key={p.id}><td>{p.codigo}</td><td>{dataHora(p.entregueEm)}</td><td>{p.comercio?.nomeFantasia}</td><td className="num">{moeda(p.valor)}</td><td className="num">{moeda(p.comissaoEntregador)}</td><td className="num">{autoPorPedido[p.id] != null ? moeda(autoPorPedido[p.id]) : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}

export default function Acerto() {
  const { podeEditar } = useAuth();
  const pode = podeEditar("financeiro");
  const [periodo, setPeriodo] = usePeriodo(7);
  const [entregadorId, setEntregadorId] = useState("");
  const [fechando, setFechando] = useState(null);
  const [pagando, setPagando] = useState(null);
  const [vendo, setVendo] = useState(null);
  const { dados: entregadores } = useApi("/entregadores");
  const ganhos = useApi(`/financeiro/ganhos${qs({ ...periodo, entregadorId })}`);
  const acertos = useApi(`/financeiro/acertos${qs({ ...periodo, entregadorId })}`);
  const { executar } = useAcao();
  const t = ganhos.dados?.totais;

  function atualizar() {
    ganhos.recarregar({ silencioso: true });
    acertos.recarregar({ silencioso: true });
  }

  async function recibo(a) {
    const r = await executar(() => api.post(`/financeiro/acertos/${a.id}/recibo`));
    if (r) abrirImpressao(`/imprimir/recibo/${r.id}`);
  }

  return (
    <>
      <Cabecalho titulo="Acerto de Entregadores" subtitulo="Escolha o início e o fim para ver os ganhos de cada entregador e fechar o pagamento" />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo}>
        <select value={entregadorId} onChange={e => setEntregadorId(e.target.value)} aria-label="Entregador">
          <option value="">Todos os entregadores</option>
          {(entregadores || []).map(e => <option key={e.id} value={e.id}>{e.nomeCompleto}</option>)}
        </select>
      </FiltroPeriodo>
      <ErroCaixa erro={ganhos.erro || acertos.erro} />

      {t && (
        <div className="grade-stats">
          <StatTile rotulo="A acertar no período" valor={moeda(t.comissaoPendente + t.comissaoAutoPendente)} tom={t.comissaoPendente + t.comissaoAutoPendente > 0 ? "aviso" : undefined} detalhe={t.comissaoAutoPendente > 0 ? `inclui ${moeda(t.comissaoAutoPendente)} de comissão automática` : "Entregas ainda não acertadas"} />
          <StatTile rotulo="Já acertado" valor={moeda(t.comissaoAcertada)} />
          <StatTile rotulo="Entregas concluídas" valor={numero(t.entregas)} />
          <StatTile rotulo="Entregas sem regra" valor={numero(t.semRegra)} tom={t.semRegra ? "critico" : undefined} detalhe={t.semRegra ? "Ganho R$ 0 — veja Comissão" : ""} />
        </div>
      )}

      <h2 className="titulo-secao">Ganhos por entregador</h2>
      <TabelaRelatorio
        linhas={ganhos.dados?.linhas}
        carregando={ganhos.carregando}
        vazio="Nenhuma entrega concluída no período"
        chaveLinha={l => l.entregadorId}
        nomeCsv={`ganhos_entregadores_${periodo.desde}_${periodo.ate}`}
        colunas={[
          { chave: "nome", rotulo: "Entregador", valor: l => <><strong>{l.nome}</strong><div className="celula-sub">{VEICULOS[l.veiculoTipo]}</div></> },
          { chave: "entregas", rotulo: "Entregas", num: true, valor: l => numero(l.entregas) },
          { chave: "pendentes", rotulo: "A acertar", num: true, valor: l => numero(l.pendentes) },
          { chave: "comissaoPendente", rotulo: "Comissão entregas", num: true, valor: l => moeda(l.comissaoPendente) },
          { chave: "comissaoAutoPendente", rotulo: "Comissão automática", num: true, valor: l => (l.comissaoAuto > 0 ? moeda(l.comissaoAutoPendente) : <span className="apagado">—</span>) },
          { chave: "aPagar", rotulo: "Total a acertar", num: true, valor: l => <strong>{moeda(l.aPagar)}</strong> },
          { chave: "comissaoAcertada", rotulo: "Já acertado", num: true, valor: l => moeda(l.comissaoAcertada) },
          { chave: "acao", rotulo: "", valor: l => (pode && (l.pendentes > 0 || l.comissaoAutoPendente > 0)
            ? <Botao pequeno variante="primario" onClick={() => setFechando(l)}>Fechar acerto</Botao>
            : l.pendentes === 0 && !l.comissaoAutoPendente ? <Badge tom="ok">✓ Tudo acertado</Badge> : null), csv: () => "" },
        ]}
      />

      <h2 className="titulo-secao">Acertos deste período</h2>
      <TabelaRelatorio
        linhas={acertos.dados}
        carregando={acertos.carregando}
        vazio="Nenhum acerto fechado neste período"
        chaveLinha={l => l.id}
        nomeCsv={`acertos_${periodo.desde}_${periodo.ate}`}
        colunas={[
          { chave: "numero", rotulo: "Nº", num: true },
          { chave: "entregador", rotulo: "Entregador", valor: l => l.entregador.nomeCompleto, ordenar: l => l.entregador.nomeCompleto },
          { chave: "periodo", rotulo: "Período", valor: l => `${data(l.inicio)} a ${data(l.fim)}`, ordenar: l => new Date(l.inicio).getTime() },
          { chave: "entregas", rotulo: "Entregas", num: true },
          { chave: "valorTotal", rotulo: "Total", num: true, valor: l => <strong>{moeda(l.valorTotal)}</strong> },
          { chave: "pago", rotulo: "Situação", valor: l => (l.pago ? <Badge tom="ok">✓ Pago {data(l.pagoEm)}</Badge> : <Badge tom="aviso">A pagar</Badge>), csv: l => (l.pago ? "Pago" : "A pagar") },
          { chave: "acoes", rotulo: "", csv: () => "", valor: l => (
            <span className="acoes-celula">
              <Botao pequeno variante="fantasma" onClick={() => setVendo(l.id)}>Ver</Botao>
              {pode && !l.pago && <Botao pequeno onClick={() => setPagando(l)}>Registrar pagamento</Botao>}
              {l.pago && <Botao pequeno onClick={() => recibo(l)}>Recibo</Botao>}
              {pode && l.pago && <Botao pequeno variante="fantasma" onClick={async () => { if (await executar(() => api.patch(`/financeiro/acertos/${l.id}/reabrir`), "Pagamento reaberto.")) atualizar(); }}>Reabrir</Botao>}
              {pode && !l.pago && (
                <BotaoConfirmar pequeno confirmar="Excluir? As entregas voltam a ficar a acertar." onConfirm={async () => {
                  if (await executar(() => api.del(`/financeiro/acertos/${l.id}`), "Acerto excluído.")) atualizar();
                }}>Excluir</BotaoConfirmar>
              )}
            </span>
          ) },
        ]}
      />

      {fechando && <ModalFechar linha={fechando} periodo={periodo} onFechar={() => setFechando(null)} onFeito={() => { setFechando(null); atualizar(); }} />}
      {pagando && (
        <ModalPagamento
          titulo={`Pagamento do acerto nº ${pagando.numero} · ${pagando.entregador.nomeCompleto}`}
          valor={pagando.valorTotal}
          onFechar={() => setPagando(null)}
          onConfirmar={async ({ formaPagamento, data: pagoEm }) => {
            if (await executar(() => api.patch(`/financeiro/acertos/${pagando.id}/pagar`, { formaPagamento, pagoEm }), "Pagamento registrado.")) { setPagando(null); atualizar(); }
          }}
        />
      )}
      {vendo && <DetalheAcerto id={vendo} onFechar={() => setVendo(null)} />}
    </>
  );
}
