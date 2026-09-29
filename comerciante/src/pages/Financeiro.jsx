import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { Badge, Cabecalho, Carregando, ErroCaixa, Gaveta, StatTile, Vazio } from "../components/ui";
import { data, dataHora, km, moeda, numero } from "../utils/format";

function situacao(f) {
  if (f.paga) return <Badge tom="ok">Paga</Badge>;
  const venc = new Date(f.vencimento);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  // Vencimento é gravado à meia-noite UTC; compara pelo dia.
  const diaVenc = new Date(venc.getUTCFullYear(), venc.getUTCMonth(), venc.getUTCDate());
  return diaVenc < hoje ? <Badge tom="critico">Vencida</Badge> : <Badge tom="aviso">Em aberto</Badge>;
}

function DetalheFatura({ id, onFechar }) {
  const { dados: f, erro } = useApi(`/faturas/${id}`, { aoVivo: ["faturas"] });
  return (
    <Gaveta titulo={f ? `Fatura nº ${f.numero}` : "Fatura"} subtitulo={f && situacao(f)} onFechar={onFechar}>
      <ErroCaixa erro={erro} />
      {!f ? <Carregando /> : (
        <>
          <dl className="detalhes">
            <dt>Descrição</dt><dd>{f.descricao}</dd>
            <dt>Valor</dt><dd><strong>{moeda(f.valor)}</strong></dd>
            <dt>Vencimento</dt><dd>{data(f.vencimento)}</dd>
            {f.periodoInicio && <><dt>Período</dt><dd>{data(f.periodoInicio)} a {data(f.periodoFim)}</dd></>}
            {f.paga && <><dt>Paga em</dt><dd>{data(f.pagaEm)}{f.formaPagamento && ` · ${f.formaPagamento}`}</dd></>}
            {f.observacao && <><dt>Observação</dt><dd>{f.observacao}</dd></>}
          </dl>
          <section className="bloco">
            <h3>Entregas cobradas ({f.pedidos.length})</h3>
            {f.pedidos.length === 0 ? <p className="apagado">Esta fatura não tem entregas vinculadas.</p> : (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead><tr><th>Pedido</th><th>Cliente</th><th className="num">Distância</th><th className="num">Valor</th></tr></thead>
                  <tbody>
                    {f.pedidos.map(p => (
                      <tr key={p.id}>
                        <td>{p.codigo}<div className="celula-sub">{dataHora(p.entregueEm || p.createdAt)}</div></td>
                        <td>{p.clienteNome}</td>
                        <td className="num">{km(p.distanciaKm)}</td>
                        <td className="num">{moeda(p.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </Gaveta>
  );
}

export default function Financeiro() {
  const faturas = useApi("/faturas", { aoVivo: ["faturas"] });
  const resumo = useApi("/resumo", { aoVivo: ["pedidos", "faturas"] });
  const [aberta, setAberta] = useState(null);
  const lista = faturas.dados || [];

  return (
    <>
      <Cabecalho titulo="Financeiro" subtitulo="Suas faturas com a Route Delivery e o total de entregas do mês." />
      <ErroCaixa erro={faturas.erro} onTentar={() => faturas.recarregar()} />

      <div className="grade-stats">
        <StatTile rotulo="Em aberto" valor={moeda(resumo.dados?.valorFaturasAbertas ?? 0)} detalhe={`${resumo.dados?.faturasAbertas ?? 0} fatura(s)`} tom={resumo.dados?.faturasAbertas ? "aviso" : undefined} />
        <StatTile rotulo="Entregas no mês" valor={numero(resumo.dados?.entreguesNoMes ?? 0)} />
        <StatTile rotulo="Valor das entregas no mês" valor={moeda(resumo.dados?.valorNoMes ?? 0)} detalhe="Será cobrado na próxima fatura" />
      </div>

      <div className="cartao cartao-tabela">
        {faturas.carregando && !faturas.dados ? <Carregando /> : lista.length === 0 ? (
          <Vazio titulo="Nenhuma fatura ainda">Quando a equipe fechar o faturamento das suas entregas, a fatura aparece aqui.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr><th>Nº</th><th>Descrição</th><th>Vencimento</th><th>Entregas</th><th>Situação</th><th className="num">Valor</th></tr>
              </thead>
              <tbody>
                {lista.map(f => (
                  <tr key={f.id} className="linha-clicavel" onClick={() => setAberta(f.id)}>
                    <td>{f.numero}</td>
                    <td>{f.descricao}{f.periodoInicio && <div className="celula-sub">{data(f.periodoInicio)} a {data(f.periodoFim)}</div>}</td>
                    <td>{data(f.vencimento)}</td>
                    <td>{f._count?.pedidos ?? "—"}</td>
                    <td>{situacao(f)}</td>
                    <td className="num"><strong>{moeda(f.valor)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aberta && <DetalheFatura id={aberta} onFechar={() => setAberta(null)} />}
    </>
  );
}
