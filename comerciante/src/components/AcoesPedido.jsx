// Menu "Ações" do pedido no sistema da loja (Painel, Fila e detalhe do pedido).
//   Antes do aceite: Pedido pronto, Editar, Detalhes, Finalizar*, Copiar link de rastreio, Escrever observação, Editar comércio*,
//                    Reprocurar (pedido pronto), Cancelar
//   Depois do aceite: + Editar entregador*, Bloquear entregador*, Trocar entregador (sem Reprocurar)
//   (* só quando o ADM libera em Configurações › Permissões da loja)
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Botao, Campo, Carregando, Modal, useAcao, useToast } from "./ui";
import CampoEndereco from "./CampoEndereco";
import EditarPedido from "./EditarPedido";
import { CancelarIfood } from "./NegociacaoIfood";
import { COM_ENTREGADOR, VEICULOS } from "../utils/format";
import { reduzirImagem } from "../utils/imagem";

const FINAIS = ["ENTREGUE", "CANCELADO"];
export const linkRastreio = token => `${window.location.origin}/rastreio/${token}`;

// Confirmação simples (com texto opcional, ex.: motivo).
function Confirmar({ titulo, texto, botao, variante = "primario", campo, onConfirmar, onFechar }) {
  const [valor, setValor] = useState("");
  const { executar, ocupado } = useAcao();
  async function ok(e) {
    e.preventDefault();
    if (await executar(() => onConfirmar(valor.trim()))) onFechar(true);
  }
  return (
    <Modal titulo={titulo} onFechar={() => onFechar(false)}>
      <form onSubmit={ok}>
        <p style={{ marginTop: 0 }}>{texto}</p>
        {campo && <Campo rotulo={campo} largo><textarea rows={2} value={valor} onChange={e => setValor(e.target.value)} maxLength={300} /></Campo>}
        <div className="form-rodape">
          <Botao variante="fantasma" onClick={() => onFechar(false)}>Voltar</Botao>
          <button type="submit" className={`btn btn-${variante}`} disabled={ocupado}>{botao}</button>
        </div>
      </form>
    </Modal>
  );
}

function Observacao({ pedido, onFechar }) {
  const [texto, setTexto] = useState(pedido.observacao || "");
  const { executar, ocupado } = useAcao();
  async function salvar(e) {
    e.preventDefault();
    if (await executar(() => api.put(`/pedidos/${pedido.id}`, { observacao: texto }), "Observação salva. O entregador já vê no app.")) onFechar(true);
  }
  return (
    <Modal titulo={`Observação — ${pedido.codigo}`} onFechar={() => onFechar(false)}>
      <form onSubmit={salvar}>
        <Campo rotulo="Observação para o entregador" dica="Aparece em destaque no app do entregador (troco, interfone, ponto de referência…)." largo>
          <textarea rows={4} value={texto} onChange={e => setTexto(e.target.value)} maxLength={500} autoFocus />
        </Campo>
        <div className="form-rodape">
          <Botao variante="fantasma" onClick={() => onFechar(false)}>Cancelar</Botao>
          <button type="submit" className="btn btn-laranja" disabled={ocupado}>Salvar observação</button>
        </div>
      </form>
    </Modal>
  );
}

// "Editar" a partir da lista: carrega o pedido completo antes de abrir o formulário.
function EditarDaLista({ pedido, pct, onFechar }) {
  const [completo, setCompleto] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => { api.get(`/pedidos/${pedido.id}`).then(setCompleto).catch(e => setErro(e.message)); }, [pedido.id]);
  if (erro) return <Modal titulo="Editar" onFechar={() => onFechar(false)}><p>{erro}</p></Modal>;
  if (!completo) return <Modal titulo="Editar" onFechar={() => onFechar(false)}><Carregando /></Modal>;
  return <EditarPedido pedido={completo} pct={pct} onFechar={() => onFechar(false)} onSalvo={() => onFechar(true)} />;
}

