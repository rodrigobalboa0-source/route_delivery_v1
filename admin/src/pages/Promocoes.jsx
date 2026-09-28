// Promoção — campanhas para os entregadores, exibidas no app com aviso (pop-up)
// quando são ativadas e quando são desativadas/encerradas.
import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { Abas, Badge, Botao, BotaoConfirmar, Cabecalho, Campo, Carregando, ErroCaixa, Modal, Vazio, useAcao } from "../components/ui";
import PreviaApp, { periodoTexto } from "../components/PreviaApp";
import { VEICULOS, numero } from "../utils/format";
import { reduzirImagem } from "../utils/imagem";

const SITUACAO = {
  ATIVA: { rotulo: "● Ativa no app", tom: "ok" },
  AGENDADA: { rotulo: "Agendada", tom: "info" },
  INATIVA: { rotulo: "Inativa", tom: "apagado" },
  ENCERRADA: { rotulo: "Encerrada", tom: "neutro" },
};

// ISO -> valor de <input type="datetime-local"> no horário local
function paraInputDataHora(v) {
  if (!v) return "";
  const d = new Date(v);
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const VAZIA = { titulo: "", descricao: "", premio: "", fotoUrl: "", inicio: "", fim: "", veiculos: [], ativa: false };

function Editor({ promocao, onFechar, onSalvo }) {
  const novo = !promocao;
  const [v, setV] = useState(() => (novo ? VAZIA : {
    ...VAZIA, ...promocao,
    descricao: promocao.descricao || "", premio: promocao.premio || "", fotoUrl: promocao.fotoUrl || "",
    inicio: paraInputDataHora(promocao.inicio), fim: paraInputDataHora(promocao.fim),
  }));
  const [modoPrevia, setModoPrevia] = useState("ativada");
  const [erroFoto, setErroFoto] = useState(null);
  const { executar, ocupado } = useAcao();
  const set = campo => e => setV({ ...v, [campo]: e.target.value });

  async function escolherFoto(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    try {
      setErroFoto(null);
      setV({ ...v, fotoUrl: await reduzirImagem(arquivo, 1080, 0.82) });
    } catch (err) {
      setErroFoto(err.message);
    }
  }

  function alternarVeiculo(vei) {
    setV({ ...v, veiculos: v.veiculos.includes(vei) ? v.veiculos.filter(x => x !== vei) : [...v.veiculos, vei] });
  }

  async function salvar(e) {
    e.preventDefault();
    const corpo = {
      titulo: v.titulo, descricao: v.descricao, premio: v.premio, fotoUrl: v.fotoUrl || null, veiculos: v.veiculos,
      inicio: v.inicio ? new Date(v.inicio).toISOString() : null,
      fim: v.fim ? new Date(v.fim).toISOString() : null,
      ...(novo ? { ativa: v.ativa } : {}),
    };
    const r = await executar(
      () => (novo ? api.post("/promocoes-entregador", corpo) : api.put(`/promocoes-entregador/${promocao.id}`, corpo)),
      novo ? (v.ativa ? "Promoção criada e ativada — os entregadores serão avisados." : "Promoção criada.") : "Promoção salva."
    );
    if (r) onSalvo();
  }

  return (
    <Modal titulo={novo ? "Nova promoção" : "Editar promoção"} onFechar={onFechar} largo>
      <form onSubmit={salvar} className="editor-promo">
        <div>
          <Campo rotulo="Foto da promoção" dica="Aparece no pop-up e na lista do app. Formato deitado (ex.: 1080×600) fica melhor.">
            <div className="foto-promo-campo">
              {v.fotoUrl ? <img src={v.fotoUrl} alt="Foto da promoção" /> : <div className="foto-vazia" aria-hidden="true">🎁</div>}
              <div className="botoes">
                <input type="file" accept="image/*" onChange={escolherFoto} aria-label="Escolher foto da promoção" />
                {v.fotoUrl && <button type="button" className="link link-perigo" onClick={() => setV({ ...v, fotoUrl: "" })}>Remover foto</button>}
              </div>
            </div>
            {erroFoto && <span className="campo-erro">{erroFoto}</span>}
          </Campo>
          <div className="grade-campos" style={{ marginTop: 10 }}>
            <Campo rotulo="Título *" largo><input value={v.titulo} onChange={set("titulo")} maxLength={80} required placeholder="Ex.: Semana turbinada" /></Campo>
            <Campo rotulo="Prêmio" largo dica="Destaque curto, ex.: “R$ 20 de bônus”, “+R$ 2 por entrega”.">
              <input value={v.premio} onChange={set("premio")} maxLength={60} />
            </Campo>
            <Campo rotulo="Descrição / regras" largo>
              <textarea rows={3} value={v.descricao} onChange={set("descricao")} maxLength={600} placeholder="Ex.: Faça 30 entregas até domingo e ganhe R$ 20." />
            </Campo>
            <Campo rotulo="Início" dica="Vazio = assim que ativar."><input type="datetime-local" value={v.inicio} onChange={set("inicio")} /></Campo>
            <Campo rotulo="Fim" dica="Vazio = até desativar."><input type="datetime-local" value={v.fim} min={v.inicio || undefined} onChange={set("fim")} /></Campo>
          </div>
          <div className="campo" style={{ marginTop: 10 }}>
            <span className="campo-rotulo">Para quais entregadores</span>
            <div className="dias-semana">
              {Object.entries(VEICULOS).map(([k, r]) => (
                <label key={k} className={v.veiculos.includes(k) ? "dia marcado" : "dia"}>
                  <input type="checkbox" checked={v.veiculos.includes(k)} onChange={() => alternarVeiculo(k)} /> {r}
                </label>
              ))}
            </div>
            <span className="campo-dica">Nenhum marcado = todos os entregadores.</span>
          </div>
          {novo && (
            <label className="campo campo-switch" style={{ marginTop: 12 }}>
              <input type="checkbox" role="switch" checked={v.ativa} onChange={e => setV({ ...v, ativa: e.target.checked })} />
              <span className="interruptor" aria-hidden="true" />
              <span>Ativar ao salvar (os entregadores recebem o aviso)</span>
            </label>
          )}
          <div className="form-rodape">
            <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
            <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar</button>
          </div>
        </div>

        <div className="previa-coluna">
          <div className="segmentado" role="group" aria-label="Prévia">
            {[["ativada", "Pop-up ao ativar"], ["encerrada", "Ao desativar"], ["lista", "Lista"]].map(([m, r]) => (
              <button key={m} type="button" className={modoPrevia === m ? "ativo" : ""} aria-pressed={modoPrevia === m} onClick={() => setModoPrevia(m)}>{r}</button>
            ))}
          </div>
          <PreviaApp promocao={v} modo={modoPrevia} />
        </div>
      </form>
    </Modal>
  );
}

export default function Promocoes() {
  const { podeEditar } = useAuth();
  const pode = podeEditar("promocoes");
  const { dados, erro, carregando, recarregar } = useApi("/promocoes-entregador", { intervaloMs: 30000 });
  const [filtro, setFiltro] = useState("");
  const [editando, setEditando] = useState(null); // null | "nova" | promoção
  const { executar, ocupado } = useAcao();

  const lista = (dados || []).filter(p => !filtro || p.situacao === filtro);
  const contar = s => (dados || []).filter(p => p.situacao === s).length;

  async function alternar(p) {
    const ativar = !p.ativa;
    if (await executar(() => api.patch(`/promocoes-entregador/${p.id}/${ativar ? "ativar" : "desativar"}`),
      ativar ? "Promoção ativada — os entregadores recebem o aviso no app." : "Promoção desativada — os entregadores recebem o aviso de encerramento.")) {
      recarregar({ silencioso: true });
    }
  }

  return (
    <>
      <Cabecalho titulo="Promoção" subtitulo="Campanhas para os entregadores. Aparecem no app e geram um aviso na tela quando são ativadas e desativadas.">
        {pode && <Botao variante="primario" onClick={() => setEditando("nova")}>+ Nova promoção</Botao>}
      </Cabecalho>
      <ErroCaixa erro={erro} onTentar={() => recarregar()} />
      <Abas ativa={filtro} onChange={setFiltro} abas={[
        { valor: "", rotulo: "Todas", contagem: dados?.length ?? 0 },
        { valor: "ATIVA", rotulo: "Ativas", contagem: contar("ATIVA") },
        { valor: "AGENDADA", rotulo: "Agendadas", contagem: contar("AGENDADA") },
        { valor: "INATIVA", rotulo: "Inativas", contagem: contar("INATIVA") },
        { valor: "ENCERRADA", rotulo: "Encerradas", contagem: contar("ENCERRADA") },
      ]} />

      {carregando && !dados ? <Carregando /> : lista.length === 0 ? (
        <Vazio titulo="Nenhuma promoção aqui">{pode && "Crie uma promoção com foto para aparecer no app dos entregadores."}</Vazio>
      ) : (
        <div className="grade-promocoes">
          {lista.map(p => {
            const s = SITUACAO[p.situacao];
            return (
              <article key={p.id} className="cartao-promo">
                {p.fotoUrl ? <img className="cartao-promo-foto" src={p.fotoUrl} alt="" /> : <div className="cartao-promo-foto foto-vazia" aria-hidden="true">🎁</div>}
                <div className="cartao-promo-corpo">
                  <div className="cartao-promo-topo">
                    <Badge tom={s.tom}>{s.rotulo}</Badge>
                    {p.veiculos.length > 0 && <span className="apagado">{p.veiculos.map(x => VEICULOS[x]).join(", ")}</span>}
                  </div>
                  <strong>{p.titulo}</strong>
                  {p.premio && <span className="app-premio">{p.premio}</span>}
                  {p.descricao && <p>{p.descricao}</p>}
                  <small className="apagado">{periodoTexto(p)}</small>
                  <small className="apagado">Aviso visto por {numero(p.visualizacoes)} entregador(es)</small>
                </div>
                {pode && (
                  <div className="cartao-promo-acoes">
                    <Botao pequeno variante="fantasma" onClick={() => setEditando(p)}>Editar</Botao>
                    {p.situacao !== "ENCERRADA" && (
                      <BotaoConfirmar
                        pequeno
                        variante={p.ativa ? "perigo" : "primario"}
                        confirmar={p.ativa ? "Desativar? Os entregadores serão avisados." : "Ativar? Os entregadores serão avisados."}
                        disabled={ocupado}
                        onConfirm={() => alternar(p)}
                      >
                        {p.ativa ? "Desativar" : "Ativar"}
                      </BotaoConfirmar>
                    )}
                    {(!p.ativa || p.situacao === "ENCERRADA") && (
                      <BotaoConfirmar pequeno confirmar="Excluir?" onConfirm={async () => {
                        if (await executar(() => api.del(`/promocoes-entregador/${p.id}`), "Promoção excluída.")) recarregar({ silencioso: true });
                      }}>Excluir</BotaoConfirmar>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {editando && (
        <Editor
          promocao={editando === "nova" ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); recarregar({ silencioso: true }); }}
        />
      )}
    </>
  );
}
