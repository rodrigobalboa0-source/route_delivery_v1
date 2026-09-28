import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { Abas, Badge, Botao, Cabecalho, Campo, Carregando, ErroCaixa, Modal, Vazio, useAcao } from "../components/ui";
import { dataHora, tempoRelativo } from "../utils/format";

function Conversa({ id, onEnviada }) {
  const { podeEditar } = useAuth();
  const { dados, erro, recarregar } = useApi(`/mensagens/${id}`, { intervaloMs: 10000 });
  const [texto, setTexto] = useState("");
  const { executar, ocupado } = useAcao();
  const fim = useRef(null);

  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [dados?.mensagens?.length]);

  async function enviar(e) {
    e.preventDefault();
    if (!texto.trim()) return;
    if (await executar(() => api.post(`/mensagens/${id}`, { texto }))) {
      setTexto("");
      await recarregar({ silencioso: true });
      onEnviada();
    }
  }

  if (erro) return <ErroCaixa erro={erro} />;
  if (!dados) return <Carregando />;

  return (
    <div className="chat">
      <div className="chat-topo">
        <strong>{dados.nome}</strong>
        <Badge tom={dados.tipo === "ENTREGADOR" ? "info" : "neutro"}>{dados.tipo === "ENTREGADOR" ? "Entregador" : "Cliente"}</Badge>
      </div>
      <div className="chat-mensagens">
        {dados.mensagens.length === 0 && <Vazio titulo="Nenhuma mensagem ainda" />}
        {dados.mensagens.map(m => (
          <div key={m.id} className={`bolha ${m.de === "NOS" ? "bolha-nos" : "bolha-eles"}`}>
            <span>{m.texto}</span>
            <small>{dataHora(m.createdAt)}</small>
          </div>
        ))}
        <div ref={fim} />
      </div>
      {podeEditar("mensagens") && (
        <form className="chat-envio" onSubmit={enviar}>
          <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escreva uma mensagem…" aria-label="Mensagem" />
          <button type="submit" className="btn btn-primario" disabled={ocupado || !texto.trim()}>Enviar</button>
        </form>
      )}
    </div>
  );
}

function NovaConversa({ onFechar, onCriada }) {
  const { dados: entregadores } = useApi("/entregadores?status=ATIVO");
  const [tipo, setTipo] = useState("ENTREGADOR");
  const [nome, setNome] = useState("");
  const { executar, ocupado } = useAcao();

  async function criar(e) {
    e.preventDefault();
    const r = await executar(() => api.post("/mensagens", { nome, tipo }), "Conversa criada.");
    if (r) onCriada(r);
  }

  return (
    <Modal titulo="Nova conversa" onFechar={onFechar}>
      <form onSubmit={criar} className="grade-campos">
        <Campo rotulo="Com quem" largo>
          <select value={tipo} onChange={e => { setTipo(e.target.value); setNome(""); }}>
            <option value="ENTREGADOR">Entregador</option>
            <option value="CLIENTE">Cliente</option>
          </select>
        </Campo>
        <Campo rotulo={tipo === "ENTREGADOR" ? "Entregador" : "Nome do cliente"} largo>
          {tipo === "ENTREGADOR" ? (
            <select value={nome} onChange={e => setNome(e.target.value)} required>
              <option value="">Selecione…</option>
              {(entregadores || []).map(x => <option key={x.id} value={`${x.nomeCompleto} (entregador)`}>{x.nomeCompleto}</option>)}
            </select>
          ) : (
            <input value={nome} onChange={e => setNome(e.target.value)} required />
          )}
        </Campo>
        <div className="form-rodape campo-largo">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-primario" disabled={ocupado}>Criar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Mensagens() {
  const { podeEditar } = useAuth();
  const lista = useApi("/mensagens", { intervaloMs: 15000 });
  const [filtro, setFiltro] = useState("");
  const [aberta, setAberta] = useState(null);
  const [nova, setNova] = useState(false);

  const conversas = (lista.dados || []).filter(c => !filtro || c.tipo === filtro);

  return (
    <>
      <Cabecalho titulo="Mensagens" subtitulo="Atendimento a clientes e suporte aos entregadores">
        {podeEditar("mensagens") && <Botao variante="primario" onClick={() => setNova(true)}>+ Nova conversa</Botao>}
      </Cabecalho>
      <ErroCaixa erro={lista.erro} onTentar={() => lista.recarregar()} />

      <div className="mensagens">
        <aside className="cartao lista-conversas">
          <Abas ativa={filtro} onChange={setFiltro} abas={[
            { valor: "", rotulo: "Todas" }, { valor: "ENTREGADOR", rotulo: "Entregadores" }, { valor: "CLIENTE", rotulo: "Clientes" },
          ]} />
          {!lista.dados ? <Carregando /> : conversas.length === 0 ? <Vazio titulo="Nenhuma conversa" /> : (
            <ul>
              {conversas.map(c => (
                <li key={c.id}>
                  <button type="button" className={`conversa-item ${aberta === c.id ? "ativa" : ""}`} onClick={() => setAberta(c.id)}>
                    <span className="conversa-nome">
                      {c.naoLida && <span className="ponto-nao-lida" aria-label="não lida" />}
                      <strong>{c.nome}</strong>
                    </span>
                    <span className="conversa-previa">{c.mensagens[0]?.texto || "Sem mensagens"}</span>
                    <small>{c.mensagens[0] ? tempoRelativo(c.mensagens[0].createdAt) : ""}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className="cartao">
          {aberta ? (
            <Conversa key={aberta} id={aberta} onEnviada={() => lista.recarregar({ silencioso: true })} />
          ) : (
            <Vazio titulo="Selecione uma conversa">Escolha uma conversa à esquerda para ler e responder.</Vazio>
          )}
        </section>
      </div>

      {nova && <NovaConversa onFechar={() => setNova(false)} onCriada={c => { setNova(false); lista.recarregar({ silencioso: true }); setAberta(c.id); }} />}
    </>
  );
}
