// Gaveta de detalhe do pedido: dados, ações (conforme o status), observação e linha do tempo.
import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { BadgeMapa, Botao, BotaoConfirmar, Campo, Carregando, ErroCaixa, Gaveta, Modal, useAcao } from "./ui";
import { ORIGEM_PEDIDO, STATUS_PEDIDO, VEICULOS, dataHora, km, moeda } from "../utils/format";
import SeletorStatus from "./SeletorStatus";
// Ações disponíveis por status (espelham as transições validadas pela API).
const EM_ANDAMENTO = ["trocar", "reprocurar", "atrasado", "finalizar", "cancelar"];
export const ACOES = {
  PREPARANDO: ["pronto", "atribuir", "atrasado", "cancelar"],
  PENDENTE: ["atribuir", "atrasado", "finalizar", "cancelar"],
  ATRIBUIDO: EM_ANDAMENTO,
  NA_LOJA: EM_ANDAMENTO,
  EM_ROTA: EM_ANDAMENTO,
  NO_CLIENTE: EM_ANDAMENTO,
  ATRASADO: ["atribuir", "trocar", "reprocurar", "finalizar", "cancelar"],
  ENTREGUE: [],
  CANCELADO: [],
};

function SeletorEntregador({ onEscolher, onCancelar, rotulo }) {
  const { dados } = useApi("/entregadores?status=ATIVO");
  const [id, setId] = useState("");
  const disponiveis = (dados || []).filter(e => !e.bloqueado);
  return (
    <div className="linha-acao">
      <select value={id} onChange={e => setId(e.target.value)} aria-label="Entregador">
        <option value="">Escolha o entregador…</option>
        {disponiveis.map(e => (
          <option key={e.id} value={e.id}>
            {e.nomeCompleto} · {VEICULOS[e.veiculoTipo]}{e.online ? " · online" : ""}
          </option>
        ))}
      </select>
      <Botao variante="primario" pequeno disabled={!id} onClick={() => onEscolher(id)}>{rotulo}</Botao>
      <Botao variante="fantasma" pequeno onClick={onCancelar}>Voltar</Botao>
    </div>
  );
}

