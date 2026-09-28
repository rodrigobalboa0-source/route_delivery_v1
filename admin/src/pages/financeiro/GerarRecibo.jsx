// Financeiro › Gerar Recibo — recibo avulso e lista de todos os recibos emitidos.
import { useState } from "react";
import { api, qs } from "../../api";
import { useAuth } from "../../auth";
import { useApi } from "../../hooks/useApi";
import { Badge, Botao, Cabecalho, Campo, ErroCaixa, useAcao } from "../../components/ui";
import { FiltroPeriodo, TabelaRelatorio, usePeriodo } from "../../components/relatorios";
import { data, moeda, paraInputData } from "../../utils/format";
import { mascaraDocumento, soDigitos } from "../../utils/documento";
import { valorPorExtenso } from "../../utils/extenso";
import { FORMAS_PAGAMENTO, abrirImpressao } from "./Acerto";
import { AvisoEmpresa } from "./GerarNota";

const ORIGEM = { ACERTO: "Acerto de entregador", FATURA: "Fatura", CONTA_PAGAR: "Conta a pagar", AVULSO: "Avulso" };
const VAZIO = { tipo: "PAGAMENTO", pessoaNome: "", pessoaDocumento: "", valor: "", referente: "", data: paraInputData(new Date()), formaPagamento: "Pix" };

export default function GerarRecibo() {
  const { podeEditar } = useAuth();
  const pode = podeEditar("financeiro");
  const [periodo, setPeriodo] = usePeriodo(90);
  const [v, setV] = useState(VAZIO);
  const lista = useApi(`/financeiro/recibos${qs(periodo)}`);
  const { executar, ocupado } = useAcao();
  const set = k => e => setV({ ...v, [k]: e.target.value });
  const docTipo = soDigitos(v.pessoaDocumento).length > 11 ? "CNPJ" : "CPF";

  async function emitir(e) {
    e.preventDefault();
    const r = await executar(() => api.post("/financeiro/recibos", v), "Recibo emitido.");
    if (r) {
      setV(VAZIO);
      lista.recarregar({ silencioso: true });
      abrirImpressao(`/imprimir/recibo/${r.id}`);
    }
  }

  return (
    <>
      <Cabecalho titulo="Gerar Recibo" subtitulo="Recibos numerados de pagamento e de recebimento, prontos para imprimir ou salvar em PDF" />
      <AvisoEmpresa />
      <p className="apagado">Recibos de acerto de entregador e de faturas também podem ser gerados direto em Acerto de Entregadores, Contas a Pagar e Contas a Receber.</p>

      {pode && (
        <section className="cartao form-pagina">
          <h2>Recibo avulso</h2>
          <form onSubmit={emitir} className="grade-campos" style={{ marginTop: 10 }}>
            <div className="campo campo-largo">
              <span className="campo-rotulo">Tipo</span>
              <div className="radios">
                <label><input type="radio" name="tipo" checked={v.tipo === "PAGAMENTO"} onChange={() => setV({ ...v, tipo: "PAGAMENTO" })} /> Pagamento (a empresa pagou a alguém)</label>
                <label><input type="radio" name="tipo" checked={v.tipo === "RECEBIMENTO"} onChange={() => setV({ ...v, tipo: "RECEBIMENTO" })} /> Recebimento (a empresa recebeu de alguém)</label>
              </div>
            </div>
            <Campo rotulo={v.tipo === "PAGAMENTO" ? "Quem recebeu *" : "Quem pagou *"}><input value={v.pessoaNome} onChange={set("pessoaNome")} required /></Campo>
            <Campo rotulo="CPF ou CNPJ"><input value={v.pessoaDocumento} inputMode="numeric" onChange={e => setV({ ...v, pessoaDocumento: mascaraDocumento(soDigitos(e.target.value).length > 11 ? "CNPJ" : "CPF", e.target.value) })} placeholder={docTipo === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"} /></Campo>
            <Campo rotulo="Valor (R$) *" dica={Number(v.valor) > 0 ? valorPorExtenso(Number(v.valor)) : undefined}>
              <input type="number" step="0.01" min="0.01" value={v.valor} onChange={set("valor")} required />
            </Campo>
            <Campo rotulo="Data *"><input type="date" value={v.data} onChange={set("data")} required /></Campo>
            <Campo rotulo="Referente a *" largo><input value={v.referente} onChange={set("referente")} required placeholder="Ex.: serviço de entregas do dia 20/09" /></Campo>
            <Campo rotulo="Forma de pagamento">
              <select value={v.formaPagamento} onChange={set("formaPagamento")}>{FORMAS_PAGAMENTO.map(f => <option key={f}>{f}</option>)}</select>
            </Campo>
            <div className="form-rodape campo-largo"><button type="submit" className="btn btn-primario" disabled={ocupado}>Emitir e imprimir</button></div>
          </form>
        </section>
      )}

      <h2 className="titulo-secao">Recibos emitidos</h2>
      <FiltroPeriodo valor={periodo} onChange={setPeriodo} />
      <ErroCaixa erro={lista.erro} />
      <TabelaRelatorio
        linhas={lista.dados}
        carregando={lista.carregando}
        vazio="Nenhum recibo no período"
        chaveLinha={l => l.id}
        nomeCsv={`recibos_${periodo.desde}_${periodo.ate}`}
        colunas={[
          { chave: "numero", rotulo: "Nº", num: true },
          { chave: "tipo", rotulo: "Tipo", valor: l => <Badge tom={l.tipo === "PAGAMENTO" ? "aviso" : "ok"}>{l.tipo === "PAGAMENTO" ? "Pagamento" : "Recebimento"}</Badge>, csv: l => (l.tipo === "PAGAMENTO" ? "Pagamento" : "Recebimento") },
          { chave: "pessoaNome", rotulo: "Pessoa" },
          { chave: "referente", rotulo: "Referente a" },
          { chave: "origemTipo", rotulo: "Origem", valor: l => ORIGEM[l.origemTipo] || "—", csv: l => ORIGEM[l.origemTipo] || "" },
          { chave: "data", rotulo: "Data", valor: l => data(l.data), ordenar: l => new Date(l.data).getTime(), csv: l => data(l.data) },
          { chave: "valor", rotulo: "Valor", num: true, valor: l => <strong>{moeda(l.valor)}</strong> },
          { chave: "acao", rotulo: "", csv: () => "", valor: l => <Botao pequeno onClick={() => abrirImpressao(`/imprimir/recibo/${l.id}`)}>Imprimir</Botao> },
        ]}
      />
    </>
  );
}
