import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { Cabecalho, Carregando, ErroCaixa, StatTile, Vazio } from "../components/ui";
import GraficoColunas from "../components/GraficoColunas";
import { data, km, moeda, numero } from "../utils/format";

const PERIODOS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
];

export default function Relatorios() {
  const [dias, setDias] = useState(30);
  const resumo = useApi(`/relatorios/periodo?dias=${dias}`);
  const volume = useApi(`/relatorios/volume-por-dia?dias=${dias}`);
  const r = resumo.dados;

  return (
    <>
      <Cabecalho titulo="Relatórios de Entregas"subtitulo={r ? `Desempenho de ${data(r.desde)} até hoje` : "Desempenho da operação por período"}>
        <div className="segmentado" role="group" aria-label="Período">
          {PERIODOS.map(p => (
            <button key={p.dias} type="button" className={dias === p.dias ? "ativo" : ""} aria-pressed={dias === p.dias} onClick={() => setDias(p.dias)}>
              {p.rotulo}
            </button>
          ))}
        </div>
      </Cabecalho>

      <ErroCaixa erro={resumo.erro} onTentar={() => resumo.recarregar()} />

      {!r ? <Carregando /> : (
        <div className="grade-stats">
          <StatTile rotulo="Pedidos" valor={numero(r.totalPedidos)} detalhe={`${numero(r.entregues)} entregues · ${numero(r.cancelados)} cancelados`} />
          <StatTile rotulo="Taxa de entrega" valor={`${r.taxaEntrega.toLocaleString("pt-BR")}%`} detalhe={`Cancelamento: ${r.taxaCancelamento.toLocaleString("pt-BR")}%`} tom={r.taxaCancelamento > 15 ? "aviso" : undefined} />
          <StatTile rotulo="Receita de entregas" valor={moeda(r.receita)} detalhe={`Ticket médio ${moeda(r.ticketMedio)}`} />
          <StatTile rotulo="Distância média" valor={km(r.distanciaMediaKm)} detalhe="Por entrega concluída" />
        </div>
      )}

      <section className="cartao">
        <div className="cartao-topo"><h2>Pedidos por dia · últimos {dias} dias</h2></div>
        {volume.dados ? (
          <GraficoColunas
            titulo={`Pedidos por dia nos últimos ${dias} dias`}
            dados={volume.dados}
            valor={x => x.entregas}
            rotuloX={x => x.data.slice(8, 10) + "/" + x.data.slice(5, 7)}
            formatar={v => numero(v)}
            detalhe={x => `${x.dia} · ${x.entregues} entregues · ${x.cancelados} cancelados`}
          />
        ) : <Carregando />}
      </section>

      {r && (
        <div className="grade-2">
          <section className="cartao">
            <div className="cartao-topo"><h2>Comerciantes com mais pedidos</h2></div>
            {r.rankingComercios.length === 0 ? <Vazio titulo="Nenhum pedido no período" /> : (
              <div className="tabela-rolagem">
                <table className="tabela tabela-compacta">
                  <thead><tr><th>#</th><th>Comerciante</th><th className="num">Pedidos</th><th className="num">Valor</th></tr></thead>
                  <tbody>
                    {r.rankingComercios.map((c, i) => (
                      <tr key={c.id}><td className="apagado">{i + 1}</td><td>{c.nome}</td><td className="num">{numero(c.pedidos)}</td><td className="num">{moeda(c.valor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="cartao">
            <div className="cartao-topo"><h2>Entregadores com mais entregas</h2></div>
            {r.rankingEntregadores.length === 0 ? <Vazio titulo="Nenhuma entrega concluída no período" /> : (
              <div className="tabela-rolagem">
                <table className="tabela tabela-compacta">
                  <thead><tr><th>#</th><th>Entregador</th><th className="num">Entregas</th><th className="num">Distância</th><th className="num">Valor</th></tr></thead>
                  <tbody>
                    {r.rankingEntregadores.map((e, i) => (
                      <tr key={e.id}><td className="apagado">{i + 1}</td><td>{e.nome}</td><td className="num">{numero(e.entregas)}</td><td className="num">{km(e.distanciaKm)}</td><td className="num">{moeda(e.valor)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