function TrocarEntregador({ pedido, onFechar }) {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState(null);
  const { executar, ocupado } = useAcao();
  useEffect(() => { api.get("/entregadores-disponiveis").then(setLista).catch(e => setErro(e.message)); }, []);
  const outros = (lista || []).filter(e => e.id !== pedido.entregador?.id);
  async function escolher(e) {
    if (await executar(() => api.patch(`/pedidos/${pedido.id}/trocar-entregador`, { entregadorId: e.id }), `Corrida passada para ${e.nomeCompleto}. O celular dele já foi avisado.`)) onFechar(true);
  }
  return (
    <Modal titulo={`Trocar entregador — ${pedido.codigo}`} onFechar={() => onFechar(false)}>
      <p className="apagado" style={{ marginTop: 0 }}>Entregadores online que podem pegar corridas da sua loja (mais perto primeiro). A corrida passa direto para quem você escolher.</p>
      {erro ? <p>{erro}</p> : !lista ? <Carregando /> : outros.length === 0 ? <p className="apagado">Nenhum outro entregador online agora. Tente de novo em instantes.</p> : (
        <ul className="lista-escolha">
          {outros.map(e => (
            <li key={e.id}>
              <span className="avatar" aria-hidden="true">{e.fotoUrl ? <img src={e.fotoUrl} alt="" /> : e.nomeCompleto[0]}</span>
              <span className="lista-escolha-texto">
                <strong>{e.nomeCompleto}</strong>
                <small>{VEICULOS[e.veiculoTipo] || "—"}{e.veiculoPlaca ? ` · ${e.veiculoPlaca}` : ""}{e.distanciaKm != null ? ` · ${String(e.distanciaKm).replace(".", ",")} km da loja` : ""}{e.emAndamento ? ` · ${e.emAndamento} em andamento` : " · livre"}</small>
              </span>
              <Botao pequeno variante="primario" disabled={ocupado} onClick={() => escolher(e)}>Escolher</Botao>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function EditarEntregador({ pedido, onFechar }) {
  const [v, setV] = useState(null);
  const [erro, setErro] = useState(null);
  const { executar, ocupado } = useAcao();
  useEffect(() => {
    api.get(`/pedidos/${pedido.id}`).then(p => {
      const e = p.entregador || {};
      setV({ id: e.id, nomeCompleto: e.nomeCompleto || "", telefone: e.telefone || "", veiculoTipo: e.veiculoTipo || "MOTO", veiculoModelo: e.veiculoModelo || "", veiculoPlaca: e.veiculoPlaca || "", veiculoAno: e.veiculoAno || "" });
    }).catch(e => setErro(e.message));
  }, [pedido.id]);
  const set = k => e => setV({ ...v, [k]: e.target.value });
  async function salvar(e) {
    e.preventDefault();
    const { id, ...corpo } = v;
    if (await executar(() => api.put(`/entregadores/${id}`, corpo), "Dados do entregador salvos.")) onFechar(true);
  }
  return (
    <Modal titulo="Editar entregador" onFechar={() => onFechar(false)}>
      {erro ? <p>{erro}</p> : !v ? <Carregando /> : (
        <form onSubmit={salvar} className="grade-campos">
          <Campo rotulo="Nome completo *" largo><input value={v.nomeCompleto} onChange={set("nomeCompleto")} required /></Campo>
          <Campo rotulo="Telefone"><input value={v.telefone} onChange={set("telefone")} /></Campo>
          <Campo rotulo="Veículo">
            <select value={v.veiculoTipo} onChange={set("veiculoTipo")}>
              {Object.entries(VEICULOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Modelo"><input value={v.veiculoModelo} onChange={set("veiculoModelo")} /></Campo>
          <Campo rotulo="Placa"><input value={v.veiculoPlaca} onChange={e => setV({ ...v, veiculoPlaca: e.target.value.toUpperCase() })} maxLength={8} /></Campo>
          <Campo rotulo="Ano"><input value={v.veiculoAno} onChange={set("veiculoAno")} maxLength={4} inputMode="numeric" /></Campo>
          <p className="apagado campo-largo" style={{ margin: 0 }}>A alteração fica registrada no histórico do entregador e a equipe é avisada.</p>
          <div className="form-rodape campo-largo">
            <Botao variante="fantasma" onClick={() => onFechar(false)}>Cancelar</Botao>
            <button type="submit" className="btn btn-laranja" disabled={ocupado}>Salvar</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function EditarComercio({ onFechar }) {
  const { loja, recarregarLoja } = useAuth();
  const end = loja.enderecos?.find(e => e.principal) || loja.enderecos?.[0] || {};
  const [v, setV] = useState({ nomeFantasia: loja.nomeFantasia || "", nomeCompleto: loja.nomeCompleto || "", telefone: loja.telefone || "", fotoUrl: loja.fotoUrl || "" });
  const textoEnd = e => [e.rua && `${e.rua}${e.numero ? `, ${e.numero}` : ""}`, e.bairro, e.cidade].filter(Boolean).join(" - ");
  const [busca, setBusca] = useState(textoEnd(end));
  const [novoEnd, setNovoEnd] = useState(null);
  const [complemento, setComplemento] = useState(end.complemento || "");
  const [referencia, setReferencia] = useState(end.referencia || "");
  const { executar, ocupado } = useAcao();
  const avisar = useToast();
  const set = k => e => setV({ ...v, [k]: e.target.value });

  async function foto(e) {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    try { setV({ ...v, fotoUrl: await reduzirImagem(arq, 256) }); } catch (err) { avisar(err.message, "erro"); }
  }

  async function salvar(e) {
    e.preventDefault();
    const corpo = { ...v };
    const mudouEnd = novoEnd || complemento !== (end.complemento || "") || referencia !== (end.referencia || "");
    if (busca !== textoEnd(end) && !novoEnd) return avisar("Escolha o novo endereço de coleta na lista de sugestões.", "erro");
    if (mudouEnd) {
      const base = novoEnd || { rua: end.rua, numero: end.numero, bairro: end.bairro, cidade: end.cidade, cep: end.cep, lat: end.lat, lng: end.lng };
      corpo.endereco = { ...base, complemento, referencia };
    }
    if (await executar(() => api.put("/me", corpo), "Dados da loja salvos.")) {
      await recarregarLoja().catch(() => {});
      onFechar(true);
    }
  }

  return (
    <Modal titulo="Editar comércio" onFechar={() => onFechar(false)} largo>
      <form onSubmit={salvar} className="grade-campos">
        <div className="campo campo-largo foto-loja-edicao">
          <span className="avatar avatar-grande" aria-hidden="true">{v.fotoUrl ? <img src={v.fotoUrl} alt="" /> : (v.nomeFantasia || "?")[0]}</span>
          <label className="btn btn-secundario btn-sm">
            {v.fotoUrl ? "Trocar logo" : "Enviar logo"}
            <input type="file" accept="image/*" hidden onChange={foto} />
          </label>
          {v.fotoUrl && <Botao pequeno variante="fantasma" onClick={() => setV({ ...v, fotoUrl: "" })}>Remover</Botao>}
          <small className="campo-dica">A logo aparece para o entregador quando a corrida toca.</small>
        </div>
        <Campo rotulo="Nome da loja *"><input value={v.nomeFantasia} onChange={set("nomeFantasia")} required /></Campo>
        <Campo rotulo="Responsável"><input value={v.nomeCompleto} onChange={set("nomeCompleto")} /></Campo>
        <Campo rotulo="Telefone"><input value={v.telefone} onChange={set("telefone")} /></Campo>
        <Campo rotulo="Endereço de coleta" largo dica="Mudar o endereço muda o km e o preço das próximas entregas.">
          <CampoEndereco valor={busca} onChange={t => { setBusca(t); setNovoEnd(null); }}
            onEscolherEndereco={x => { setBusca(x.endereco); setNovoEnd({ rua: x.rua || x.titulo, numero: x.numero || "", bairro: x.bairro || "", cidade: x.cidade || "", cep: x.cep || "", lat: x.lat, lng: x.lng }); }} />
        </Campo>
        <Campo rotulo="Complemento"><input value={complemento} onChange={e => setComplemento(e.target.value)} /></Campo>
        <Campo rotulo="Referência para o entregador"><input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ex.: portão lateral" /></Campo>
        <div className="form-rodape campo-largo">
          <Botao variante="fantasma" onClick={() => onFechar(false)}>Cancelar</Botao>
          <button type="submit" className="btn btn-laranja" disabled={ocupado}>Salvar dados da loja</button>
        </div>
      </form>
    </Modal>
  );
}

function LinkRastreio({ link, onFechar }) {
  return (
    <Modal titulo="Link de rastreio" onFechar={() => onFechar(false)}>
      <p style={{ marginTop: 0 }}>Não deu para copiar sozinho. Selecione o link e copie (Ctrl+C):</p>
      <input value={link} readOnly onFocus={e => e.target.select()} autoFocus style={{ width: "100%" }} />
    </Modal>
  );
}

// pedido: { id, codigo, status, observacao, rastreio, entregador?: { id, nomeCompleto } }
export default function AcoesPedido({ pedido, onDetalhes, onAlterado, rotulo = "Ações" }) {
  const { loja } = useAuth();
  const perm = loja?.permissoes || {};
  const [aberto, setAberto] = useState(false);
  const [modal, setModal] = useState(null);
  const { executar, ocupado } = useAcao();
  const avisar = useToast();
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = e => { if (!ref.current?.contains(e.target)) setAberto(false); };
    const esc = e => { if (e.key === "Escape") setAberto(false); };
    const fechar = () => setAberto(false);
    // Fase de captura: o próprio menu interrompe a propagação (para não abrir a linha da tabela).
    document.addEventListener("mousedown", fora, true);
    document.addEventListener("keydown", esc, true);
    window.addEventListener("resize", fechar);
    window.addEventListener("scroll", fechar, true);
    return () => {
      document.removeEventListener("mousedown", fora, true); document.removeEventListener("keydown", esc, true);
      window.removeEventListener("resize", fechar); window.removeEventListener("scroll", fechar, true);
    };
  }, [aberto]);

  // Lista fixa na tela, abaixo do botão (ou acima, se não couber) — não fica cortada dentro de tabelas com rolagem.
  function abrir(e) {
    if (aberto) return setAberto(false);
    const r = e.currentTarget.getBoundingClientRect();
    const alturaEstimada = 44 + 36 * 12;
    const acima = r.bottom + alturaEstimada > window.innerHeight && r.top > window.innerHeight / 2;
    setAberto({
      right: Math.max(8, window.innerWidth - r.right),
      ...(acima ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
      maxHeight: acima ? r.top - 12 : window.innerHeight - r.bottom - 12,
    });
  }

  if (FINAIS.includes(pedido.status)) return null;
  const comEntregador = COM_ENTREGADOR.includes(pedido.status) && pedido.entregador;
  const fechar = mudou => { setModal(null); if (mudou) onAlterado?.(); };

  async function copiarLink() {
    const link = linkRastreio(pedido.rastreio);
    try {
      await navigator.clipboard.writeText(link);
      avisar("Link de rastreio copiado. Cole na conversa com o cliente.");
    } catch {
      setModal({ tipo: "link", link });
    }
  }

  const itens = [
    pedido.status === "PREPARANDO" && { rotulo: "✓ Pedido pronto — chamar entregador", destaque: true, acao: async () => { if (await executar(() => api.patch(`/pedidos/${pedido.id}/pronto`), "Pedido pronto! Chamando entregador.")) onAlterado?.(); } },
    { rotulo: "✎ Editar", acao: () => setModal({ tipo: "editar" }) },
    onDetalhes && { rotulo: "☰ Detalhes", acao: onDetalhes },
    perm.finalizar && { rotulo: "✔ Finalizar pedido", acao: () => setModal({ tipo: "finalizar" }) },
    pedido.rastreio && { rotulo: "🔗 Copiar link de rastreio", acao: copiarLink },
    { rotulo: "✍ Escrever observação", acao: () => setModal({ tipo: "observacao" }) },
    perm.editarComercio && { rotulo: "🏪 Editar comércio", acao: () => setModal({ tipo: "comercio" }) },
    comEntregador && perm.editarEntregador && { rotulo: "🛵 Editar entregador", acao: () => setModal({ tipo: "entregador" }) },
    comEntregador && perm.bloquearEntregador && { rotulo: "⛔ Bloquear entregador", acao: () => setModal({ tipo: "bloquear" }) },
    comEntregador && { rotulo: "⇄ Trocar entregador", acao: () => setModal({ tipo: "trocar" }) },
    // Reprocurar: só antes do aceite (pedido pronto, sem entregador e fora da espera da roteirização).
    pedido.status === "PENDENTE" && !pedido.entregador && !pedido.aguardandoRotaAte && { rotulo: "↻ Reprocurar", acao: () => setModal({ tipo: "reprocurar" }) },
    { rotulo: "✕ Cancelar", perigo: true, acao: () => setModal({ tipo: "cancelar" }) },
  ].filter(Boolean);

  const nomeEnt = pedido.entregador?.nomeCompleto;
  return (
    <span className="menu-acoes" ref={ref} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
      <button type="button" className="btn btn-secundario btn-sm menu-acoes-botao" onClick={abrir} aria-haspopup="menu" aria-expanded={!!aberto} disabled={ocupado}>
        {rotulo} <span aria-hidden="true">▾</span>
      </button>
      {aberto && (
        <ul className="menu-acoes-lista" role="menu" style={aberto}>
          {itens.map(i => (
            <li key={i.rotulo} role="none">
              <button type="button" role="menuitem" className={i.perigo ? "perigo" : i.destaque ? "destaque" : ""} onClick={() => { setAberto(false); i.acao(); }}>{i.rotulo}</button>
            </li>
          ))}
        </ul>
      )}

      {modal?.tipo === "editar" && <EditarDaLista pedido={pedido} pct={loja?.retornoPercentual ?? 20} onFechar={fechar} />}
      {modal?.tipo === "observacao" && <Observacao pedido={pedido} onFechar={fechar} />}
      {modal?.tipo === "trocar" && <TrocarEntregador pedido={pedido} onFechar={fechar} />}
      {modal?.tipo === "entregador" && <EditarEntregador pedido={pedido} onFechar={fechar} />}
      {modal?.tipo === "comercio" && <EditarComercio onFechar={fechar} />}
      {modal?.tipo === "link" && <LinkRastreio link={modal.link} onFechar={fechar} />}
      {modal?.tipo === "finalizar" && (
        <Confirmar titulo={`Finalizar ${pedido.codigo}?`} botao="Finalizar pedido" variante="primario" onFechar={fechar}
          texto={comEntregador ? `O pedido fica como entregue por ${nomeEnt} (conta nos ganhos dele).` : "O pedido fica como entregue, sem entregador."}
          onConfirmar={() => api.patch(`/pedidos/${pedido.id}/finalizar`).then(r => { avisar("Pedido finalizado."); return r; })} />
      )}
      {modal?.tipo === "reprocurar" && (
        <Confirmar titulo="Reprocurar entregador?" botao="Chamar de novo" variante="primario" onFechar={fechar}
          texto="Os entregadores online são chamados de novo, com alarme, inclusive quem recusou esta corrida."
          onConfirmar={() => api.patch(`/pedidos/${pedido.id}/reprocurar`).then(r => { avisar("Chamando os entregadores de novo."); return r; })} />
      )}
      {modal?.tipo === "bloquear" && (
        <Confirmar titulo={`Bloquear ${nomeEnt}?`} botao="Bloquear na minha loja" variante="perigo" campo="Motivo (opcional)" onFechar={fechar}
          texto={`${nomeEnt} sai desta corrida e não recebe mais corridas da sua loja (continua trabalhando para outras lojas). A equipe é avisada e pode desfazer.`}
          onConfirmar={motivo => api.post(`/entregadores/${pedido.entregador.id}/bloquear`, { motivo, pedidoId: pedido.id }).then(r => { avisar(r.mensagem); return r; })} />
      )}
      {modal?.tipo === "cancelar" && pedido.integracaoSlug === "ifood" && (
        <CancelarIfood pedido={pedido} onFechar={(mudou, msg) => { if (msg) avisar(msg); fechar(mudou); }} />
      )}
      {modal?.tipo === "cancelar" && pedido.integracaoSlug !== "ifood" && (
        <Confirmar titulo={`Cancelar ${pedido.codigo}?`} botao="Cancelar pedido" variante="perigo" campo="Motivo (opcional)" onFechar={fechar}
          texto={comEntregador ? `${nomeEnt} já aceitou: a corrida some do app dele na hora.` : "Os entregadores deixam de ver esta corrida."}
          onConfirmar={motivo => api.patch(`/pedidos/${pedido.id}/cancelar`, { motivo }).then(r => { avisar("Pedido cancelado."); return r; })} />
      )}
    </span>
  );
}
