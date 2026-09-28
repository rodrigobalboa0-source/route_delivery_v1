// Financeiro › Contas a Pagar
import { useState } from "react";
import { api, qs } from "../../api";
import { useAuth } from "../../auth";
import { useApi } from "../../hooks/useApi";
import { Abas, Badge, Botao, BotaoConfirmar, Cabecalho, Campo, ErroCaixa, Modal, StatTile, useAcao } from "../../components/ui";
import { TabelaRelatorio } from "../../components/relatorios";
import { data, moeda, numero, paraInputData } from "../../utils/format";
import { ModalPagamento, abrirImpressao } from "./Acerto";

export const CATEGORIAS_PAGAR = {
  ENTREGADOR: "Entregadores", COMISSAO: "Comissões", FORNECEDOR: "Fornecedor", IMPOSTO: "Impostos", SALARIO: "Salários",
  ALUGUEL: "Aluguel", SERVICO: "Serviços", OUTROS: "Outros",
};

export function situacaoConta(c, rotuloQuitada = "Paga") {
  if (c.paga) return <Badge tom="ok">✓ {rotuloQuitada} {data(c.pagaEm)}</Badge>;
  if (new Date(c.vencimento) < new Date(new Date().toDateString())) return <Badge tom="critico">⚠ Atrasada</Badge>;
  return <Badge tom="aviso">A vencer</Badge>;
}

