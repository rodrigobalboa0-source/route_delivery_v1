// iFood no sistema da loja: negociações do cliente (pedido de cancelamento) e cancelamento com motivo do iFood.
import { useEffect, useState } from "react";
import { api } from "../api";
import { useApi } from "../hooks/useApi";
import { Botao, Campo, Carregando, Modal, useAcao } from "./ui";
import { moeda } from "../utils/format";

const ACOES = { CANCELLATION: "cancelar o pedido", PARTIAL_CANCELLATION: "cancelar parte do pedido" };
const QUANDO = { AFTER_DELIVERY: "depois da entrega", AFTER_DELIVERY_PARTIALLY: "depois da entrega", PREPARATION_TIME: "durante o preparo", DELAY: "por causa de atraso" };
const NO_PRAZO = { REJECT_CANCELLATION: "o cancelamento é recusado", ACCEPT_CANCELLATION: "o cancelamento é aceito" };
const STATUS = { ACEITA: "Aceita", RECUSADA: "Recusada", ALTERNATIVA: "Contraproposta enviada", EXPIRADA: "Prazo esgotado" };

export const textoNegociacao = d => `O cliente quer ${ACOES[d.acao] || "cancelar o pedido"}${QUANDO[d.tipo] ? ` ${QUANDO[d.tipo]}` : ""}`;

