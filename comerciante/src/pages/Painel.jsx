// Painel de Controle (modelo enviado pelo cliente):
//   1) criação rápida de entrega numa linha (cliente, telefone, endereço, 📍, complemento, Retorno?, Criar Entrega);
//   2) mapa largo com barra própria (mostrar/ocultar, +, −, ver todos);
//   3) entregas em aberto, com busca e filtro.
import { useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { BadgeMapa, Botao, Carregando, ErroCaixa, useAcao } from "../components/ui";
import MapaEntregadores from "../components/MapaEntregadores";
import DetalhePedido from "../components/DetalhePedido";
import AcoesPedido from "../components/AcoesPedido";
import CampoCliente from "../components/CampoCliente";
import CampoEndereco from "../components/CampoEndereco";
import { textoValor, useFormEntrega } from "../hooks/useFormEntrega";
import { COM_ENTREGADOR, STATUS_PEDIDO, dataHora, moeda, tempoRelativo } from "../utils/format";

const VAZIO = { clienteNome: "", clienteTelefone: "", endereco: "", complemento: "", formaPagamento: "", observacao: "", agendadoPara: "" };
const PAGAMENTOS = ["Pago (online)", "Pix", "Cartão na entrega", "Dinheiro"];

export function SemRegistros({ texto = "Sem registros" }) {
  return (
    <div className="sem-registros">
      <span aria-hidden="true">×</span>
      <strong>{texto}</strong>
    </div>
  );
}

function Chave({ rotulo, ligado, onChange, titulo }) {
  return (
    <label className="chave-rapida" title={titulo}>
      <input type="checkbox" role="switch" checked={ligado} onChange={e => onChange(e.target.checked)} />
      <span className="interruptor" aria-hidden="true" />
      <span>{rotulo}</span>
    </label>
  );
}

export function AvisoCliente({ cliente }) {
  if (!cliente) return null;
  return cliente.salvo
    ? <span className="aviso-cliente salvo">✓ Cliente salvo: <strong>{cliente.c.nome}</strong> · {cliente.c.totalPedidos} pedido(s) — dados preenchidos</span>
    : <span className="aviso-cliente novo">Cliente novo — fica salvo por este telefone ao criar a entrega</span>;
}

export function ResumoValor({ calculo }) {
  const t = textoValor(calculo);
  if (!t) return null;
  return <>✓ {t.base} · <strong>{t.valor}</strong>{t.extra && <span className="apagado">{t.extra}</span>}</>;
}

function CriarRapido({ onPrevia, onCriado, retornoPercentual, comCodigo }) {
  const f = useFormEntrega({ vazio: VAZIO, onPrevia });
  const { v, mudar, calculo, retorno, ocupado } = f;
  // Pronto manual: por padrão o pedido fica "Criado" e a loja clica em "Pedido pronto" na hora certa.
  const [pronto, setPronto] = useState(false);
  const [mais, setMais] = useState(false);
  const set = k => valor => mudar(k, valor);

  async function criar(e) {
    e.preventDefault();
    const corpo = f.corpo({ pronto, agendadoPara: v.agendadoPara ? new Date(v.agendadoPara).toISOString() : null });
    const msg = v.agendadoPara ? "Entrega agendada." : pronto ? "Entrega criada! Chamando entregador." : "Entrega criada. Clique em “Pedido pronto” quando for a hora.";
    const r = await f.executar(() => api.post("/pedidos", corpo), msg);
    if (r) {
      f.limpar(); setMais(false);
      onCriado(r);
    }
  }

  return (
    <form className="criar-rapido" onSubmit={criar} aria-label="Criar entrega">
      <div className="criar-linha">
        <CampoCliente className="cr-nome" rotulo="Nome do cliente" placeholder="Nome do cliente" valor={v.clienteNome} onChange={set("clienteNome")} onEscolher={f.aplicarCliente} obrigatorio />
        <CampoCliente className="cr-tel" rotulo="Telefone" tipo="tel" placeholder={comCodigo ? "Telefone com DDD *" : "Telefone (busca o cliente)"} valor={v.clienteTelefone} onChange={set("clienteTelefone")} onEscolher={f.aplicarCliente} obrigatorio={comCodigo} />
        <CampoEndereco className="cr-end" valor={v.endereco} onChange={set("endereco")} onEscolherEndereco={f.escolherEndereco} onEscolherCliente={f.aplicarCliente} obrigatorio />
        <button type="button" className="botao-icone" onClick={() => f.calcular()} disabled={!v.endereco.trim() || ocupado} title="Ver no mapa e calcular o valor" aria-label="Ver no mapa e calcular o valor">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></svg>
        </button>
        <input className="cr-comp" value={v.complemento} onChange={e => set("complemento")(e.target.value)} placeholder="Complemento" aria-label="Complemento" />
        <Chave rotulo="Retorno?" ligado={retorno} onChange={f.setRetorno} titulo={`O entregador volta à loja depois de entregar (maquininha, troco, devolução). Acréscimo de ${retornoPercentual ?? 20}% na taxa.`} />
        <Chave rotulo="Pronto?" ligado={pronto} onChange={setPronto} titulo="Ligado: chama o entregador assim que criar. Desligado: fica “Criado” até você clicar em Pedido pronto." />
        <button type="button" className={`botao-redondo ${mais ? "ativo" : ""}`} onClick={() => setMais(m => !m)} aria-expanded={mais} aria-label="Mais opções" title="Mais opções (pagamento, observação, agendamento)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={mais ? "m6 15 6-6 6 6" : "M12 5v14M5 12h14"} /></svg>
        </button>
      </div>
      {mais && (
        <div className="criar-linha criar-mais">
          <select value={v.formaPagamento} onChange={e => set("formaPagamento")(e.target.value)} aria-label="Forma de pagamento">
            <option value="">Pagamento do cliente…</option>
            {PAGAMENTOS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className="cr-obs" value={v.observacao} onChange={e => set("observacao")(e.target.value)} placeholder="Observação para o entregador (troco, apto, interfone…)" aria-label="Observação" />
          <label className="cr-agenda">
            <span>Agendar para</span>
            <input type="datetime-local" value={v.agendadoPara} onChange={e => set("agendadoPara")(e.target.value)} aria-label="Agendar para" />
          </label>
        </div>
      )}
      <div className="criar-rodape">
        <span className="criar-calculo" aria-live="polite">
          <AvisoCliente cliente={f.cliente} />
          {comCodigo && <span className="apagado" title="O entregador só finaliza a entrega digitando este código">🔒 Código de entrega: 4 últimos números do telefone{v.clienteTelefone.replace(/\D/g, "").length >= 10 ? ` (${v.clienteTelefone.replace(/\D/g, "").slice(-4)})` : ""}</span>}
          <span className="criar-valor"><ResumoValor calculo={calculo} /></span>
          {retorno && !calculo && <span className="apagado">Retorno: +{retornoPercentual ?? 20}% na taxa</span>}
          {v.agendadoPara && <span className="apagado">⏰ entregador será chamado em {dataHora(new Date(v.agendadoPara))}</span>}
        </span>
        <button type="submit" className="btn btn-laranja" disabled={ocupado}>{v.agendadoPara ? "Agendar Entrega" : "Criar Entrega"}</button>
      </div>
    </form>
  );
}

const FILTROS = [
  { valor: "PREPARANDO", rotulo: "Criado" },
  { valor: "PENDENTE", rotulo: "Pedido pronto" },
  { valor: "COM_ENTREGADOR", rotulo: "Com entregador" },
  { valor: "ATRASADO", rotulo: "Atrasado" },
];
const casaFiltro = (p, f) => (f === "COM_ENTREGADOR" ? COM_ENTREGADOR.includes(p.status) && p.status !== "ATRASADO" : p.status === f);

function EmAberto({ pedidos, carregado, onAbrir, onPronto, ocupado, onAlterado }) {
  const [busca, setBusca] = useState("");
  const [filtros, setFiltros] = useState([]);
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [compacto, setCompacto] = useState(false);
  const q = busca.trim().toLowerCase();
  const lista = pedidos.filter(p =>
    (!filtros.length || filtros.some(f => casaFiltro(p, f))) &&
    (!q || [p.codigo, p.clienteNome, p.clienteTelefone, p.endereco, p.entregador?.nomeCompleto].some(x => x && x.toLowerCase().includes(q)))
  );

  return (
    <section className="painel-bloco em-aberto">
      <div className="em-aberto-topo">
        <span className="em-aberto-contagem">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>
          Entregas em aberto: <strong>{pedidos.length}</strong>
        </span>
      </div>
      <div className="em-aberto-ferramentas">
        <div className="busca-icone">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar" aria-label="Pesquisar entregas em aberto" />
        </div>
        <div className="topo-grupo">
          <button type="button" className="botao-icone sem-borda" onClick={() => setFiltroAberto(a => !a)} aria-expanded={filtroAberto} aria-label="Filtrar por status" title="Filtrar por status">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18l-7 9v6l-4 2v-8z" /></svg>
            <span className="contador">{filtros.length}</span>
          </button>
          {filtroAberto && (
            <div className="topo-suspenso topo-suspenso-direita filtro-suspenso">
              {FILTROS.map(f => (
                <label key={f.valor} className="campo-check">
                  <input type="checkbox" checked={filtros.includes(f.valor)} onChange={e => setFiltros(l => (e.target.checked ? [...l, f.valor] : l.filter(x => x !== f.valor)))} />
                  <span>{f.rotulo}</span>
                </label>
              ))}
              {filtros.length > 0 && <button type="button" className="link" onClick={() => setFiltros([])}>Limpar filtro</button>}
            </div>
          )}
        </div>
        <button type="button" className={`botao-icone sem-borda ${compacto ? "ativo" : ""}`} onClick={() => setCompacto(c => !c)} aria-pressed={compacto} aria-label="Lista compacta" title="Lista compacta">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>
        </button>
      </div>

      {!carregado ? <Carregando /> : lista.length === 0 ? <SemRegistros /> : (
        <div className="tabela-rolagem">
          <table className={`tabela tabela-aberto ${compacto ? "tabela-compacta" : ""}`}>
            <thead>
              <tr>
                <th>Pedido</th><th>Cliente</th><th>Status</th><th>Pedido pronto</th><th>Entregador</th><th className="num">Valor</th><th className="num">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(p => (
                <tr key={p.id} className="linha-clicavel" onClick={() => onAbrir(p.id)}>
                  <td><strong>{p.codigo}</strong>{!compacto && <div className="celula-sub">{tempoRelativo(p.createdAt)}</div>}</td>
                  <td>
                    {p.clienteNome}
                    {p.retorno && <span className="selo-retorno" title="Com retorno à loja">↩ retorno</span>}
                    {!compacto && <div className="celula-sub">{p.endereco}{p.complemento ? ` · ${p.complemento}` : ""}</div>}
                  </td>
                  <td>
                    <BadgeMapa mapa={STATUS_PEDIDO} valor={p.status} />
                    {p.agendadoPara && p.status === "PREPARANDO" && <div className="celula-sub">⏰ {dataHora(p.agendadoPara)}</div>}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    {p.status === "PREPARANDO"
                      ? <Botao pequeno variante="primario" disabled={ocupado} onClick={() => onPronto(p)}>Pedido pronto</Botao>
                      : <span className="apagado">✓ {p.prontoEm ? dataHora(p.prontoEm) : "Pronto"}</span>}
                  </td>
                  <td>{p.entregador ? `🏍 ${p.entregador.nomeCompleto}` : <span className="apagado">{p.status === "PENDENTE" ? "Procurando…" : "—"}</span>}</td>
                  <td className="num">{moeda(p.valor)}</td>
                  <td className="num" onClick={e => e.stopPropagation()}>
                    <AcoesPedido pedido={p} onDetalhes={() => onAbrir(p.id)} onAlterado={onAlterado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Painel() {
  const { loja } = useAuth();
  const mapa = useApi("/mapa", { aoVivo: ["pedidos", "entregadores"] });
  const [aberto, setAberto] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [mostrarMapa, setMostrarMapa] = useState(true);
  const controle = useRef(null);
  const { executar, ocupado } = useAcao();

  const lojaMapa = mapa.dados?.loja;
  const lojaPonto = lojaMapa ? { id: "loja", ...lojaMapa } : null;
  const pedidos = (mapa.dados?.pedidos || []).map(p => ({ ...p, loja: lojaPonto }));

  async function pronto(p) {
    if (await executar(() => api.patch(`/pedidos/${p.id}/pronto`), `Pedido de ${p.clienteNome} pronto — chamando entregador.`)) {
      mapa.recarregar({ silencioso: true });
    }
  }

  return (
    <div className="painel">
      <h1 className="sr-only">Painel de Controle — {loja?.nomeFantasia}</h1>
      <CriarRapido onPrevia={setPrevia} onCriado={() => mapa.recarregar({ silencioso: true })} retornoPercentual={loja?.retornoPercentual} comCodigo={!!loja?.permissoes?.codigoTelefone} />
      <ErroCaixa erro={mapa.erro} onTentar={() => mapa.recarregar()} />

      <div className="painel-grade">
        <div className="painel-principal">
          <div className="mapa-barra" role="toolbar" aria-label="Mapa">
            <button type="button" className={`mb mb-verde ${mostrarMapa ? "" : "desligado"}`} onClick={() => setMostrarMapa(m => !m)} aria-pressed={mostrarMapa} title={mostrarMapa ? "Ocultar mapa" : "Mostrar mapa"} aria-label={mostrarMapa ? "Ocultar mapa" : "Mostrar mapa"}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
            <button type="button" className="mb" disabled={!mostrarMapa} onClick={() => controle.current?.mais()} aria-label="Aproximar" title="Aproximar">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <button type="button" className="mb" disabled={!mostrarMapa} onClick={() => controle.current?.menos()} aria-label="Afastar" title="Afastar">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
            </button>
            <button type="button" className="mb" disabled={!mostrarMapa} onClick={() => controle.current?.verTodos()} aria-label="Ver todos no mapa" title="Ver todos">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            </button>
          </div>
          {mostrarMapa && (
            <div className="painel-mapa">
              {!mapa.dados ? <Carregando /> : (
                <MapaEntregadores pedidos={pedidos} loja={lojaPonto} altura="clamp(380px, 62vh, 760px)" onPedido={p => setAberto(p.id)} carregado controle={controle} previa={previa} semLegenda />
              )}
            </div>
          )}
          <EmAberto pedidos={pedidos} carregado={!!mapa.dados} onAbrir={setAberto} onPronto={pronto} ocupado={ocupado} onAlterado={() => mapa.recarregar({ silencioso: true })} />
        </div>
      </div>

      {aberto && <DetalhePedido id={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}