function EditarPedido({ pedido, onSalvo, onFechar }) {
  const [v, setV] = useState({
    clienteNome: pedido.clienteNome || "",
    clienteTelefone: pedido.clienteTelefone || "",
    endereco: pedido.endereco || "",
    complemento: pedido.complemento || "",
    retorno: !!pedido.retorno,
    valor: pedido.valor ?? "",
    formaPagamento: pedido.formaPagamento || "",
    prazoDesejado: pedido.prazoDesejado || "",
    notaFiscalNumero: pedido.notaFiscalNumero || "",
    notaFiscalChave: pedido.notaFiscalChave || "",
    notaFiscalValor: pedido.notaFiscalValor ?? "",
  });
  const { executar, ocupado } = useAcao();
  const set = k => e => setV({ ...v, [k]: e.target.value });

  async function salvar(e) {
    e.preventDefault();
    const r = await executar(() => api.put(`/pedidos/${pedido.id}`, v), "Pedido atualizado.");
    if (r) onSalvo(r);
  }

  return (
    <Modal titulo={`Editar ${pedido.codigo}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="grade-campos">
        <Campo rotulo="Cliente *"><input value={v.clienteNome} onChange={set("clienteNome")} required /></Campo>
        <Campo rotulo="Telefone"><input value={v.clienteTelefone} onChange={set("clienteTelefone")} /></Campo>
        <Campo rotulo="Endereço de entrega *" largo><input value={v.endereco} onChange={set("endereco")} required /></Campo>
        <Campo rotulo="Complemento"><input value={v.complemento} onChange={set("complemento")} placeholder="Apto, bloco, referência" /></Campo>
        <label className="campo campo-check">
          <input type="checkbox" checked={v.retorno} onChange={e => setV({ ...v, retorno: e.target.checked })} />
          <span>Com retorno à loja</span>
        </label>
        <Campo rotulo="Valor da entrega (R$)"><input type="number" step="0.01" value={v.valor} onChange={set("valor")} /></Campo>
        <Campo rotulo="Forma de pagamento"><input value={v.formaPagamento} onChange={set("formaPagamento")} /></Campo>
        <Campo rotulo="Prazo desejado"><input value={v.prazoDesejado} onChange={set("prazoDesejado")} /></Campo>
        <Campo rotulo="Nº da nota fiscal"><input value={v.notaFiscalNumero} onChange={set("notaFiscalNumero")} /></Campo>
        <Campo rotulo="Valor da nota (R$)"><input type="number" step="0.01" min="0" value={v.notaFiscalValor} onChange={set("notaFiscalValor")} /></Campo>
        <Campo rotulo="Chave de acesso da NF-e" largo dica="44 dígitos (opcional).">
          <input value={v.notaFiscalChave} inputMode="numeric" maxLength={54} onChange={e => setV({ ...v, notaFiscalChave: e.target.value.replace(/[^\d ]/g, "") })} />
        </Campo>
        <div className="form-rodape campo-largo">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function DetalhePedido({ id, onFechar, onAlterado }) {
  const { podeEditar } = useAuth();
  const { dados: pedido, setDados, erro, carregando, recarregar } = useApi(`/pedidos/${id}`, { aoVivo: ["pedidos"] });
  const { executar, ocupado } = useAcao();
  const [modo, setModo] = useState(null); // "atribuir" | "trocar" | "editar" | "observacao"
  const [obs, setObs] = useState("");

  // Só repõe a observação quando muda no servidor (o tempo real recarrega o pedido sem apagar o que se digita).
  useEffect(() => { if (pedido) setObs(pedido.observacao || ""); }, [pedido?.id, pedido?.observacao]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acao(fn, msg) {
    const r = await executar(fn, msg);
    if (r) {
      setModo(null);
      await recarregar({ silencioso: true });
      onAlterado();
    }
    return r;
  }

  const pode = podeEditar("pedidos");
  const acoes = pedido ? ACOES[pedido.status] || [] : [];

  return (
    <Gaveta
      titulo={pedido ? `Pedido ${pedido.codigo}` : "Pedido"}
      subtitulo={pedido && <BadgeMapa mapa={STATUS_PEDIDO} valor={pedido.status} />}
      onFechar={onFechar}
    >
      <ErroCaixa erro={erro} />
      {carregando && !pedido && <Carregando />}
      {pedido && (
        <>
          <dl className="detalhes">
            <dt>Comércio</dt><dd>{pedido.comercio?.nomeFantasia}</dd>
            <dt>Cliente</dt><dd>{pedido.clienteNome}{pedido.clienteTelefone && <span className="apagado"> · {pedido.clienteTelefone}</span>}</dd>
            <dt>Entrega em</dt>
            <dd>
              {pedido.endereco}
              {pedido.complemento && <div className="celula-sub">{pedido.complemento}</div>}
              {pedido.retorno && <div><span className="badge badge-aviso">↩ Com retorno à loja</span></div>}
            </dd>
            {pedido.agendadoPara && <><dt>Agendado</dt><dd>Chamar entregador em {dataHora(pedido.agendadoPara)}</dd></>}
            <dt>Entregador</dt>
            <dd>{pedido.entregador ? `${pedido.entregador.nomeCompleto} · ${VEICULOS[pedido.entregador.veiculoTipo] || ""}` : <span className="apagado">Nenhum</span>}</dd>
            <dt>Valor</dt><dd>{moeda(pedido.valor)}</dd>
            <dt>Distância</dt><dd>{km(pedido.distanciaKm)}</dd>
            <dt>Pagamento</dt><dd>{pedido.formaPagamento || "—"}</dd>
            <dt>Prazo</dt><dd>{pedido.prazoDesejado || "—"}</dd>
            <dt>Criado</dt><dd>{dataHora(pedido.createdAt)}</dd>
            <dt>Origem</dt><dd>{ORIGEM_PEDIDO[pedido.origem] || "—"}</dd>
            <dt>Nota fiscal</dt>
            <dd>
              {pedido.notaFiscalNumero || pedido.notaFiscalChave
                ? <>{pedido.notaFiscalNumero ? `Nº ${pedido.notaFiscalNumero}` : "Sem número"}{pedido.notaFiscalValor != null && ` · ${moeda(pedido.notaFiscalValor)}`}{pedido.notaFiscalChave && <div className="celula-sub mono">{pedido.notaFiscalChave}</div>}</>
                : <span className="apagado">Não informada</span>}
            </dd>
          </dl>

          {pode && (
            <section className="bloco">
              <h3>Ações</h3>
              <label className="linha-status">
                <span>Status da entrega</span>
                <SeletorStatus
                  pedido={pedido}
                  onPrecisaEntregador={() => setModo("atribuir")}
                  onAlterado={async () => { await recarregar({ silencioso: true }); onAlterado(); }}
                />
              </label>
              {modo === "atribuir" || modo === "trocar" ? (
                <SeletorEntregador
                  rotulo={modo === "atribuir" ? "Atribuir" : "Trocar"}
                  onCancelar={() => setModo(null)}
                  onEscolher={entregadorId =>
                    acao(
                      () => api.patch(`/pedidos/${id}/${modo === "atribuir" ? "aceitar" : "trocar-entregador"}`, { entregadorId }),
                      modo === "atribuir" ? "Entregador atribuído." : "Entregador trocado."
                    )
                  }
                />
              ) : (
                <div className="botoes">
                  {acoes.includes("pronto") && (
                    <Botao variante="primario" disabled={ocupado} onClick={() => acao(() => api.patch(`/pedidos/${id}/pronto`), "Pedido liberado para os entregadores.")}>
                      Marcar como pronto
                    </Botao>
                  )}
                  {acoes.includes("atribuir") && <Botao onClick={() => setModo("atribuir")}>Atribuir entregador</Botao>}
                  {acoes.includes("trocar") && <Botao onClick={() => setModo("trocar")}>Trocar entregador</Botao>}
                  {acoes.includes("reprocurar") && (
                    <Botao disabled={ocupado} onClick={() => acao(() => api.patch(`/pedidos/${id}/reprocurar`), "Pedido voltou para a fila.")}>
                      Buscar outro entregador
                    </Botao>
                  )}
                  {acoes.includes("finalizar") && (
                    <Botao disabled={ocupado} onClick={() => acao(() => api.patch(`/pedidos/${id}/finalizar`), "Pedido finalizado.")}>
                      Finalizar
                    </Botao>
                  )}
                  {acoes.includes("atrasado") && (
                    <Botao disabled={ocupado} onClick={() => acao(() => api.patch(`/pedidos/${id}/atrasado`), "Pedido marcado como atrasado.")}>
                      Marcar atrasado
                    </Botao>
                  )}
                  {acoes.includes("cancelar") && (
                    <BotaoConfirmar confirmar="Cancelar este pedido?" disabled={ocupado} onConfirm={() => acao(() => api.patch(`/pedidos/${id}/cancelar`), "Pedido cancelado.")}>
                      Cancelar pedido
                    </BotaoConfirmar>
                  )}
                  <Botao variante="fantasma" onClick={() => setModo("editar")}>Editar dados</Botao>
                  <Botao variante="fantasma" disabled={ocupado} onClick={() => acao(() => api.post(`/pedidos/${id}/clonar`), "Pedido clonado.")}>Clonar</Botao>
                </div>
              )}
            </section>
          )}

          <section className="bloco">
            <h3>Observação</h3>
            <textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} disabled={!pode} placeholder="Instruções para o entregador ou a equipe" />
            {pode && obs !== (pedido.observacao || "") && (
              <Botao pequeno variante="primario" onClick={() => acao(() => api.post(`/pedidos/${id}/observacao`, { texto: obs }), "Observação salva.")}>
                Salvar observação
              </Botao>
            )}
          </section>

          <section className="bloco">
            <h3>Linha do tempo</h3>
            <ol className="linha-tempo">
              {pedido.logs.map(l => (
                <li key={l.id}>
                  <span>{l.texto}</span>
                  <small>{dataHora(l.createdAt)}</small>
                </li>
              ))}
            </ol>
          </section>

          {modo === "editar" && (
            <EditarPedido
              pedido={pedido}
              onFechar={() => setModo(null)}
              onSalvo={r => { setDados({ ...pedido, ...r }); setModo(null); onAlterado(); }}
            />
          )}
        </>
      )}
    </Gaveta>
  );
}