// Minutos e segundos até o prazo, atualizando a cada segundo.
function useRestante(expiraEm) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!expiraEm) return null;
  const s = Math.max(0, Math.floor((new Date(expiraEm) - agora) / 1000));
  return { s, texto: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` };
}

export function ResponderNegociacao({ disputa, pedidoId, onFechar }) {
  const [resposta, setResposta] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [alternativaId, setAlternativaId] = useState(disputa.alternativas?.[0]?.id || "");
  const [valor, setValor] = useState("");
  const [minutos, setMinutos] = useState("");
  const { executar, ocupado } = useAcao();
  const restante = useRestante(disputa.expiraEm);
  const alternativa = (disputa.alternativas || []).find(a => a.id === alternativaId);
  const maxReembolso = alternativa?.type === "REFUND" ? Number(alternativa.metadata?.maxAmount?.value || 0) / 100 : null;
  const tempos = alternativa?.metadata?.allowedsAdditionalTimeInMinutes || alternativa?.metadata?.allowedAdditionalTimeInMinutes || [];

  async function enviar(e) {
    e.preventDefault();
    const corpo = { resposta, motivo, alternativaId, valor, minutos };
    if (await executar(() => api.post(`/pedidos/${pedidoId}/ifood/disputas/${disputa.id}`, corpo), "Resposta enviada ao iFood.")) onFechar(true);
  }

  return (
    <Modal titulo="Pedido do cliente no iFood" onFechar={() => onFechar(false)}>
      <form onSubmit={enviar}>
        <p style={{ marginTop: 0 }}><strong>{textoNegociacao(disputa)}.</strong></p>
        {disputa.mensagem && <p className="aviso-caixa">“{disputa.mensagem}”</p>}
        {restante && (
          <p className={restante.s < 120 ? "texto-critico" : "apagado"}>
            ⏱ Responda em <strong>{restante.texto}</strong>.{NO_PRAZO[disputa.acaoNoPrazo] ? ` Sem resposta, ${NO_PRAZO[disputa.acaoNoPrazo]}.` : " Sem resposta, o iFood decide sozinho."}
          </p>
        )}
        <div className="botoes" style={{ marginBottom: 12 }}>
          <Botao variante={resposta === "aceitar" ? "primario" : "secundario"} onClick={() => setResposta("aceitar")}>Aceitar</Botao>
          <Botao variante={resposta === "recusar" ? "primario" : "secundario"} onClick={() => setResposta("recusar")}>Recusar</Botao>
          {disputa.alternativas?.length > 0 && <Botao variante={resposta === "alternativa" ? "primario" : "secundario"} onClick={() => setResposta("alternativa")}>Fazer contraproposta</Botao>}
        </div>
        {resposta === "aceitar" && <p className="apagado">O iFood {disputa.acao === "PARTIAL_CANCELLATION" ? "cancela os itens pedidos" : "cancela o pedido"} e a entrega aqui é atualizada sozinha.</p>}
        {resposta === "recusar" && (
          <Campo rotulo="Motivo da recusa *" dica="O cliente vê esta mensagem no iFood." largo>
            <textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={250} required />
          </Campo>
        )}
        {resposta === "alternativa" && (
          <>
            {disputa.alternativas.length > 1 && (
              <Campo rotulo="Contraproposta">
                <select value={alternativaId} onChange={e => setAlternativaId(e.target.value)}>
                  {disputa.alternativas.map(a => <option key={a.id} value={a.id}>{a.type === "REFUND" ? "Reembolso parcial" : "Mais tempo"}</option>)}
                </select>
              </Campo>
            )}
            {alternativa?.type === "REFUND" && (
              <Campo rotulo="Valor do reembolso (R$) *" dica={maxReembolso ? `Máximo ${moeda(maxReembolso)}.` : null}>
                <input type="number" step="0.01" min="0.01" max={maxReembolso || undefined} value={valor} onChange={e => setValor(e.target.value)} required />
              </Campo>
            )}
            {alternativa?.type === "ADDITIONAL_TIME" && (
              <Campo rotulo="Minutos a mais *">
                {tempos.length ? (
                  <select value={minutos} onChange={e => setMinutos(e.target.value)} required>
                    <option value="">Escolha…</option>
                    {tempos.map(m => <option key={m} value={m}>{m} min</option>)}
                  </select>
                ) : <input type="number" min="1" value={minutos} onChange={e => setMinutos(e.target.value)} required />}
              </Campo>
            )}
          </>
        )}
        <div className="form-rodape">
          <Botao variante="fantasma" onClick={() => onFechar(false)}>Voltar</Botao>
          <button type="submit" className="btn btn-laranja" disabled={!resposta || ocupado || (restante && restante.s === 0)}>Enviar resposta</button>
        </div>
      </form>
    </Modal>
  );
}

// Cartão no detalhe do pedido (pendente: botão para responder; respondida: o resultado).
export function CartaoNegociacao({ disputa, pedidoId, onAlterado }) {
  const [aberto, setAberto] = useState(false);
  const restante = useRestante(disputa.status === "PENDENTE" ? disputa.expiraEm : null);
  const pendente = disputa.status === "PENDENTE" && (!restante || restante.s > 0);
  return (
    <div className={`negociacao ${pendente ? "pendente" : ""}`}>
      <div>
        <strong>iFood · {textoNegociacao(disputa)}</strong>
        {disputa.mensagem && <div className="celula-sub">“{disputa.mensagem}”</div>}
        <div className="celula-sub">
          {pendente ? `Responda em ${restante ? restante.texto : "breve"}` : `${STATUS[disputa.status] || (restante?.s === 0 ? "Prazo esgotado" : disputa.status)}${disputa.resposta ? ` — ${disputa.respondidoPor ? `${disputa.respondidoPor} ` : ""}${disputa.resposta}` : ""}`}
        </div>
      </div>
      {pendente && <Botao variante="primario" pequeno onClick={() => setAberto(true)}>Responder</Botao>}
      {aberto && <ResponderNegociacao disputa={disputa} pedidoId={pedidoId} onFechar={mudou => { setAberto(false); if (mudou) onAlterado?.(); }} />}
    </div>
  );
}

// Aviso no topo de todas as telas da loja enquanto houver negociação esperando resposta.
export function AvisoNegociacoes() {
  const { dados, recarregar } = useApi("/ifood/negociacoes", { aoVivo: ["pedidos"], intervaloMs: 20000 });
  const [respondendo, setRespondendo] = useState(null);
  if (!dados?.length) return null;
  return (
    <div className="aviso-negociacoes" role="alert">
      {dados.map(d => (
        <div key={d.id} className="aviso-negociacao">
          <span>⚠ <strong>{d.pedido?.codigoExterno || d.pedido?.codigo}</strong> · {d.pedido?.clienteNome}: {textoNegociacao(d)}.</span>
          <PrazoCurto expiraEm={d.expiraEm} />
          <Botao pequeno variante="primario" onClick={() => setRespondendo(d)}>Responder</Botao>
        </div>
      ))}
      {respondendo && <ResponderNegociacao disputa={respondendo} pedidoId={respondendo.pedidoId} onFechar={() => { setRespondendo(null); recarregar({ silencioso: true }); }} />}
    </div>
  );
}

function PrazoCurto({ expiraEm }) {
  const r = useRestante(expiraEm);
  return r ? <span className={r.s < 120 ? "texto-critico" : "apagado"}>⏱ {r.texto}</span> : null;
}

// Cancelar pedido do iFood: o motivo precisa ser um dos aceitos pelo iFood para este pedido.
export function CancelarIfood({ pedido, onFechar }) {
  const [motivos, setMotivos] = useState(null);
  const [erro, setErro] = useState(null);
  const [motivo, setMotivo] = useState("");
  const { executar, ocupado } = useAcao();
  useEffect(() => { api.get(`/pedidos/${pedido.id}/ifood/motivos-cancelamento`).then(setMotivos).catch(e => setErro(e.message)); }, [pedido.id]);
  async function enviar(e) {
    e.preventDefault();
    const r = await executar(() => api.patch(`/pedidos/${pedido.id}/cancelar`, { motivoIfood: motivo }));
    if (r) onFechar(true, r.mensagem);
  }
  return (
    <Modal titulo={`Cancelar ${pedido.codigoExterno || pedido.codigo} no iFood`} onFechar={() => onFechar(false)}>
      <form onSubmit={enviar}>
        <p style={{ marginTop: 0 }}>O cancelamento é enviado ao iFood, que avisa o cliente. A entrega aqui é cancelada assim que o iFood confirmar (em instantes).</p>
        {erro ? <p className="texto-critico">{erro}</p> : !motivos ? <Carregando /> : motivos.length === 0 ? (
          <p className="texto-critico">O iFood não permite cancelar este pedido agora. Fale com o suporte do iFood.</p>
        ) : (
          <Campo rotulo="Motivo (lista do iFood) *" largo>
            <select value={motivo} onChange={e => setMotivo(e.target.value)} required>
              <option value="">Escolha o motivo…</option>
              {motivos.map(m => <option key={m.codigo} value={m.codigo}>{m.descricao}</option>)}
            </select>
          </Campo>
        )}
        <div className="form-rodape">
          <Botao variante="fantasma" onClick={() => onFechar(false)}>Voltar</Botao>
          <button type="submit" className="btn btn-perigo" disabled={!motivo || ocupado}>Cancelar no iFood</button>
        </div>
      </form>
    </Modal>
  );
}
