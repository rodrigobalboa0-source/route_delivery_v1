// Gaveta do pedido na visão da loja: etapas da entrega, motoboy no mapa, dados e linha do tempo.
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { BadgeMapa, Botao, BotaoConfirmar, Campo, Carregando, ErroCaixa, Gaveta, Modal, useAcao } from "./ui";
import CampoEndereco from "./CampoEndereco";
import MapaEntregadores from "./MapaEntregadores";
import { COM_ENTREGADOR, STATUS_PEDIDO, VEICULOS, dataHora, km, moeda, tempoRelativo } from "../utils/format";

// Etapas mostradas para a loja (Atrasado conta como "em andamento", sem etapa própria).
const ETAPAS = [
  { status: "PREPARANDO", rotulo: "Criado" },
  { status: "PENDENTE", rotulo: "Pronto" },
  { status: "ATRIBUIDO", rotulo: "Motoboy a caminho" },
  { status: "NA_LOJA", rotulo: "Na loja" },
  { status: "EM_ROTA", rotulo: "Em rota" },
  { status: "NO_CLIENTE", rotulo: "No cliente" },
  { status: "ENTREGUE", rotulo: "Entregue" },
];

function etapaAtual(p) {
  if (p.status === "ATRASADO") {
    // Atrasado: mostra a etapa real pelo último carimbo.
    if (p.noClienteEm) return 5;
    if (p.saiuEm) return 4;
    if (p.naLojaEm) return 3;
    return p.entregadorId ? 2 : 1;
  }
  return ETAPAS.findIndex(e => e.status === p.status);
}

export function Etapas({ pedido }) {
  if (pedido.status === "CANCELADO") return <div className="aviso-caixa erro-leve">Pedido cancelado.</div>;
  if (pedido.status === "PREPARANDO" && pedido.agendadoPara) {
    return <div className="aviso-caixa agendado-caixa">⏰ Agendado — o entregador será chamado em {dataHora(pedido.agendadoPara)}.</div>;
  }
  const atual = etapaAtual(pedido);
  return (
    <ol className="etapas" aria-label="Andamento da entrega">
      {ETAPAS.map((e, i) => (
        <li key={e.status} className={i < atual ? "feita" : i === atual ? "atual" : ""} aria-current={i === atual ? "step" : undefined}>
          <span className="etapa-ponto" aria-hidden="true">{i < atual ? "✓" : ""}</span>
          <span className="etapa-rotulo">{e.rotulo}</span>
        </li>
      ))}
    </ol>
  );
}

// Editar dados do pedido (loja). Ligar/desligar retorno ou trocar o endereço recalcula a taxa.
function EditarPedido({ pedido, onFechar, onSalvo, pct }) {
  const [v, setV] = useState({
    clienteNome: pedido.clienteNome || "", clienteTelefone: pedido.clienteTelefone || "", endereco: pedido.endereco || "",
    complemento: pedido.complemento || "", formaPagamento: pedido.formaPagamento || "", observacao: pedido.observacao || "",
    retorno: !!pedido.retorno,
  });
  const [destino, setDestino] = useState(null);
  const [aprox, setAprox] = useState(null);
  const { executar, ocupado } = useAcao();
  const set = k => e => setV({ ...v, [k]: e.target.value });
  const podeEndereco = ["PREPARANDO", "PENDENTE", "ATRIBUIDO"].includes(pedido.status);

  async function salvar(e) {
    e.preventDefault();
    const corpo = { ...v };
    if (!podeEndereco || v.endereco === pedido.endereco) delete corpo.endereco;
    else Object.assign(corpo, { destino, destinoAprox: aprox });
    const r = await executar(() => api.put(`/pedidos/${pedido.id}`, corpo), "Pedido atualizado. O entregador já vê os dados novos.");
    if (r) onSalvo(r);
  }

  return (
    <Modal titulo={`Editar ${pedido.codigo}`} onFechar={onFechar}>
      <form onSubmit={salvar} className="grade-campos">
        <Campo rotulo="Nome do cliente *"><input value={v.clienteNome} onChange={set("clienteNome")} required /></Campo>
        <Campo rotulo="Telefone"><input value={v.clienteTelefone} onChange={set("clienteTelefone")} /></Campo>
        <Campo rotulo="Endereço de entrega" largo dica={podeEndereco ? "Trocar o endereço recalcula a distância e a taxa." : "O entregador já saiu — para mudar o endereço, fale com a equipe."}>
          {podeEndereco ? (
            <CampoEndereco valor={v.endereco} onChange={t => { setV(a => ({ ...a, endereco: t })); setDestino(null); setAprox(null); }}
              onEscolherEndereco={x => { setV(a => ({ ...a, endereco: x.endereco })); setDestino(x.exato ? { lat: x.lat, lng: x.lng } : null); setAprox(x.exato ? null : { lat: x.lat, lng: x.lng }); }} />
          ) : <input value={v.endereco} disabled />}
        </Campo>
        <Campo rotulo="Complemento"><input value={v.complemento} onChange={set("complemento")} /></Campo>
        <Campo rotulo="Pagamento do cliente"><input value={v.formaPagamento} onChange={set("formaPagamento")} /></Campo>
        <Campo rotulo="Observação para o entregador" largo><textarea rows={2} value={v.observacao} onChange={set("observacao")} /></Campo>
        <label className="campo campo-switch campo-largo">
          <input type="checkbox" role="switch" checked={v.retorno} onChange={e => setV({ ...v, retorno: e.target.checked })} />
          <span className="interruptor" aria-hidden="true" />
          <span>Retorno à loja (+{pct}% na taxa) — ligar ou tirar recalcula o valor</span>
        </label>
        <div className="form-rodape campo-largo">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-laranja" disabled={ocupado}>Salvar alterações</button>
        </div>
      </form>
    </Modal>
  );
}

