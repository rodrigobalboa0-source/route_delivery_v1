// Operação › Pedidos • Acompanhamento
// Mapa dos entregadores, resumo da alocação, filtros, contadores por status e a lista de pedidos.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, qs } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { BadgeMapa, Botao, Carregando, ErroCaixa, Modal, Vazio, useAcao, useToast } from "../components/ui";
import MapaEntregadores from "../components/MapaEntregadores";
import DetalhePedido from "../components/DetalhePedido";
import SeletorStatus from "../components/SeletorStatus";
import { COM_ENTREGADOR, ORIGEM_PEDIDO, STATUS_PEDIDO, VEICULOS, moeda, numero, paraInputData, tempoRelativo } from "../utils/format";

// Contadores na ordem da tela; "Total" é calculado.
const CONTADORES = [
  { status: "PREPARANDO", rotulo: "Criado" },
  { status: "PENDENTE", rotulo: "Pedido Pronto" },
  { status: "ATRIBUIDO", rotulo: "Atribuída" },
  { status: "NA_LOJA", rotulo: "Na loja" },
  { status: "EM_ROTA", rotulo: "Em Rota" },
  { status: "NO_CLIENTE", rotulo: "Cheguei no cliente" },
  { status: "ENTREGUE", rotulo: "Entregue" },
  { status: "CANCELADO", rotulo: "Cancelada" },
  { status: "ATRASADO", rotulo: "Atrasado" },
];

const hora = d => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const ATRIBUIVEL = ["PREPARANDO", "PENDENTE", "ATRASADO"];
const podeAtribuir = p => ATRIBUIVEL.includes(p.status) && !p.entregador;

// Ícones em traço (herdam a cor do texto).
const Icone = {
  pessoa: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></svg>,
  check: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></svg>,
  caminhao: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></svg>,
  mais: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  lupa: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>,
  rota: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8" /></svg>,
};

// Pode entrar numa rota manual: pronto, sem entregador e fora de outra rota.
const podeRoteirizar = p => p.status === "PENDENTE" && !p.entregador && !p.rota;

// Selo "R-12345 · 2/3" no pedido que está numa rota.
export function SeloRota({ p }) {
  if (!p.rota) return null;
  const total = p.rota._count?.pedidos;
  return (
    <span className="selo-rota" title={`Rota ${p.rota.origem === "MANUAL" ? "manual" : "automática"}${p.rota.aceitaEm ? " · aceita" : " · aguardando entregador"}`}>
      🧭 {p.rota.codigo}{p.ordemRota ? ` · ${p.ordemRota}/${total}` : ""}
    </span>
  );
}

function CardInfo({ icone, titulo, subtitulo, tom, onClick }) {
  return (
    <button type="button" className={`op-card ${tom ? `op-card-${tom}` : ""}`} onClick={onClick}>
      <span className="op-card-icone">{icone}</span>
      <span>
        <strong>{titulo}</strong>
        <small>{subtitulo}</small>
      </span>
    </button>
  );
}

