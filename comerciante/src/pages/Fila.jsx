// Fila: as entregas em aberto da loja em colunas, da criação até o cliente. Atualiza sozinha.
import { useEffect, useState } from "react";
import { api } from "../api";
import { useApi } from "../hooks/useApi";
import { Botao, Cabecalho, Carregando, ErroCaixa, useAcao } from "../components/ui";
import DetalhePedido from "../components/DetalhePedido";
import { SemRegistros } from "./Painel";
import { dataHora, moeda } from "../utils/format";

const COLUNAS = [
  { chave: "criado", titulo: "Criado", dica: "Aguardando você marcar como pronto", status: ["PREPARANDO"] },
  { chave: "aguardando", titulo: "Aguardando entregador", dica: "Os entregadores já foram chamados", status: ["PENDENTE"] },
  { chave: "coleta", titulo: "Entregador a caminho / na loja", dica: "Aceitou a corrida", status: ["ATRIBUIDO", "NA_LOJA"] },
  { chave: "rota", titulo: "Em rota", dica: "Saiu para o cliente", status: ["EM_ROTA", "NO_CLIENTE", "ATRASADO"] },
];

// Minutos desde um horário, atualizando a cada 30 s.
function useAgora() {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30000); return () => clearInterval(t); }, []);
  return agora;
}
const minutos = (desde, agora) => Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 60000));

export default function Fila() {
  const mapa = useApi("/mapa", { aoVivo: ["pedidos", "entregadores"] });
  const resumo = useApi("/resumo", { aoVivo: ["pedidos", "entregadores"] });
  const [aberto, setAberto] = useState(null);
  const { executar, ocupado } = useAcao();
  const agora = useAgora();
  const pedidos = mapa.dados?.pedidos || [];

  async function pronto(p) {
    if (await executar(() => api.patch(`/pedidos/${p.id}/pronto`), `Pedido de ${p.clienteNome} pronto — chamando entregador.`)) mapa.recarregar({ silencioso: true });
  }

  // Tempo na etapa atual (o carimbo mais recente que se aplica).
  const desdeQuando = p => (p.status === "PENDENTE" ? p.prontoEm : null) || p.createdAt;

  return (
    <>
      <Cabecalho titulo="Fila de entregas" subtitulo="Suas entregas em aberto, etapa por etapa. Clique numa entrega para ver os detalhes.">
        <span className="fila-online" title="Entregadores online que podem pegar corridas da sua loja">
          <i aria-hidden="true" /> {resumo.dados?.entregadoresOnline ?? "…"} entregador(es) online
        </span>
      </Cabecalho>
      <ErroCaixa erro={mapa.erro} onTentar={() => mapa.recarregar()} />
      {!mapa.dados ? <Carregando /> : (
        <div className="fila-colunas">
          {COLUNAS.map(c => {
            const itens = pedidos
              .filter(p => c.status.includes(p.status) && !(c.chave === "criado" && p.agendadoPara))
              .sort((a, b) => new Date(desdeQuando(a)) - new Date(desdeQuando(b)));
            return (
              <section key={c.chave} className={`fila-coluna fila-${c.chave}`} aria-label={c.titulo}>
                <header>
                  <strong>{c.titulo}</strong>
                  <span className="fila-qtd">{itens.length}</span>
                  <small>{c.dica}</small>
                </header>
                {itens.length === 0 ? <SemRegistros /> : itens.map((p, i) => {
                  const min = minutos(desdeQuando(p), agora);
                  return (
                    <article key={p.id} className="fila-cartao" onClick={() => setAberto(p.id)} tabIndex={0} onKeyDown={e => { if (e.key === "Enter") setAberto(p.id); }}>
                      <div className="fila-cartao-topo">
                        <strong>{c.chave === "aguardando" ? `${i + 1}º · ` : ""}{p.clienteNome}</strong>
                        <span className={`fila-tempo ${min >= 15 ? "alerta" : ""}`} title="Tempo nesta etapa">{min} min</span>
                      </div>
                      <small>{p.codigo} · {p.endereco}{p.complemento ? ` · ${p.complemento}` : ""}</small>
                      {p.entregador && <small>🏍 {p.entregador.nomeCompleto}</small>}
                      <div className="fila-cartao-rodape">
                        <span>{moeda(p.valor)}{p.retorno && <span className="selo-retorno">↩ retorno</span>}{p.status === "ATRASADO" && <span className="badge badge-critico">Atrasado</span>}</span>
                        {p.status === "PREPARANDO" && (
                          <span onClick={e => e.stopPropagation()}>
                            <Botao pequeno variante="primario" disabled={ocupado} onClick={() => pronto(p)}>Pedido pronto</Botao>
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
      {pedidos.some(p => p.agendadoPara && p.status === "PREPARANDO") && (
        <p className="apagado" style={{ marginTop: 12 }}>
          Entregas agendadas ficam em Agendamentos e entram na fila sozinhas no horário marcado
          (próxima: {dataHora(pedidos.filter(p => p.agendadoPara && p.status === "PREPARANDO").map(p => p.agendadoPara).sort()[0])}).
        </p>
      )}
      {aberto && <DetalhePedido id={aberto} onFechar={() => setAberto(null)} />}
    </>
  );
}
