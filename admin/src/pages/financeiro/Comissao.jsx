// Financeiro › Comissão
// - Comissões lançadas: um operador lança à mão a comissão de um entregador ou funcionário do ADM
//   (quem recebe, comércio, quantidade de entregas e valores). A de entregador aparece no app dele.
//   Também lista as automáticas (Cadastros › Entregadores), geradas a cada entrega finalizada.
// - Calculada por entregas: quanto cada entregador ganha pelas entregas concluídas (base do acerto).
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, qs } from "../../api";
import { useAuth } from "../../auth";
import { useApi } from "../../hooks/useApi";
import { Abas, Badge, Botao, BotaoConfirmar, Cabecalho, Campo, ErroCaixa, Modal, StatTile, useAcao } from "../../components/ui";
import { FiltroPeriodo, TabelaRelatorio, porcento, usePeriodo } from "../../components/relatorios";
import { TIPO_ENTREGA, VEICULOS, data, dataHora, moeda, numero, paraInputData } from "../../utils/format";
import { ModalPagamento, abrirImpressao } from "./Acerto";

const TOM_REGRA = { TABELA: "info", FIXO: "neutro", ACERTADO: "ok", SEM_REGRA: "critico" };
const TIPO_BENEFICIARIO = { ENTREGADOR: "Entregador", FUNCIONARIO: "Funcionário ADM" };
const ORIGEM = { MANUAL: "Lançadas à mão", AUTOMATICA: "Automáticas (por entrega)" };
const paga = c => !!(c.contaPagar?.paga || c.acerto?.pago);

function situacaoComissao(c) {
  if (c.contaPagar?.paga) return <Badge tom="ok">✓ Paga {data(c.contaPagar.pagaEm)}</Badge>;
  if (c.acerto?.pago) return <Badge tom="ok">✓ Paga no acerto nº {c.acerto.numero}</Badge>;
  if (c.acerto) return <Badge tom="info">No acerto nº {c.acerto.numero}</Badge>;
  if (c.origem === "AUTOMATICA") return <Badge tom="aviso">Entra no próximo acerto</Badge>;
  return <Badge tom="aviso">A pagar · {data(c.contaPagar?.vencimento)}</Badge>;
}