function FormConta({ conta, onFechar, onSalvo }) {
  const deAcerto = !!(conta?.acertoId || conta?.comissaoManualId);
  const [v, setV] = useState({
    descricao: conta?.descricao || "", favorecido: conta?.favorecido || "", categoria: conta?.categoria || "FORNECEDOR",
    vencimento: conta ? paraInputData(conta.vencimento) : paraInputData(new Date()), valor: conta?.valor ?? "", observacao: conta?.observacao || "",
  });
  const { executar, ocupado } = useAcao();
  const set = k => e => setV({ ...v, [k]: e.target.value });

  async function salvar(e) {
    e.preventDefault();
    const r = await executar(() => (conta ? api.put(`/financeiro/contas-pagar/${conta.id}`, v) : api.post("/financeiro/contas-pagar", v)), "Conta salva.");
    if (r) onSalvo();
  }

  return (
    <Modal titulo={conta ? `Editar conta nº ${conta.numero}` : "Nova conta a pagar"} onFechar={onFechar}>
      <form onSubmit={salvar} className="grade-campos">
        {deAcerto && <div className="aviso-caixa campo-largo">Conta gerada por {conta.acertoId ? "acerto de entregador" : "comissão lançada"}: só o vencimento e a observação podem mudar.</div>}
        <Campo rotulo="Descrição *" largo><input value={v.descricao} onChange={set("descricao")} required disabled={deAcerto} /></Campo>
        <Campo rotulo="Favorecido"><input value={v.favorecido} onChange={set("favorecido")} disabled={deAcerto} /></Campo>
        <Campo rotulo="Categoria">
          <select value={v.categoria} onChange={set("categoria")} disabled={deAcerto}>
            {Object.entries(CATEGORIAS_PAGAR).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Vencimento *"><input type="date" value={v.vencimento} onChange={set("vencimento")} required /></Campo>
        <Campo rotulo="Valor (R$) *"><input type="number" step="0.01" min="0.01" value={v.valor} onChange={set("valor")} required disabled={deAcerto} /></Campo>
        <Campo rotulo="Observação" largo><input value={v.observacao} onChange={set("observacao")} /></Campo>
        <div className="form-rodape campo-largo">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ContasPagar() {
  const { podeEditar } = useAuth();
  const pode = podeEditar("financeiro");
  const [situacao, setSituacao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [editando, setEditando] = useState(null);
  const [pagando, setPagando] = useState(null);
  const { dados, erro, carregando, recarregar } = useApi(`/financeiro/contas-pagar${qs({ situacao, categoria })}`);
  const { executar } = useAcao();
  const r = dados?.resumo;

  async function recibo(c) {
    const rec = await executar(() => api.post(`/financeiro/contas-pagar/${c.id}/recibo`));
    if (rec) abrirImpressao(`/imprimir/recibo/${rec.id}`);
  }

  return (
    <>
      <Cabecalho titulo="Contas a Pagar" subtitulo="Despesas da operação — acertos de entregadores e comissões lançadas entram aqui automaticamente">
        {pode && <Botao variante="primario" onClick={() => setEditando("nova")}>+ Nova conta</Botao>}
      </Cabecalho>
      <ErroCaixa erro={erro} />
      {r && (
        <div className="grade-stats">
          <StatTile rotulo="A vencer" valor={moeda(r.aVencer)} detalhe={`${numero(r.qtdAVencer)} conta(s)`} />
          <StatTile rotulo="Atrasado" valor={moeda(r.atrasado)} detalhe={`${numero(r.qtdAtrasadas)} conta(s)`} tom={r.qtdAtrasadas ? "critico" : undefined} />
          <StatTile rotulo="Pago no mês" valor={moeda(r.pagoNoMes)} />
        </div>
      )}
      <div className="linha-acao" style={{ marginBottom: 8 }}>
        <Abas ativa={situacao} onChange={setSituacao} abas={[
          { valor: "", rotulo: "Todas" }, { valor: "aberta", rotulo: "A vencer" }, { valor: "atrasada", rotulo: "Atrasadas" }, { valor: "paga", rotulo: "Pagas" },
        ]} />
        <select value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoria" style={{ flex: "0 0 auto", minWidth: 0 }}>
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORIAS_PAGAR).map(([k, r2]) => <option key={k} value={k}>{r2}</option>)}
        </select>
      </div>
      <TabelaRelatorio
        linhas={dados?.contas}
        carregando={carregando}
        vazio="Nenhuma conta"
        chaveLinha={l => l.id}
        nomeCsv="contas_a_pagar"
        colunas={[
          { chave: "numero", rotulo: "Nº", num: true },
          { chave: "descricao", rotulo: "Descrição", valor: l => <>{l.descricao}{l.observacao && <div className="celula-sub">{l.observacao}</div>}</> },
          { chave: "favorecido", rotulo: "Favorecido", valor: l => l.favorecido || "—" },
          { chave: "categoria", rotulo: "Categoria", valor: l => CATEGORIAS_PAGAR[l.categoria], csv: l => CATEGORIAS_PAGAR[l.categoria] },
          { chave: "vencimento", rotulo: "Vencimento", valor: l => data(l.vencimento), ordenar: l => new Date(l.vencimento).getTime(), csv: l => data(l.vencimento) },
          { chave: "valor", rotulo: "Valor", num: true, valor: l => <strong>{moeda(l.valor)}</strong> },
          { chave: "situacao", rotulo: "Situação", valor: l => situacaoConta(l), ordenar: l => (l.paga ? 2 : new Date(l.vencimento) < new Date() ? 0 : 1), csv: l => (l.paga ? "Paga" : "Em aberto") },
          { chave: "acoes", rotulo: "", csv: () => "", valor: l => (
            <span className="acoes-celula">
              {pode && !l.paga && <Botao pequeno onClick={() => setPagando(l)}>Pagar</Botao>}
              {l.paga && <Botao pequeno onClick={() => recibo(l)}>Recibo</Botao>}
              {pode && <Botao pequeno variante="fantasma" onClick={() => setEditando(l)}>Editar</Botao>}
              {pode && l.paga && <Botao pequeno variante="fantasma" onClick={async () => { if (await executar(() => api.patch(`/financeiro/contas-pagar/${l.id}/reabrir`), "Conta reaberta.")) recarregar({ silencioso: true }); }}>Reabrir</Botao>}
              {pode && !l.paga && !l.acertoId && !l.comissaoManualId && (
                <BotaoConfirmar pequeno confirmar="Excluir?" onConfirm={async () => { if (await executar(() => api.del(`/financeiro/contas-pagar/${l.id}`), "Conta excluída.")) recarregar({ silencioso: true }); }}>Excluir</BotaoConfirmar>
              )}
            </span>
          ) },
        ]}
      />
      {editando && <FormConta conta={editando === "nova" ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); recarregar({ silencioso: true }); }} />}
      {pagando && (
        <ModalPagamento
          titulo={`Pagar conta nº ${pagando.numero} · ${pagando.descricao}`}
          valor={pagando.valor}
          onFechar={() => setPagando(null)}
          onConfirmar={async ({ formaPagamento, data: pagaEm }) => {
            if (await executar(() => api.patch(`/financeiro/contas-pagar/${pagando.id}/pagar`, { formaPagamento, pagaEm }), "Pagamento registrado.")) { setPagando(null); recarregar({ silencioso: true }); }
          }}
        />
      )}
    </>
  );
}
