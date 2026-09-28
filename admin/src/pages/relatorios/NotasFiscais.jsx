// Relatórios › Notas Fiscais — entregas com e sem nota fiscal da mercadoria.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { Abas, BadgeMapa, Cabecalho, ErroCaixa, StatTile } from "../../components/ui";
import { FiltroPeriodo, TabelaRelatorio, porcento, usePeriodo } from "../../components/relatorios";
import { STATUS_PEDIDO, dataHora, moeda, numero } from "../../utils/format";

// Chave de 44 dígitos em blocos de 4, como na DANFE.
const formatarChave = c => (c ? c.replace(/(\d{4})(?=\d)/g, "$1 ") : "—");

const COLUNAS = [
  { chave: "codigo", rotulo: "Pedido", valor: l => <strong>{l.codigo}</strong> },
  { chave: "createdAt", rotulo: "Data", valor: l => dataHora(l.createdAt), ordenar: l => new Date(l.createdAt).getTime(), csv: l => new Date(l.createdAt).toLocaleString("pt-BR") },
  { chave: "comercio", rotulo: "Comércio", valor: l => l.comercio?.nomeFantasia, ordenar: l => l.comercio?.nomeFantasia },
  { chave: "clienteNome", rotulo: "Cliente" },
  { chave: "status", rotulo: "Status", valor: l => <BadgeMapa mapa={STATUS_PEDIDO} valor={l.status} />, csv: l => STATUS_PEDIDO[l.status]?.rotulo },
  { chave: "notaFiscalNumero", rotulo: "Nº da NF", valor: l => l.notaFiscalNumero || <span className="apagado">—</span> },
  { chave: "notaFiscalChave", rotulo: "Chave de acesso", valor: l => <span className="mono">{formatarChave(l.notaFiscalChave)}</span>, csv: l => (l.notaFiscalChave ? `'${l.notaFiscalChave}` : "") },
  { chave: "notaFiscalValor", rotulo: "Valor da NF", num: true, valor: l => moeda(l.notaFiscalValor) },
];

export default function NotasFiscais() {
  const navegar = useNavigate();
  const [periodo, setPeriodo] = usePeriodo(30);
  const [situacao, setSituacao] = useState("sem");
  const resumo = useApi(`/relatorios/notas-fiscais${qs(periodo)}`);
  const lista = useApi(`/pedidos${qs({ desde: `${periodo.desde}T00:00:00`, ate: `${periodo.ate}T23:59:59`, notaFiscal: situacao, limite: 1000 })}`);
  const t = resumo.dados?.totais;
  const linhas = (lista.dados || []).filter(p => p.status !== "CANCELADO");

  return (
    <>
      <Cabecalho titulo="Notas Fiscais" subtitulo="Notas fiscais das mercadorias entregues (informadas na criação ou edição do pedido). Pedidos cancelados não entram." />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo} />
      <ErroCaixa erro={resumo.erro || lista.erro} />
      {t && (
        <div className="grade-stats">
          <StatTile rotulo="Cobertura de NF" valor={porcento(t.cobertura)} detalhe={`${numero(t.comNota)} de ${numero(t.entregas)} entregas`} tom={t.semNota > 0 ? "aviso" : undefined} />
          <StatTile rotulo="Entregas sem NF" valor={numero(t.semNota)} />
          <StatTile rotulo="Valor total das notas" valor={moeda(t.valorNotas)} />
          <StatTile rotulo="NF sem chave de acesso" valor={numero(t.semChave)} detalhe="Só com o número informado" />
        </div>
      )}

      {resumo.dados?.porComercio?.length > 0 && (
        <TabelaRelatorio
          linhas={resumo.dados.porComercio}
          chaveLinha={l => l.comercioId}
          nomeCsv={`notas_por_comercio_${periodo.desde}_${periodo.ate}`}
          colunas={[
            { chave: "nome", rotulo: "Comércio", valor: l => <strong>{l.nome}</strong> },
            { chave: "comNota", rotulo: "Com NF", num: true, valor: l => numero(l.comNota) },
            { chave: "semNota", rotulo: "Sem NF", num: true, valor: l => numero(l.semNota) },
            { chave: "cobertura", rotulo: "Cobertura", num: true, valor: l => porcento(l.cobertura) },
            { chave: "valorNotas", rotulo: "Valor das notas", num: true, valor: l => moeda(l.valorNotas) },
          ]}
        />
      )}

      <Abas ativa={situacao} onChange={setSituacao} abas={[
        { valor: "sem", rotulo: "Entregas sem NF" },
        { valor: "com", rotulo: "Entregas com NF" },
      ]} />
      <TabelaRelatorio
        colunas={COLUNAS}
        linhas={lista.dados ? linhas : null}
        carregando={lista.carregando}
        vazio={situacao === "sem" ? "Todas as entregas do período têm nota fiscal" : "Nenhuma entrega com nota fiscal no período"}
        chaveLinha={l => l.id}
        onLinha={l => navegar(`/operacao?abrir=${l.id}`)}
        nomeCsv={`notas_fiscais_${situacao}_${periodo.desde}_${periodo.ate}`}
      />
      <p className="apagado">Para informar a nota de um pedido, abra-o (clique na linha) e use “Editar dados”.</p>
    </>
  );
}
