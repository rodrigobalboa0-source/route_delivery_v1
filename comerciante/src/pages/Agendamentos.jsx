// Entregas agendadas: ficam "Criado" e entram na fila dos entregadores sozinhas no horário marcado.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApi } from "../hooks/useApi";
import { Botao, BotaoConfirmar, Cabecalho, Carregando, ErroCaixa, useAcao } from "../components/ui";
import DetalhePedido from "../components/DetalhePedido";
import { SemRegistros } from "./Painel";
import { dataHora, moeda } from "../utils/format";

function falta(quando) {
  const min = Math.round((new Date(quando).getTime() - Date.now()) / 60000);
  if (min <= 0) return "agora";
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `em ${h} h ${min % 60 ? `${min % 60} min` : ""}`;
  return `em ${Math.round(h / 24)} dia(s)`;
}

export default function Agendamentos() {
  const navegar = useNavigate();
  const { dados, erro, recarregar } = useApi("/pedidos?agendados=1", { aoVivo: ["pedidos"] });
  const [aberto, setAberto] = useState(null);
  const { executar, ocupado } = useAcao();
  const lista = (dados || []).slice().sort((a, b) => new Date(a.agendadoPara) - new Date(b.agendadoPara));

  async function acao(fn, msg) {
    if (await executar(fn, msg)) recarregar({ silencioso: true });
  }

  return (
    <>
      <Cabecalho titulo="Agendamentos" subtitulo="O entregador é chamado sozinho no horário marcado. Você pode chamar antes ou cancelar.">
        <button type="button" className="btn btn-laranja" onClick={() => navegar("/agendamentos/novo")}>+ Novo agendamento</button>
      </Cabecalho>
      <ErroCaixa erro={erro} onTentar={() => recarregar()} />
      <div className="painel-bloco">
        {!dados ? <Carregando /> : lista.length === 0 ? <SemRegistros texto="Nenhuma entrega agendada" /> : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr><th>Chamar entregador</th><th>Cliente</th><th>Pedido</th><th className="num">Valor</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id} className="linha-clicavel" onClick={() => setAberto(p.id)}>
                    <td><strong>⏰ {dataHora(p.agendadoPara)}</strong><div className="celula-sub">{falta(p.agendadoPara)}</div></td>
                    <td>{p.clienteNome}{p.retorno && <span className="selo-retorno">↩ retorno</span>}<div className="celula-sub">{p.endereco}{p.complemento ? ` · ${p.complemento}` : ""}</div></td>
                    <td>{p.codigo}</td>
                    <td className="num">{moeda(p.valor)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="linha-acao">
                        <Botao pequeno variante="primario" disabled={ocupado} onClick={() => acao(() => api.patch(`/pedidos/${p.id}/pronto`), "Entregador sendo chamado agora.")}>Chamar agora</Botao>
                        <BotaoConfirmar pequeno confirmar="Cancelar?" disabled={ocupado} onConfirm={() => acao(() => api.patch(`/pedidos/${p.id}/cancelar`), "Agendamento cancelado.")}>Cancelar</BotaoConfirmar>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {aberto && <DetalhePedido id={aberto} onFechar={() => setAberto(null)} />}
    </>
  );
}
