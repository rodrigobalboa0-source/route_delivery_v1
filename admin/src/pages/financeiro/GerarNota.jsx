// Financeiro › Gerar Nota — nota de débito / demonstrativo das entregas de uma fatura (não é NFS-e).
import { useState } from "react";
import { Link } from "react-router-dom";
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { Botao, Cabecalho, ErroCaixa } from "../../components/ui";
import { TabelaRelatorio } from "../../components/relatorios";
import { data, moeda, numero } from "../../utils/format";
import { abrirImpressao } from "./Acerto";
import { situacaoConta } from "./ContasPagar";

export function AvisoEmpresa() {
  const { dados } = useApi("/financeiro/empresa");
  if (!dados || dados.configurada) return null;
  return (
    <div className="aviso-caixa">
      Os documentos saem com o nome “Route Delivery” porque os dados da sua empresa ainda não foram preenchidos.
      <Link to="/configuracoes" className="link"> Preencher em Configurações › Dados da empresa</Link>
    </div>
  );
}

export default function GerarNota() {
  const [comercioId, setComercioId] = useState("");
  const { dados: comercios } = useApi("/comercios");
  const { dados, erro, carregando } = useApi(`/financeiro/faturas${qs({ comercioId })}`);

  return (
    <>
      <Cabecalho titulo="Gerar Nota" subtitulo="Nota de débito com o demonstrativo das entregas de cada fatura, pronta para imprimir ou salvar em PDF" />
      <div className="aviso-caixa">
        <strong>Não é nota fiscal (NFS-e).</strong> Este documento serve para cobrança e conferência. A emissão de NFS-e exige
        certificado digital e integração com a prefeitura ou um emissor (ex.: Focus NFe, eNotas, NFE.io).
      </div>
      <AvisoEmpresa />
      <div className="filtros">
        <select value={comercioId} onChange={e => setComercioId(e.target.value)} aria-label="Comércio">
          <option value="">Todos os comércios</option>
          {(comercios || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
        </select>
      </div>
      <ErroCaixa erro={erro} />
      <TabelaRelatorio
        linhas={dados}
        carregando={carregando}
        vazio="Nenhuma fatura. Gere faturas em Faturamento ou lance em Contas a Receber."
        chaveLinha={l => l.id}
        colunas={[
          { chave: "numero", rotulo: "Fatura", num: true, valor: l => `Nº ${l.numero}` },
          { chave: "comercio", rotulo: "Comércio", valor: l => l.comercio?.nomeFantasia || "Avulsa", ordenar: l => l.comercio?.nomeFantasia },
          { chave: "descricao", rotulo: "Descrição" },
          { chave: "entregas", rotulo: "Entregas", num: true, valor: l => (l._count?.pedidos ? numero(l._count.pedidos) : "—"), ordenar: l => l._count?.pedidos || 0 },
          { chave: "vencimento", rotulo: "Vencimento", valor: l => data(l.vencimento), ordenar: l => new Date(l.vencimento).getTime() },
          { chave: "valor", rotulo: "Valor", num: true, valor: l => moeda(l.valor) },
          { chave: "situacao", rotulo: "Situação", valor: l => situacaoConta(l, "Recebida"), ordenar: l => (l.paga ? 1 : 0) },
          { chave: "acao", rotulo: "", valor: l => <Botao pequeno variante="primario" onClick={() => abrirImpressao(`/imprimir/nota/${l.id}`)}>Gerar nota</Botao> },
        ]}
      />
    </>
  );
}