export default function DetalhePedido({ id, onFechar }) {
  const { loja } = useAuth();
  const { dados: pedido, erro, carregando, recarregar } = useApi(`/pedidos/${id}`, { aoVivo: ["pedidos", "entregadores"] });
  const { executar, ocupado } = useAcao();
  const [editando, setEditando] = useState(false);

  async function acao(fn, msg) {
    if (await executar(fn, msg)) await recarregar({ silencioso: true });
  }

  const endLoja = loja?.enderecos?.[0];
  const podeEditar = pedido && !["ENTREGUE", "CANCELADO"].includes(pedido.status);
  const noMapa = pedido && {
    ...pedido,
    destino: pedido.latDestino != null ? { lat: pedido.latDestino, lng: pedido.lngDestino } : null,
    loja: { id: "loja", nome: loja?.nomeFantasia, lat: endLoja?.lat ?? null, lng: endLoja?.lng ?? null },
  };
  const acompanhando = pedido && COM_ENTREGADOR.includes(pedido.status);

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
          <Etapas pedido={pedido} />

          {(pedido.status === "PREPARANDO" || pedido.status === "PENDENTE") && (
            <div className="botoes" style={{ marginBottom: 14 }}>
              {pedido.status === "PREPARANDO" && (
                <Botao variante="primario" disabled={ocupado} onClick={() => acao(() => api.patch(`/pedidos/${id}/pronto`), "Pedido pronto! Chamando entregador.")}>
                  {pedido.agendadoPara ? "Chamar entregador agora" : "Pedido pronto — chamar entregador"}
                </Botao>
              )}
              <BotaoConfirmar confirmar="Cancelar este pedido?" disabled={ocupado} onConfirm={() => acao(() => api.patch(`/pedidos/${id}/cancelar`), "Pedido cancelado.")}>
                Cancelar pedido
              </BotaoConfirmar>
            </div>
          )}
          {podeEditar && (
            <div className="botoes" style={{ marginBottom: 14 }}>
              <Botao onClick={() => setEditando(true)}>✎ Editar dados do pedido</Botao>
            </div>
          )}
          {editando && (
            <EditarPedido pedido={pedido} pct={loja?.retornoPercentual ?? 20} onFechar={() => setEditando(false)}
              onSalvo={() => { setEditando(false); recarregar({ silencioso: true }); }} />
          )}

          {pedido.entregador && (
            <section className="bloco">
              <h3>Entregador</h3>
              <div className="cartao-motoboy">
                <span className="avatar" aria-hidden="true">
                  {pedido.entregador.fotoUrl ? <img src={pedido.entregador.fotoUrl} alt="" /> : pedido.entregador.nomeCompleto?.[0]}
                </span>
                <div>
                  <strong>{pedido.entregador.nomeCompleto}</strong>
                  <div className="celula-sub">
                    {VEICULOS[pedido.entregador.veiculoTipo] || "—"}
                    {pedido.entregador.veiculoPlaca && ` · ${pedido.entregador.veiculoPlaca}`}
                    {pedido.entregador.telefone && ` · ${pedido.entregador.telefone}`}
                  </div>
                  {acompanhando && <div className="celula-sub">Posição atualizada {tempoRelativo(pedido.entregador.localizacaoEm)}</div>}
                </div>
              </div>
              {acompanhando && <MapaEntregadores pedidos={[noMapa]} altura={240} semLegenda />}
            </section>
          )}

          <dl className="detalhes">
            {pedido.codigoExterno && <><dt>Pedido</dt><dd><strong>{pedido.codigoExterno}</strong></dd></>}
            <dt>Cliente</dt><dd>{pedido.clienteNome}{pedido.clienteTelefone && <span className="apagado"> · {pedido.clienteTelefone}</span>}</dd>
            <dt>Entrega em</dt>
            <dd>
              {pedido.endereco}
              {pedido.complemento && <div className="celula-sub">{pedido.complemento}</div>}
              {pedido.retorno && <div><span className="selo-retorno" style={{ marginLeft: 0 }}>↩ Com retorno à loja</span></div>}
            </dd>
            {pedido.agendadoPara && <><dt>Agendado</dt><dd>Entregador chamado em {dataHora(pedido.agendadoPara)}</dd></>}
            <dt>Valor</dt>
            <dd>
              {moeda(pedido.valor)}
              {pedido.acrescimoRetorno > 0 && <span className="apagado"> (inclui retorno +{moeda(pedido.acrescimoRetorno)})</span>}
            </dd>
            <dt>Distância</dt><dd>{km(pedido.distanciaKm)}</dd>
            <dt>Pagamento</dt><dd>{pedido.formaPagamento || "—"}</dd>
            <dt>Prazo</dt><dd>{pedido.prazoDesejado || "—"}</dd>
            <dt>Observação</dt><dd>{pedido.observacao || "—"}</dd>
            <dt>Criado</dt><dd>{dataHora(pedido.createdAt)}</dd>
            {pedido.entregueEm && <><dt>Entregue</dt><dd>{dataHora(pedido.entregueEm)}</dd></>}
            {pedido.notaFiscalNumero && <><dt>Nota fiscal</dt><dd>Nº {pedido.notaFiscalNumero}{pedido.notaFiscalValor != null && ` · ${moeda(pedido.notaFiscalValor)}`}</dd></>}
          </dl>

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

          <p className="apagado" style={{ fontSize: 12 }}>
            Algum problema com esta entrega? <Link to="/mensagens" className="link" onClick={onFechar}>Fale com a equipe</Link>.
          </p>
        </>
      )}
    </Gaveta>
  );
}
