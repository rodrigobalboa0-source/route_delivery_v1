// Documentos para imprimir / salvar em PDF (abrem numa aba própria, sem o menu).
import { useParams } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import { Carregando, ErroCaixa } from "../../components/ui";
import { data, dataHora, km, moeda } from "../../utils/format";
import { mascaraCep, mascaraDocumento, soDigitos } from "../../utils/documento";
import { valorPorExtenso } from "../../utils/extenso";

const doc = d => (d ? mascaraDocumento(soDigitos(d).length > 11 ? "CNPJ" : "CPF", d) : null);
const numeroDoc = n => String(n).padStart(6, "0");

function BarraImpressao({ titulo }) {
  return (
    <div className="barra-impressao">
      <span>{titulo}</span>
      <button type="button" className="btn btn-primario" onClick={() => window.print()}>Imprimir / Salvar PDF</button>
    </div>
  );
}

function Emitente({ empresa }) {
  return (
    <div className="doc-emitente">
      <strong>{empresa.nome}</strong>
      {empresa.documento && <span>CNPJ/CPF: {doc(empresa.documento)}</span>}
      {empresa.endereco && <span>{empresa.endereco}</span>}
      {(empresa.telefone || empresa.email) && <span>{[empresa.telefone, empresa.email].filter(Boolean).join(" · ")}</span>}
    </div>
  );
}

export function ImprimirRecibo() {
  const { id } = useParams();
  const { dados: r, erro } = useApi(`/financeiro/recibos/${id}`);
  if (erro) return <div className="documento"><ErroCaixa erro={erro} /></div>;
  if (!r) return <Carregando />;
  const e = r.empresa;
  const pagamento = r.tipo === "PAGAMENTO";
  // Pagamento: a pessoa declara que recebeu da empresa. Recebimento: a empresa declara que recebeu da pessoa.
  const quemRecebe = pagamento ? r.pessoaNome : e.nome;
  const quemPaga = pagamento ? e.nome : r.pessoaNome;
  const docQuemRecebe = pagamento ? doc(r.pessoaDocumento) : doc(e.documento);

  return (
    <>
      <BarraImpressao titulo={`Recibo nº ${numeroDoc(r.numero)}`} />
      <div className="documento">
        <header className="doc-topo">
          <Emitente empresa={e} />
          <div className="doc-titulo">
            <h1>RECIBO</h1>
            <span>Nº {numeroDoc(r.numero)}</span>
            <strong className="doc-valor">{moeda(r.valor)}</strong>
          </div>
        </header>
        <p className="doc-texto">
          {pagamento ? "Recebi(emos) de " : "Recebemos de "}
          <strong>{quemPaga}</strong>
          {!pagamento && r.pessoaDocumento && <>, inscrito(a) no CPF/CNPJ {doc(r.pessoaDocumento)}</>}
          {pagamento && e.documento && <>, CNPJ/CPF {doc(e.documento)}</>}
          , a importância de <strong>{moeda(r.valor)}</strong> (<em>{valorPorExtenso(r.valor)}</em>), referente a {r.referente}
          {r.formaPagamento && <>, pago via {r.formaPagamento}</>}.
        </p>
        <p className="doc-texto">Para clareza, firmo(amos) o presente recibo, dando plena quitação do valor acima.</p>
        <p className="doc-local">{data(r.data)}</p>
        <div className="doc-assinatura">
          <span className="linha" />
          <strong>{quemRecebe}</strong>
          {docQuemRecebe && <span>CPF/CNPJ: {docQuemRecebe}</span>}
        </div>
        <footer className="doc-rodape">Emitido em {dataHora(r.createdAt)}{r.autorNome ? ` por ${r.autorNome}` : ""}</footer>
      </div>
    </>
  );
}

export function ImprimirNota() {
  const { faturaId } = useParams();
  const { dados, erro } = useApi(`/financeiro/faturas/${faturaId}/nota`);
  if (erro) return <div className="documento"><ErroCaixa erro={erro} /></div>;
  if (!dados) return <Carregando />;
  const { fatura: f, empresa: e } = dados;
  const c = f.comercio;
  const end = c?.enderecos?.[0];

  return (
    <>
      <BarraImpressao titulo={`Nota de débito nº ${numeroDoc(f.numero)}`} />
      <div className="documento">
        <header className="doc-topo">
          <Emitente empresa={e} />
          <div className="doc-titulo">
            <h1>NOTA DE DÉBITO</h1>
            <span>Nº {numeroDoc(f.numero)} · emitida em {data(f.createdAt)}</span>
            <strong className="doc-valor">{moeda(f.valor)}</strong>
          </div>
        </header>

        <section className="doc-bloco">
          <h2>Cliente</h2>
          {c ? (
            <>
              <strong>{c.razaoSocial || c.nomeFantasia}</strong>
              {c.razaoSocial && c.nomeFantasia && <span> ({c.nomeFantasia})</span>}
              {c.documento && <div>{c.tipoDocumento}: {doc(c.documento)}</div>}
              {end && <div>{end.rua}{end.numero ? `, ${end.numero}` : ""}{end.bairro ? ` — ${end.bairro}` : ""}{end.cidade ? ` — ${end.cidade}` : ""}{end.cep ? ` — CEP ${mascaraCep(end.cep)}` : ""}</div>}
            </>
          ) : <span>Cobrança avulsa</span>}
        </section>

        <section className="doc-bloco doc-colunas">
          <div><h2>Descrição</h2>{f.descricao}</div>
          <div><h2>Vencimento</h2>{data(f.vencimento)}</div>
          {f.periodoInicio && <div><h2>Período</h2>{data(f.periodoInicio)} a {data(f.periodoFim)}</div>}
          <div><h2>Situação</h2>{f.paga ? `Paga em ${data(f.pagaEm)}` : "Em aberto"}</div>
        </section>

        {f.pedidos.length > 0 && (
          <section className="doc-bloco">
            <h2>Demonstrativo das entregas ({f.pedidos.length})</h2>
            <table className="doc-tabela">
              <thead><tr><th>Pedido</th><th>Data</th><th>Cliente / destino</th><th className="num">Distância</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {f.pedidos.map(p => (
                  <tr key={p.codigo}>
                    <td>{p.codigo}</td>
                    <td>{dataHora(p.entregueEm)}</td>
                    <td>{p.clienteNome}<div className="doc-sub">{p.endereco}</div></td>
                    <td className="num">{km(p.distanciaKm)}</td>
                    <td className="num">{moeda(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={4}>Total</td><td className="num">{moeda(f.valor)}</td></tr></tfoot>
            </table>
          </section>
        )}
        {f.observacao && <p className="doc-texto">Observação: {f.observacao}</p>}
        <footer className="doc-rodape">Documento sem valor fiscal — não substitui a nota fiscal de serviço (NFS-e).</footer>
      </div>
    </>
  );
}