function FormComissao({ onFechar, onSalvo }) {
  const { dados: entregadores } = useApi("/entregadores");
  const { dados: funcionarios } = useApi("/cadastro/contas-gerenciais");
  const { dados: comercios } = useApi("/comercios");
  const hoje = paraInputData(new Date());
  const [v, setV] = useState({
    beneficiarioTipo: "ENTREGADOR", pessoaId: "", comercioId: "", quantidadeEntregas: "", modo: "POR_ENTREGA",
    valor: "", referencia: hoje, vencimento: hoje, descricao: "",
  });
  const { executar, ocupado } = useAcao();
  const set = k => e => setV({ ...v, [k]: e.target.value });

  const qtd = Number(v.quantidadeEntregas) || 0;
  const valor = Number(v.valor) || 0;
  const total = v.modo === "POR_ENTREGA" ? Math.round(valor * qtd * 100) / 100 : valor;
  const pessoas = v.beneficiarioTipo === "ENTREGADOR"
    ? (entregadores || []).map(e => ({ id: e.id, nome: e.nomeCompleto }))
    : (funcionarios || []).map(c => ({ id: c.id, nome: `${c.nome} — ${c.email}` }));

  async function salvar(e) {
    e.preventDefault();
    const corpo = {
      beneficiarioTipo: v.beneficiarioTipo,
      [v.beneficiarioTipo === "ENTREGADOR" ? "entregadorId" : "contaGerencialId"]: v.pessoaId,
      comercioId: v.comercioId, quantidadeEntregas: qtd, referencia: v.referencia, vencimento: v.vencimento, descricao: v.descricao,
      ...(v.modo === "POR_ENTREGA" ? { valorPorEntrega: v.valor } : { valor: v.valor }),
    };
    const r = await executar(() => api.post("/financeiro/comissoes-manuais", corpo), "Comissão lançada.");
    if (r) onSalvo(r);
  }

  return (
    <Modal titulo="Lançar comissão" onFechar={onFechar} largo>
      <form onSubmit={salvar} className="grade-campos">
        <div className="campo campo-largo">
          <span className="campo-rotulo">Para quem é a comissão</span>
          <div className="radios">
            {Object.entries(TIPO_BENEFICIARIO).map(([k, r]) => (
              <label key={k}><input type="radio" name="beneficiarioTipo" checked={v.beneficiarioTipo === k} onChange={() => setV({ ...v, beneficiarioTipo: k, pessoaId: "" })} /> {r}</label>
            ))}
          </div>
        </div>
        <Campo rotulo="Nome de quem vai receber *" largo>
          <select value={v.pessoaId} onChange={set("pessoaId")} required>
            <option value="">Escolha…</option>
            {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Comércio de onde saíram as entregas *">
          <select value={v.comercioId} onChange={set("comercioId")} required>
            <option value="">Escolha…</option>
            {(comercios || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Quantidade de entregas *">
          <input type="number" min="1" step="1" value={v.quantidadeEntregas} onChange={set("quantidadeEntregas")} required />
        </Campo>
        <div className="campo campo-largo">
          <span className="campo-rotulo">Como informar o valor</span>
          <div className="radios">
            <label><input type="radio" name="modo" checked={v.modo === "POR_ENTREGA"} onChange={() => setV({ ...v, modo: "POR_ENTREGA" })} /> Valor por entrega (× quantidade)</label>
            <label><input type="radio" name="modo" checked={v.modo === "TOTAL"} onChange={() => setV({ ...v, modo: "TOTAL" })} /> Valor total da comissão</label>
          </div>
        </div>
        <Campo rotulo={v.modo === "POR_ENTREGA" ? "Valor por entrega (R$) *" : "Valor total (R$) *"}>
          <input type="number" min="0.01" step="0.01" value={v.valor} onChange={set("valor")} required />
        </Campo>
        <Campo rotulo="Data de referência *"><input type="date" value={v.referencia} onChange={set("referencia")} required /></Campo>
        <Campo rotulo="Previsão de pagamento *" dica="Vencimento da conta a pagar gerada"><input type="date" value={v.vencimento} onChange={set("vencimento")} required /></Campo>
        <Campo rotulo="Observação" largo><input value={v.descricao} onChange={set("descricao")} placeholder="Ex.: bônus pelas entregas do almoço de sábado" /></Campo>
        <div className="total-destaque campo-largo">
          <span>{v.modo === "POR_ENTREGA" && qtd > 0 && valor > 0 ? `${numero(qtd)} × ${moeda(valor)}` : "Total da comissão"}</span>
          <strong>{moeda(total)}</strong>
        </div>
        {v.beneficiarioTipo === "ENTREGADOR" && <p className="apagado campo-largo">O entregador verá esta comissão no app, com um aviso na tela. O pagamento é registrado em Contas a Pagar.</p>}
        <div className="form-rodape campo-largo">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-primario" disabled={ocupado || total <= 0}>Lançar comissão</button>
        </div>
      </form>
    </Modal>
  );
}

function ComissoesLancadas() {
  const { podeEditar } = useAuth();
  const podeLancar = podeEditar("comissoes-manuais");
  const podePagar = podeEditar("financeiro");
  const [periodo, setPeriodo] = usePeriodo(30);
  const [tipo, setTipo] = useState("");
  const [comercioId, setComercioId] = useState("");
  const [origem, setOrigem] = useState("");
  const [lancando, setLancando] = useState(false);
  const [pagando, setPagando] = useState(null);
  const { dados: comercios } = useApi("/comercios");
  const { dados, erro, carregando, recarregar } = useApi(`/financeiro/comissoes-manuais${qs({ ...periodo, beneficiarioTipo: tipo, comercioId, origem })}`);
  const { executar } = useAcao();
  const t = dados?.totais;
  const atualizar = () => recarregar({ silencioso: true });

  async function recibo(c) {
    const rec = await executar(() => api.post(`/financeiro/contas-pagar/${c.contaPagar.id}/recibo`));
    if (rec) abrirImpressao(`/imprimir/recibo/${rec.id}`);
  }

  return (
    <>
      <FiltroPeriodo valor={periodo} onChange={setPeriodo}>
        <select value={tipo} onChange={e => setTipo(e.target.value)} aria-label="Quem recebe">
          <option value="">Entregadores e funcionários</option>
          {Object.entries(TIPO_BENEFICIARIO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
        <select value={comercioId} onChange={e => setComercioId(e.target.value)} aria-label="Comércio">
          <option value="">Todos os comércios</option>
          {(comercios || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
        </select>
        <select value={origem} onChange={e => setOrigem(e.target.value)} aria-label="Origem">
          <option value="">Lançadas e automáticas</option>
          {Object.entries(ORIGEM).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
        {podeLancar && <Botao variante="primario" onClick={() => setLancando(true)}>+ Lançar comissão</Botao>}
      </FiltroPeriodo>
      <ErroCaixa erro={erro} />

      {t && (
        <div className="grade-stats">
          <StatTile rotulo="Comissões no período" valor={moeda(t.valor)} detalhe={`${numero(t.lancamentos)} lançamento(s) · ${numero(t.entregas)} entregas`} />
          <StatTile rotulo="Para entregadores" valor={moeda(t.entregadores)} detalhe={t.automaticas > 0 ? `${moeda(t.automaticas)} automáticas` : undefined} />
          <StatTile rotulo="Para funcionários" valor={moeda(t.funcionarios)} />
          <StatTile rotulo="A pagar" valor={moeda(t.aPagar)} tom={t.aPagar > 0 ? "aviso" : undefined} />
        </div>
      )}

      <TabelaRelatorio
        linhas={dados?.itens}
        carregando={carregando}
        vazio="Nenhuma comissão lançada no período"
        chaveLinha={l => l.id}
        nomeCsv={`comissoes_lancadas_${periodo.desde}_${periodo.ate}`}
        colunas={[
          { chave: "numero", rotulo: "Nº", num: true },
          { chave: "referencia", rotulo: "Data", valor: l => data(l.referencia), ordenar: l => new Date(l.referencia).getTime(), csv: l => data(l.referencia) },
          { chave: "beneficiarioNome", rotulo: "Quem recebe", valor: l => <><strong>{l.beneficiarioNome}</strong><div className="celula-sub">{TIPO_BENEFICIARIO[l.beneficiarioTipo]}{l.origem === "AUTOMATICA" && <> · automática{l.pedido && ` (${l.pedido.codigo})`}</>}</div></> },
          { chave: "comercioNome", rotulo: "Comércio" },
          { chave: "quantidadeEntregas", rotulo: "Entregas", num: true, valor: l => numero(l.quantidadeEntregas) },
          { chave: "valorPorEntrega", rotulo: "Por entrega", num: true, valor: l => (l.valorPorEntrega != null ? moeda(l.valorPorEntrega) : "—") },
          { chave: "valor", rotulo: "Valor", num: true, valor: l => <strong>{moeda(l.valor)}</strong> },
          { chave: "situacao", rotulo: "Pagamento", ordenar: l => (paga(l) ? 1 : 0), csv: l => (paga(l) ? "Paga" : "A pagar"), valor: situacaoComissao },
          { chave: "app", rotulo: "No app", ordenar: l => (l.vistoEm ? 1 : 0), csv: l => (l.beneficiarioTipo !== "ENTREGADOR" ? "" : l.vistoEm ? "Visto" : "Não visto"),
            valor: l => (l.beneficiarioTipo !== "ENTREGADOR" ? <span className="apagado">—</span> : l.vistoEm ? <span title={dataHora(l.vistoEm)}>👁 Visto</span> : <span className="apagado">Aguardando</span>) },
          { chave: "autorNome", rotulo: "Lançado por", valor: l => <span className="apagado">{l.autorNome || "—"}</span> },
          { chave: "acoes", rotulo: "", csv: () => "", valor: l => (
            <span className="acoes-celula">
              {podePagar && l.contaPagar && !l.contaPagar.paga && <Botao pequeno onClick={() => setPagando(l)}>Pagar</Botao>}
              {l.contaPagar?.paga && <Botao pequeno onClick={() => recibo(l)}>Recibo</Botao>}
              {podeLancar && !paga(l) && !l.acerto && (
                <BotaoConfirmar pequeno confirmar="Excluir?" onConfirm={async () => { if (await executar(() => api.del(`/financeiro/comissoes-manuais/${l.id}`), "Comissão excluída.")) atualizar(); }}>Excluir</BotaoConfirmar>
              )}
            </span>
          ) },
        ]}
      />

      {lancando && <FormComissao onFechar={() => setLancando(false)} onSalvo={() => { setLancando(false); atualizar(); }} />}
      {pagando && (
        <ModalPagamento
          titulo={`Pagar comissão nº ${pagando.numero} · ${pagando.beneficiarioNome}`}
          valor={pagando.valor}
          onFechar={() => setPagando(null)}
          onConfirmar={async ({ formaPagamento, data: pagaEm }) => {
            const r = await executar(() => api.patch(`/financeiro/contas-pagar/${pagando.contaPagar.id}/pagar`, { formaPagamento, pagaEm }), "Pagamento registrado.");
            if (r) { setPagando(null); atualizar(); }
          }}
        />
      )}
    </>
  );
}

function ComissaoPorEntregas() {
  const [periodo, setPeriodo] = usePeriodo(30);
  const [entregadorId, setEntregadorId] = useState("");
  const { dados: entregadores } = useApi("/entregadores");
  const { dados, erro, carregando } = useApi(`/financeiro/ganhos${qs({ ...periodo, entregadorId })}`);
  const t = dados?.totais;

  return (
    <>
      <FiltroPeriodo valor={periodo} onChange={setPeriodo}>
        <select value={entregadorId} onChange={e => setEntregadorId(e.target.value)} aria-label="Entregador">
          <option value="">Todos os entregadores</option>
          {(entregadores || []).map(e => <option key={e.id} value={e.id}>{e.nomeCompleto}</option>)}
        </select>
      </FiltroPeriodo>
      <ErroCaixa erro={erro} />

      <div className="aviso-caixa">
        <strong>Como a comissão é calculada, por entrega:</strong> se o comércio tem uma <Link to="/cadastros/tabela-comissoes" className="link">tabela de comissão</Link> vinculada
        (Cadastros › Comércio), o entregador recebe o valor da <strong>faixa de km</strong> da entrega (ou o percentual do valor, conforme a tabela),
        respeitando o mínimo da tabela; senão, recebe o
        <strong> repasse fixo por entrega</strong> do cadastro dele. Entregas já acertadas mantêm o valor do acerto.
      </div>

      {t && (
        <div className="grade-stats">
          <StatTile rotulo="Comissão no período" valor={moeda(t.comissao)} detalhe={`${numero(t.entregas)} entregas concluídas`} />
          <StatTile rotulo="Pendente de acerto" valor={moeda(t.comissaoPendente)} tom={t.comissaoPendente > 0 ? "aviso" : undefined} />
          <StatTile rotulo="Já acertado" valor={moeda(t.comissaoAcertada)} />
          <StatTile rotulo="Entregas sem regra" valor={numero(t.semRegra)} tom={t.semRegra ? "critico" : undefined} detalhe={t.semRegra ? "Ganho R$ 0 — ajuste o cadastro" : "Todas com regra"} />
        </div>
      )}

      {!entregadorId ? (
        <TabelaRelatorio
          linhas={dados?.linhas}
          carregando={carregando}
          vazio="Nenhuma entrega concluída no período"
          chaveLinha={l => l.entregadorId}
          onLinha={l => setEntregadorId(l.entregadorId)}
          nomeCsv={`comissao_${periodo.desde}_${periodo.ate}`}
          colunas={[
            { chave: "nome", rotulo: "Entregador", valor: l => <><strong>{l.nome}</strong><div className="celula-sub">{VEICULOS[l.veiculoTipo]} · {TIPO_ENTREGA[l.tipoEntrega]}</div></> },
            { chave: "entregas", rotulo: "Entregas", num: true, valor: l => numero(l.entregas) },
            { chave: "valorEntregas", rotulo: "Valor das entregas", num: true, valor: l => moeda(l.valorEntregas) },
            { chave: "comissao", rotulo: "Comissão", num: true, valor: l => <strong>{moeda(l.comissao)}</strong> },
            { chave: "percentual", rotulo: "% do valor", num: true, valor: l => (l.valorEntregas ? porcento((l.comissao / l.valorEntregas) * 100) : "—"), ordenar: l => (l.valorEntregas ? l.comissao / l.valorEntregas : null) },
            { chave: "comissaoPendente", rotulo: "Pendente de acerto", num: true, valor: l => moeda(l.comissaoPendente) },
            { chave: "semRegra", rotulo: "Sem regra", num: true, valor: l => (l.semRegra ? <Badge tom="critico">⚠ {l.semRegra}</Badge> : "—") },
          ]}
        />
      ) : (
        <TabelaRelatorio
          linhas={dados?.detalhe}
          carregando={carregando}
          vazio="Este entregador não concluiu entregas no período"
          chaveLinha={l => l.pedidoId}
          nomeCsv={`comissao_detalhe_${periodo.desde}_${periodo.ate}`}
          colunas={[
            { chave: "codigo", rotulo: "Pedido", valor: l => <strong>{l.codigo}</strong> },
            { chave: "entregueEm", rotulo: "Entregue", valor: l => dataHora(l.entregueEm), ordenar: l => new Date(l.entregueEm).getTime(), csv: l => new Date(l.entregueEm).toLocaleString("pt-BR") },
            { chave: "comercio", rotulo: "Comércio" },
            { chave: "valor", rotulo: "Valor da entrega", num: true, valor: l => moeda(l.valor) },
            { chave: "regra", rotulo: "Regra aplicada", valor: l => <Badge tom={TOM_REGRA[l.tipoRegra]}>{l.regra}</Badge>, csv: l => l.regra },
            { chave: "comissao", rotulo: "Comissão", num: true, valor: l => <strong>{moeda(l.comissao)}</strong> },
            { chave: "acerto", rotulo: "Acerto", valor: l => (l.acerto ? `Nº ${l.acerto.numero}${l.acerto.pago ? " (pago)" : ""}` : <span className="apagado">Pendente</span>), ordenar: l => l.acerto?.numero ?? null, csv: l => (l.acerto ? `Nº ${l.acerto.numero}` : "Pendente") },
          ]}
        />
      )}
      {entregadorId && <button type="button" className="link" onClick={() => setEntregadorId("")}>← Ver todos os entregadores</button>}
    </>
  );
}

export default function Comissao() {
  const [aba, setAba] = useState("lancadas");
  return (
    <>
      <Cabecalho titulo="Comissão" subtitulo="Comissões lançadas para entregadores e funcionários, e a comissão calculada pelas entregas" />
      <div style={{ marginBottom: 10 }}>
        <Abas ativa={aba} onChange={setAba} abas={[{ valor: "lancadas", rotulo: "Comissões lançadas" }, { valor: "entregas", rotulo: "Calculada por entregas" }]} />
      </div>
      {aba === "lancadas" ? <ComissoesLancadas /> : <ComissaoPorEntregas />}
    </>
  );
}
