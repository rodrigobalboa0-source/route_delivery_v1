import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { BadgeMapa, Botao, Cabecalho, Carregando, ErroCaixa, StatTile, Vazio, useAcao } from "../components/ui";
import MapaEntregadores from "../components/MapaEntregadores";
import DetalhePedido from "../components/DetalhePedido";
import { COM_ENTREGADOR, STATUS_PEDIDO, moeda, numero, tempoRelativo } from "../utils/format";

const soma = (m, lista) => lista.reduce((t, s) => t + (m?.[s] || 0), 0);

export default function Inicio() {
  const { loja } = useAuth();
  const navegar = useNavigate();
  const resumo = useApi("/resumo", { aoVivo: ["pedidos", "faturas"] });
  const mapa = useApi("/mapa", { aoVivo: ["pedidos", "entregadores"] });
  const [aberto, setAberto] = useState(null);
  const { executar, ocupado } = useAcao();

  const h = resumo.dados?.hojePorStatus;
  const lojaMapa = mapa.dados?.loja;
  const pedidos = (mapa.dados?.pedidos || []).map(p => ({ ...p, loja: { id: "loja", ...lojaMapa } }));

  async function pronto(p) {
    if (await executar(() => api.patch(`/pedidos/${p.id}/pronto`), `Pedido de ${p.clienteNome} pronto — chamando entregador.`)) {
      mapa.recarregar({ silencioso: true });
    }
  }

  return (
    <>
      <Cabecalho titulo={`Olá, ${loja?.nomeFantasia || ""}`} subtitulo="Suas entregas de hoje, ao vivo." />
      <ErroCaixa erro={resumo.erro || mapa.erro} onTentar={() => { resumo.recarregar(); mapa.recarregar(); }} />

      <div className="grade-stats">
        <StatTile rotulo="Em preparo" valor={numero(soma(h, ["PREPARANDO"]))} detalhe="Aguardando ficar pronto" onClick={() => navegar("/pedidos?ver=abertos")} />
        <StatTile rotulo="Aguardando entregador" valor={numero(soma(h, ["PENDENTE"]))} tom="aviso" onClick={() => navegar("/pedidos?ver=abertos")} />
        <StatTile rotulo="Em entrega" valor={numero(soma(h, COM_ENTREGADOR))} tom="info" onClick={() => navegar("/pedidos?ver=abertos")} />
        <StatTile rotulo="Entregues hoje" valor={numero(soma(h, ["ENTREGUE"]))} tom="ok" onClick={() => navegar("/pedidos?ver=entregues")} />
        <StatTile rotulo="Entregas no mês" valor={numero(resumo.dados?.entreguesNoMes ?? 0)} detalhe={moeda(resumo.dados?.valorNoMes ?? 0)} />
        <StatTile
          rotulo="Faturas em aberto"
          valor={moeda(resumo.dados?.valorFaturasAbertas ?? 0)}
          detalhe={`${resumo.dados?.faturasAbertas ?? 0} fatura(s)`}
          tom={resumo.dados?.faturasAbertas ? "aviso" : undefined}
          onClick={() => navegar("/financeiro")}
        />
      </div>

      <div className="inicio-grade">
        <section className="cartao">
          <div className="cartao-topo">
            <h3 className="secao-titulo" style={{ margin: 0 }}>Entregas em andamento</h3>
            <span className="apagado">{pedidos.length} em aberto</span>
          </div>
          {!mapa.dados ? <Carregando /> : pedidos.length === 0 ? (
            <Vazio titulo="Nenhuma entrega em aberto">
              <Botao variante="primario" onClick={() => navegar("/nova-entrega")}>+ Lançar entrega</Botao>
            </Vazio>
          ) : (
            <ul className="lista-andamento">
              {pedidos.map(p => (
                <li key={p.id}>
                  <button type="button" className="andamento-item" onClick={() => setAberto(p.id)}>
                    <span className="andamento-topo">
                      <strong>{p.clienteNome}</strong>
                      <BadgeMapa mapa={STATUS_PEDIDO} valor={p.status} />
                    </span>
                    <span className="celula-sub">{p.codigo} · {p.endereco}</span>
                    <span className="celula-sub">
                      {p.entregador ? `🏍 ${p.entregador.nomeCompleto}` : p.status === "PENDENTE" ? "Procurando entregador…" : "Aguardando você marcar como pronto"}
                      {" · "}{tempoRelativo(p.createdAt)}
                    </span>
                  </button>
                  {p.status === "PREPARANDO" && (
                    <Botao pequeno variante="primario" disabled={ocupado} onClick={() => pronto(p)}>Pedido pronto</Botao>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cartao cartao-mapa">
          <h3 className="secao-titulo">Mapa</h3>
          {!mapa.dados ? <Carregando /> : (
            <MapaEntregadores pedidos={pedidos} altura={420} onPedido={p => setAberto(p.id)} carregado={!!mapa.dados} />
          )}
        </section>
      </div>

      {aberto && <DetalhePedido id={aberto} onFechar={() => setAberto(null)} />}
    </>
  );
}