function ModalAtribuir({ pedidos, ignorados, onFechar, onConcluido }) {
  const { dados } = useApi("/entregadores?status=ATIVO");
  const [entregadorId, setEntregadorId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const avisar = useToast();

  // Online primeiro, depois por nome.
  const entregadores = (dados || [])
    .filter(e => !e.bloqueado)
    .sort((a, b) => Number(b.online) - Number(a.online) || a.nomeCompleto.localeCompare(b.nomeCompleto));

  async function atribuir() {
    setEnviando(true);
    let ok = 0;
    const falhas = [];
    for (const p of pedidos) {
      try {
        await api.patch(`/pedidos/${p.id}/aceitar`, { entregadorId });
        ok++;
      } catch (e) {
        falhas.push(`${p.codigo}: ${e.message}`);
      }
    }
    setEnviando(false);
    if (ok) avisar(`${ok} pedido(s) atribuído(s).`);
    if (falhas.length) avisar(`Não atribuídos — ${falhas.join(" · ")}`, "erro");
    onConcluido();
  }

  return (
    <Modal
      titulo="Atribuir entregador"
      onFechar={onFechar}
      rodape={<>
        <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" disabled={!entregadorId || !pedidos.length || enviando} onClick={atribuir}>
          {enviando ? "Atribuindo…" : `Atribuir ${pedidos.length} pedido(s)`}
        </Botao>
      </>}
    >
      {pedidos.length === 0 ? (
        <Vazio titulo="Nenhum pedido aguardando entregador">
          Selecione pedidos na tabela ou aguarde novos pedidos prontos.
        </Vazio>
      ) : (
        <>
          <p className="apagado">
            {ignorados > 0 && `${ignorados} pedido(s) selecionado(s) já têm entregador ou estão finalizados e foram ignorados. `}
            O entregador escolhido recebe estas corridas e elas passam para “Atribuída”.
          </p>
          <ul className="lista-atribuir">
            {pedidos.map(p => (
              <li key={p.id}>
                <strong>{p.codigo}</strong>
                <span>{p.comercio?.nomeFantasia} → {p.clienteNome}</span>
                <BadgeMapa mapa={STATUS_PEDIDO} valor={p.status} />
              </li>
            ))}
          </ul>
          <label className="campo">
            <span className="campo-rotulo">Entregador</span>
            <select value={entregadorId} onChange={e => setEntregadorId(e.target.value)}>
              <option value="">Escolha o entregador…</option>
              {entregadores.map(e => (
                <option key={e.id} value={e.id}>
                  {e.online ? "● " : ""}{e.nomeCompleto} · {VEICULOS[e.veiculoTipo]}{e.online ? " · online" : ""}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </Modal>
  );
}

export default function Operacao() {
  const navegar = useNavigate();
  const { podeEditar } = useAuth();
  const pode = podeEditar("pedidos");
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const abrir = params.get("abrir");

  const hoje = paraInputData(new Date());
  const [cidadeDigitada, setCidadeDigitada] = useState("");
  const [cidade, setCidade] = useState("");
  const [comercioId, setComercioId] = useState("");
  const [origem, setOrigem] = useState("");
  const [desde, setDesde] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [selecionados, setSelecionados] = useState(new Set());
  const [atribuir, setAtribuir] = useState(null); // null | lista de pedidos alvo
  const { executar, ocupado } = useAcao();

  useEffect(() => {
    const t = setTimeout(() => setCidade(cidadeDigitada.trim()), 400);
    return () => clearTimeout(t);
  }, [cidadeDigitada]);

  // Datas vão sem fuso ("T00:00:00") para o servidor interpretar no horário local.
  // incluirAbertos: pedido ainda em aberto aparece mesmo que tenha sido criado antes do período escolhido.
  const filtros = {
    cidade, comercioId, origem, incluirAbertos: "1",
    desde: desde ? `${desde}T00:00:00` : "",
    ate: ate ? `${ate}T23:59:59` : "",
  };

  const lista = useApi(`/pedidos${qs({ ...filtros, status, limite: 500 })}`, { intervaloMs: 60000, aoVivo: ["pedidos"] });
  const contagem = useApi(`/pedidos/contagem${qs(filtros)}`, { intervaloMs: 60000, aoVivo: ["pedidos"] });
  const geral = useApi("/pedidos/contagem", { intervaloMs: 60000, aoVivo: ["pedidos"] }); // estado atual, sem filtros
  const online = useApi("/entregadores/online", { intervaloMs: 60000, aoVivo: ["entregadores"] });
  // Pedidos em aberto no mapa (segue os filtros de loja, cidade e origem, mas não o de datas).
  const caminhoMapa = `/pedidos/mapa${qs({ comercioId, cidade, origem })}`;
  const mapa = useApi(caminhoMapa, { intervaloMs: 60000, aoVivo: ["pedidos", "entregadores"] });
  const avisarNovo = useToast();
  const vistosNoMapa = useRef({ caminho: null, ids: null });
  useEffect(() => {
    if (!mapa.dados) return;
    const ids = new Set(mapa.dados.map(p => p.id));
    const antes = vistosNoMapa.current;
    // Na primeira carga (ou ao trocar o filtro) só memoriza; depois avisa cada pedido novo que uma loja lançou.
    if (antes.ids && antes.caminho === caminhoMapa) {
      mapa.dados.filter(p => !antes.ids.has(p.id)).slice(0, 3)
        .forEach(p => avisarNovo(`Novo pedido ${p.codigo} de ${p.loja.nome} para ${p.clienteNome}`));
    }
    vistosNoMapa.current = { caminho: caminhoMapa, ids };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapa.dados]);
  const contagemEntregadores = useApi("/entregadores/contagem", { intervaloMs: 60000, aoVivo: ["entregadores"] });
  const { dados: cidades } = useApi("/pedidos/cidades");
  const { dados: comercios } = useApi("/comercios");

  const pedidos = lista.dados || [];
  const c = contagem.dados || {};
  const total = Object.values(c).reduce((s, n) => s + n, 0);
  const g = geral.dados || {};
  const emAndamento = COM_ENTREGADOR.reduce((s, k) => s + (g[k] || 0), 0);
  const semEntregador = g.PENDENTE || 0;
  const qtdOnline = contagemEntregadores.dados?.online ?? 0;

  // Mantém na seleção só os pedidos que continuam visíveis.
  const idsVisiveis = useMemo(() => new Set(pedidos.map(p => p.id)), [pedidos]);
  const selecionadosVisiveis = pedidos.filter(p => selecionados.has(p.id));
  const todosMarcados = pedidos.length > 0 && selecionadosVisiveis.length === pedidos.length;

  function mudarParam(chave, valor) {
    const p = new URLSearchParams(params);
    if (valor) p.set(chave, valor); else p.delete(chave);
    setParams(p, { replace: true });
  }

  function alternar(id) {
    const n = new Set([...selecionados].filter(x => idsVisiveis.has(x)));
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelecionados(n);
  }

  function alternarTodos() {
    setSelecionados(todosMarcados ? new Set() : new Set(pedidos.map(p => p.id)));
  }

  function atualizar() {
    lista.recarregar({ silencioso: true });
    contagem.recarregar({ silencioso: true });
    geral.recarregar({ silencioso: true });
    online.recarregar({ silencioso: true });
    mapa.recarregar({ silencioso: true });
  }

  function abrirAtribuir(alvo) {
    if (alvo) return setAtribuir({ pedidos: [alvo], ignorados: 0 });
    if (selecionadosVisiveis.length) {
      const aptos = selecionadosVisiveis.filter(podeAtribuir);
      return setAtribuir({ pedidos: aptos, ignorados: selecionadosVisiveis.length - aptos.length });
    }
    // Sem seleção: todos os pedidos prontos sem entregador da lista atual.
    setAtribuir({ pedidos: pedidos.filter(p => p.status === "PENDENTE" && !p.entregador), ignorados: 0 });
  }

  // Roteirização manual: os pedidos prontos selecionados viram uma rota oferecida aos entregadores.
  async function roteirizar() {
    const aptos = selecionadosVisiveis.filter(podeRoteirizar);
    const ignorados = selecionadosVisiveis.length - aptos.length;
    const r = await executar(() => api.post("/rotas", { pedidoIds: aptos.map(p => p.id) }),
      aptos.length >= 2 ? `Rota montada com ${aptos.length} entregas${ignorados ? ` (${ignorados} pedido(s) não entraram: precisam estar prontos, sem entregador e fora de outra rota)` : ""}. Os entregadores já foram chamados.` : undefined);
    if (r) { setSelecionados(new Set()); atualizar(); }
  }

  async function acaoRapida(p, rota, msg) {
    if (await executar(() => api.patch(`/pedidos/${p.id}/${rota}`), msg)) atualizar();
  }

  function limparFiltros() {
    setCidadeDigitada(""); setCidade(""); setComercioId(""); setOrigem(""); setDesde(hoje); setAte(hoje);
    mudarParam("status", "");
  }

  const filtrosAtivos = cidade || comercioId || origem || status || desde !== hoje || ate !== hoje;

  return (
    <div className="operacao">
      <h1 className="op-titulo">Pedidos • Acompanhamento</h1>

      <section className="op-mapa">
        <MapaEntregadores entregadores={online.dados || []} pedidos={mapa.dados || []} carregado={mapa.dados != null && online.dados != null} altura="clamp(440px, 64vh, 820px)" onPedido={p => mudarParam("abrir", p.id)} />
      </section>

      <section className="op-cards">
        <CardInfo
          icone={Icone.pessoa}
          titulo={`${numero(qtdOnline)} ${qtdOnline === 1 ? "Entregador" : "Entregadores"}`}
          subtitulo="Online"
          onClick={() => navegar("/cadastros/entregadores")}
        />
        <CardInfo
          icone={Icone.check}
          titulo={emAndamento === 0 ? "Todas Finalizadas" : `${numero(emAndamento)} Em andamento`}
          subtitulo="Entregas"
          tom={g.ATRASADO > 0 ? "critico" : undefined}
          onClick={() => mudarParam("status", emAndamento ? "EM_ROTA" : "ENTREGUE")}
        />
        <CardInfo
          icone={Icone.caminhao}
          titulo={semEntregador === 0 ? "Todas Atribuídas" : `${numero(semEntregador)} Sem entregador`}
          subtitulo="Alocação"
          tom={semEntregador > 0 ? "aviso" : undefined}
          onClick={() => mudarParam("status", "PENDENTE")}
        />
        <button type="button" className="op-acao op-acao-atribuir" disabled={!pode} onClick={() => abrirAtribuir()}>
          {Icone.pessoa}
          <span>Atribuir{selecionadosVisiveis.length > 0 && <small>{selecionadosVisiveis.length} selecionado(s)</small>}</span>
        </button>
        <button type="button" className="op-acao op-acao-rota" disabled={!pode || ocupado || selecionadosVisiveis.filter(podeRoteirizar).length < 2} onClick={roteirizar}
          title="Selecione 2 ou mais pedidos prontos sem entregador para montar uma rota">
          {Icone.rota}
          <span>Roteirizar{selecionadosVisiveis.length > 0 ? <small>{selecionadosVisiveis.filter(podeRoteirizar).length} pronto(s) selecionado(s)</small> : <small>selecione 2+ prontos</small>}</span>
        </button>
        <button type="button" className="op-acao op-acao-nova" disabled={!pode} onClick={() => navegar("/nova-entrega")}>
          {Icone.mais}
          <span>Nova Entrega</span>
        </button>
      </section>

      <section className="op-filtros">
        <label className="op-campo-busca">
          <input
            list="op-cidades"
            placeholder="Cidade (Todas)"
            aria-label="Cidade"
            value={cidadeDigitada}
            onChange={e => setCidadeDigitada(e.target.value)}
          />
          {Icone.lupa}
          <datalist id="op-cidades">{(cidades || []).map(x => <option key={x} value={x} />)}</datalist>
        </label>
        <select className="op-campo" value={comercioId} onChange={e => setComercioId(e.target.value)} aria-label="Comércio">
          <option value="">Comércio (Todos)</option>
          {(comercios || []).map(x => <option key={x.id} value={x.id}>{x.nomeFantasia}</option>)}
        </select>
        <select className="op-campo" value={status} onChange={e => mudarParam("status", e.target.value)} aria-label="Status">
          <option value="">Status (todos)</option>
          {CONTADORES.map(x => <option key={x.status} value={x.status}>{x.rotulo}</option>)}
        </select>
        <select className="op-campo" value={origem} onChange={e => setOrigem(e.target.value)} aria-label="Origem">
          <option value="">Origem (todas)</option>
          {Object.entries(ORIGEM_PEDIDO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
        <input className="op-campo op-data" type="date" value={desde} max={ate || undefined} onChange={e => setDesde(e.target.value)} aria-label="Data inicial" />
        <div className="op-data-linha">
          <input className="op-campo op-data" type="date" value={ate} min={desde || undefined} onChange={e => setAte(e.target.value)} aria-label="Data final" />
          {filtrosAtivos && <button type="button" className="link" onClick={limparFiltros}>Limpar filtros</button>}
        </div>
      </section>

      <section className="op-status">
        {CONTADORES.map(x => (
          <button
            key={x.status}
            type="button"
            className={`op-status-card ${status === x.status ? "ativo" : ""}`}
            aria-pressed={status === x.status}
            onClick={() => mudarParam("status", status === x.status ? "" : x.status)}
          >
            <span>{x.rotulo}</span>
            <strong>{numero(c[x.status] || 0)}</strong>
          </button>
        ))}
        <button type="button" className={`op-status-card op-status-total ${!status ? "ativo" : ""}`} onClick={() => mudarParam("status", "")}>
          <span>Total</span>
          <strong>{numero(total)}</strong>
        </button>
      </section>

      <ErroCaixa erro={lista.erro} onTentar={() => lista.recarregar()} />

      <section className="op-tabela-caixa">
        <div className="tabela-rolagem">
          <table className="tabela op-tabela">
            <thead>
              <tr>
                <th className="col-check">
                  <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} aria-label="Selecionar todos" disabled={!pedidos.length} />
                </th>
                <th>Nº Pedido</th><th>Comércio</th><th>Cliente</th><th>Coleta</th><th>Entrega</th>
                <th className="num">Taxa</th><th>Status</th><th>Pedido pronto</th><th>Entregador</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.carregando && !lista.dados ? (
                <tr><td colSpan={11}><Carregando /></td></tr>
              ) : pedidos.length === 0 ? (
                <tr><td colSpan={11} className="op-vazio">Nenhum pedido encontrado.</td></tr>
              ) : pedidos.map(p => {
                const coleta = p.comercio?.enderecos?.[0];
                return (
                  <tr key={p.id} className={selecionados.has(p.id) ? "selecionada" : ""} onClick={() => mudarParam("abrir", p.id)}>
                    <td className="col-check" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Selecionar ${p.codigo}`} />
                    </td>
                    <td>
                      <strong>{p.codigo}</strong>
                      <div className="celula-sub">{tempoRelativo(p.createdAt)}</div>
                      <SeloRota p={p} />
                      {p.aguardandoRotaAte && <div className="selo-rota" title="Roteirização automática: esperando outros pedidos para montar rota">⏳ roteirizando…</div>}
                    </td>
                    <td>{p.comercio?.nomeFantasia}</td>
                    <td>
                      {p.clienteNome}
                      {p.clienteTelefone && <div className="celula-sub">{p.clienteTelefone}</div>}
                    </td>
                    <td>
                      {coleta ? `${coleta.rua}${coleta.numero ? ", " + coleta.numero : ""}` : <span className="apagado">—</span>}
                      {coleta?.bairro && <div className="celula-sub">{coleta.bairro}</div>}
                    </td>
                    <td><div className="celula-endereco">{p.endereco}</div></td>
                    <td className="num">{moeda(p.valor)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {pode
                        ? <SeletorStatus pedido={p} onAlterado={atualizar} onPrecisaEntregador={abrirAtribuir} compacto />
                        : <BadgeMapa mapa={STATUS_PEDIDO} valor={p.status} />}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      {p.status === "PREPARANDO"
                        ? (pode
                          ? <Botao pequeno variante="primario" disabled={ocupado} onClick={() => acaoRapida(p, "pronto", `${p.codigo}: pedido pronto — liberado para os motoboys.`)}>Pedido pronto</Botao>
                          : <span className="apagado">Aguardando</span>)
                        : p.prontoEm
                          ? <span className="pronto-ok">✓ Pronto {hora(p.prontoEm)}</span>
                          : <span className="apagado">—</span>}
                    </td>
                    <td>{p.entregador?.nomeCompleto || <span className="apagado">—</span>}</td>
                    <td className="acoes-celula" onClick={e => e.stopPropagation()}>
                      {pode && podeAtribuir(p) && p.status !== "PREPARANDO" && (
                        <Botao pequeno onClick={() => abrirAtribuir(p)}>Atribuir</Botao>
                      )}
                      {pode && COM_ENTREGADOR.includes(p.status) && (
                        <Botao pequeno disabled={ocupado} onClick={() => acaoRapida(p, "finalizar", `${p.codigo} finalizado.`)}>Finalizar</Botao>
                      )}
                      <Botao pequeno variante="fantasma" onClick={() => mudarParam("abrir", p.id)}>Ver</Botao>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {abrir && <DetalhePedido key={abrir} id={abrir} onFechar={() => mudarParam("abrir", null)} onAlterado={atualizar} />}
      {atribuir && (
        <ModalAtribuir
          pedidos={atribuir.pedidos}
          ignorados={atribuir.ignorados}
          onFechar={() => setAtribuir(null)}
          onConcluido={() => { setAtribuir(null); setSelecionados(new Set()); atualizar(); }}
        />
      )}
    </div>
  );
}
