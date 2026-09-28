// Financeiro › Contas a Receber — faturas dos comerciantes (geradas no Faturamento ou avulsas).
import { useState } from "react";
import { api, qs } from "../../api";
import { useAuth } from "../../auth";
import { useApi } from "../../hooks/useApi";
import { Abas, Botao, BotaoConfirmar, Cabecalho, Campo, ErroCaixa, Modal, StatTile, useAcao } from "../../components/ui";
import { TabelaRelatorio } from "../../components/relatorios";
import { data, moeda, numero, paraInputData } from "../../utils/format";
import { ModalPagamento, abrirImpressao } from "./Acerto";
import { situacaoConta } from "./ContasPagar";

function FormFatura({ fatura, onFechar, onSalvo }) {
  const { dados: comercios } = useApi("/comercios");
  const [v, setV] = useState({
    comercioId: fatura?.comercioId || "", descricao: fatura?.descricao || "",
    vencimento: fatura ? paraInputData(fatura.vencimento) : paraInputData(new Date()), valor: fatura?.valor ?? "", observacao: fatura?.observacao || "",
  });
  const { executar, ocupado } = useAcao();
  const set = k => e => setV({ ...v, [k]: e.target.value });
  const doFaturamento = fatura?._count?.pedidos > 0;

  async function salvar(e) {
    e.preventDefault();
    const corpo = { ...v, comercioId: v.comercioId || null, valor: Number(v.valor) };
    const r = await executar(() => (fatura ? api.put(`/financeiro/faturas/${fatura.id}`, corpo) : api.post("/financeiro/faturas", corpo)), "Conta a receber salva.");
    if (r) onSalvo();
  }

  return (
    <Modal titulo={fatura ? `Editar fatura nº ${fatura.numero}` : "Nova conta a receber"} onFechar={onFechar}>
      <form onSubmit={salvar} className="grade-campos">
        {doFaturamento && <div className="aviso-caixa campo-largo">Fatura gerada no Faturamento com {fatura._count.pedidos} entrega(s). Mudar o valor aqui não altera as entregas vinculadas.</div>}
        <Campo rotulo="Comércio" largo>
          <select value={v.comercioId} onChange={set("comercioId")}>
            <option value="">Sem comércio (avulsa)</option>
            {(comercios || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Descrição *" largo><input value={v.descricao} onChange={set("descricao")} required /></Campo>
        <Campo rotulo="Vencimento *"><input type="date" value={v.vencimento} onChange={set("vencimento")} required /></Campo>
        <Campo rotulo="Valor (R$) *"><input type="number" step="0.01" min="0.01" value={v.valor} onChange={set("valor")} required /></Campo>
        <Campo rotulo="Observação" largo><input value={v.observacao} onChange={set("observacao")} /></Campo>
        <div className="form-rodape campo-largo">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ContasReceber() {
  const { podeEditar } = useAuth();
  const pode = podeEditar("financeiro");
  const [situacao, setSituacao] = useState("");
  const [editando, setEditando] = useState(null);
  const [recebendo, setRecebendo] = useState(null);
  const lista = useApi(`/financeiro/faturas${qs({ situacao })}`);
  const resumo = useApi("/financeiro/resumo");
  const { executar } = useAcao();
  const r = resumo.dados;

  function atualizar() {
    lista.recarregar({ silencioso: true });
    resumo.recarregar({ silencioso: true });
  }

  async function recibo(f) {
    const rec = await executar(() => api.post(`/financeiro/faturas/${f.id}/recibo`));
    if (rec) abrirImpressao(`/imprimir/recibo/${rec.id}`);
  }

  return (
    <>
      <Cabecalho titulo="Contas a Receber" subtitulo="Faturas dos comerciantes — geradas no Faturamento ou lançadas à mão">
        {pode && <Botao variante="primario" onClick={() => setEditando("nova")}>+ Nova conta a receber</Botao>}
      </Cabecalho>
      <ErroCaixa erro={lista.erro} />
      {r && (
        <div className="grade-stats">
          <StatTile rotulo="A receber (no prazo)" valor={moeda(r.aReceber)} />
          <StatTile rotulo="Em atraso" valor={moeda(r.valorEmAtraso)} detalhe={`${numero(r.faturasEmAtraso)} fatura(s) vencida(s)`} tom={r.faturasEmAtraso ? "critico" : undefined} />
          <StatTile rotulo="Receita de entregas no mês" valor={moeda(r.receitaDoMes)} detalhe={`${numero(r.entregasDoMes)} entregas`} />
        </div>
      )}
      <Abas ativa={situacao} onChange={setSituacao} abas={[
        { valor: "", rotulo: "Todas" }, { valor: "aberta", rotulo: "A vencer" }, { valor: "atrasada", rotulo: "Atrasadas" }, { valor: "paga", rotulo: "Recebidas" },
      ]} />
      <TabelaRelatorio
        linhas={lista.dados}
        carregando={lista.carregando}
        vazio="Nenhuma conta a receber"
        chaveLinha={l => l.id}
        nomeCsv="contas_a_receber"
        colunas={[
          { chave: "numero", rotulo: "Nº", num: true },
          { chave: "comercio", rotulo: "Comércio", valor: l => l.comercio?.nomeFantasia || <span className="apagado">Avulsa</span>, ordenar: l => l.comercio?.nomeFantasia, csv: l => l.comercio?.nomeFantasia || "Avulsa" },
          { chave: "descricao", rotulo: "Descrição" },
          { chave: "entregas", rotulo: "Entregas", num: true, valor: l => (l._count?.pedidos ? numero(l._count.pedidos) : "—"), ordenar: l => l._count?.pedidos || 0 },
          { chave: "vencimento", rotulo: "Vencimento", valor: l => data(l.vencimento), ordenar: l => new Date(l.vencimento).getTime(), csv: l => data(l.vencimento) },
          { chave: "valor", rotulo: "Valor", num: true, valor: l => <strong>{moeda(l.valor)}</strong> },
          { chave: "situacao", rotulo: "Situação", valor: l => situacaoConta(l, "Recebida"), ordenar: l => (l.paga ? 2 : new Date(l.vencimento) < new Date() ? 0 : 1), csv: l => (l.paga ? "Recebida" : "Em aberto") },
          { chave: "acoes", rotulo: "", csv: () => "", valor: l => (
            <span className="acoes-celula">
              {pode && !l.paga && <Botao pequeno onClick={() => setRecebendo(l)}>Receber</Botao>}
              {l.paga && <Botao pequeno onClick={() => recibo(l)}>Recibo</Botao>}
              <Botao pequeno variante="fantasma" onClick={() => abrirImpressao(`/imprimir/nota/${l.id}`)}>Nota</Botao>
              {pode && <Botao pequeno variante="fantasma" onClick={() => setEditando(l)}>Editar</Botao>}
              {pode && l.paga && <Botao pequeno variante="fantasma" onClick={async () => { if (await executar(() => api.patch(`/financeiro/faturas/${l.id}/reabrir`), "Fatura reaberta.")) atualizar(); }}>Reabrir</Botao>}
              {pode && !l.paga && (
                <BotaoConfirmar pequeno confirmar={l._count?.pedidos ? "Excluir? As entregas voltam a ficar a faturar." : "Excluir?"} onConfirm={async () => {
                  if (await executar(() => api.del(`/financeiro/faturas/${l.id}`), "Fatura excluída.")) atualizar();
                }}>Excluir</BotaoConfirmar>
              )}
            </span>
          ) },
        ]}
      />
      {editando && <FormFatura fatura={editando === "nova" ? null : editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); atualizar(); }} />}
      {recebendo && (
        <ModalPagamento
          titulo={`Receber fatura nº ${recebendo.numero}${recebendo.comercio ? ` · ${recebendo.comercio.nomeFantasia}` : ""}`}
          valor={recebendo.valor}
          rotuloData="Data do recebimento"
          onFechar={() => setRecebendo(null)}
          onConfirmar={async ({ formaPagamento, data: pagaEm }) => {
            if (await executar(() => api.patch(`/financeiro/faturas/${recebendo.id}/pagar`, { formaPagamento, pagaEm }), "Recebimento registrado.")) { setRecebendo(null); atualizar(); }
          }}
        />
      )}
    </>
  );
}
