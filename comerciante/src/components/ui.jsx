import { createContext, useCallback, useContext, useEffect, useState } from "react";

// ---------- Toasts ----------

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [itens, setItens] = useState([]);
  const avisar = useCallback((texto, tipo = "ok") => {
    const id = Math.random().toString(36).slice(2);
    setItens(l => [...l, { id, texto, tipo }]);
    setTimeout(() => setItens(l => l.filter(i => i.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={avisar}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {itens.map(i => (
          <div key={i.id} className={`toast toast-${i.tipo}`}>
            <span aria-hidden="true">{i.tipo === "erro" ? "⚠" : "✓"}</span> {i.texto}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// Executa uma ação da API mostrando toast de sucesso/erro. Retorna o resultado ou undefined.
export function useAcao() {
  const avisar = useToast();
  const [ocupado, setOcupado] = useState(false);
  const executar = useCallback(async (fn, mensagemOk) => {
    setOcupado(true);
    try {
      const r = await fn();
      if (mensagemOk) avisar(mensagemOk);
      return r ?? true;
    } catch (e) {
      avisar(e.message, "erro");
      return undefined;
    } finally {
      setOcupado(false);
    }
  }, [avisar]);
  return { executar, ocupado };
}

// ---------- Básicos ----------

export function Botao({ variante = "secundario", pequeno, className = "", ...props }) {
  return <button type="button" className={`btn btn-${variante} ${pequeno ? "btn-sm" : ""} ${className}`} {...props} />;
}

// Botão que pede confirmação no próprio lugar (sem window.confirm).
export function BotaoConfirmar({ children, confirmar = "Confirmar?", onConfirm, variante = "perigo", ...props }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => setAberto(false), 4000);
    return () => clearTimeout(t);
  }, [aberto]);
  if (aberto) {
    return (
      <span className="confirmar">
        <span>{confirmar}</span>
        <Botao pequeno variante={variante} onClick={() => { setAberto(false); onConfirm(); }} {...props}>Sim</Botao>
        <Botao pequeno variante="fantasma" onClick={() => setAberto(false)}>Não</Botao>
      </span>
    );
  }
  return <Botao variante={variante === "perigo" ? "perigo-leve" : variante} {...props} onClick={() => setAberto(true)}>{children}</Botao>;
}

export function Badge({ tom = "neutro", children }) {
  return <span className={`badge badge-${tom}`}>{children}</span>;
}

export function BadgeMapa({ mapa, valor }) {
  const item = mapa[valor];
  if (!item) return <Badge>{valor || "—"}</Badge>;
  return <Badge tom={item.tom}>{item.rotulo}</Badge>;
}

export function Carregando({ texto = "Carregando…" }) {
  return <div className="carregando"><span className="spinner" aria-hidden="true" />{texto}</div>;
}

export function Vazio({ titulo = "Nada por aqui", children }) {
  return (
    <div className="vazio">
      <strong>{titulo}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ErroCaixa({ erro, onTentar }) {
  if (!erro) return null;
  return (
    <div className="erro-caixa" role="alert">
      <span>{erro}</span>
      {onTentar && <Botao pequeno onClick={onTentar}>Tentar de novo</Botao>}
    </div>
  );
}

export function Cabecalho({ titulo, subtitulo, children }) {
  return (
    <div className="cabecalho">
      <div>
        <h1>{titulo}</h1>
        {subtitulo && <p className="subtitulo">{subtitulo}</p>}
      </div>
      {children && <div className="cabecalho-acoes">{children}</div>}
    </div>
  );
}

export function StatTile({ rotulo, valor, detalhe, tom, onClick, ativo }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`stat ${tom ? `stat-${tom}` : ""} ${ativo ? "stat-ativo" : ""}`} onClick={onClick}>
      <span className="stat-rotulo">{rotulo}</span>
      <span className="stat-valor">{valor}</span>
      {detalhe && <span className="stat-detalhe">{detalhe}</span>}
    </Tag>
  );
}

export function Abas({ abas, ativa, onChange }) {
  return (
    <div className="abas" role="tablist">
      {abas.map(a => (
        <button
          key={a.valor}
          type="button"
          role="tab"
          aria-selected={ativa === a.valor}
          className={ativa === a.valor ? "aba ativa" : "aba"}
          onClick={() => onChange(a.valor)}
        >
          {a.rotulo}
          {a.contagem != null && <span className="aba-contagem">{a.contagem}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Sobreposições ----------

function useEsc(onFechar) {
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onFechar]);
}

export function Modal({ titulo, onFechar, children, rodape, largo }) {
  useEsc(onFechar);
  return (
    <div className="sobreposicao" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className={`modal ${largo ? "modal-largo" : ""}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button type="button" className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

export function Gaveta({ titulo, subtitulo, onFechar, children, rodape }) {
  useEsc(onFechar);
  return (
    <div className="sobreposicao sobreposicao-gaveta" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <aside className="gaveta" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-topo">
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <div className="subtitulo">{subtitulo}</div>}
          </div>
          <button type="button" className="fechar" onClick={onFechar} aria-label="Fechar">×</button>
        </div>
        <div className="gaveta-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </aside>
    </div>
  );
}

// ---------- Formulário ----------

export function Campo({ rotulo, dica, children, largo }) {
  return (
    <label className={`campo ${largo ? "campo-largo" : ""}`}>
      <span className="campo-rotulo">{rotulo}</span>
      {children}
      {dica && <span className="campo-dica">{dica}</span>}
    </label>
  );
}

// Campo genérico dirigido por definição: { nome, rotulo, tipo, opcoes, obrigatorio, dica, largo }
export function CampoDef({ def, valor, onChange, desabilitado }) {
  const comum = {
    value: valor ?? "",
    required: def.obrigatorio,
    disabled: desabilitado || def.somenteLeitura,
    placeholder: def.placeholder,
  };
  let input;
  if (def.tipo === "select") {
    input = (
      <select {...comum} onChange={e => onChange(e.target.value)}>
        {!def.obrigatorio && <option value="">—</option>}
        {def.opcoes.map(o => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
    );
  } else if (def.tipo === "checkbox") {
    return (
      <label className={`campo campo-check ${def.largo ? "campo-largo" : ""}`}>
        <input type="checkbox" checked={!!valor} disabled={desabilitado} onChange={e => onChange(e.target.checked)} />
        <span>{def.rotulo}</span>
      </label>
    );
  } else if (def.tipo === "switch") {
    // Chave liga/desliga (checkbox com aparência de interruptor).
    return (
      <label className={`campo campo-switch ${def.largo ? "campo-largo" : ""}`}>
        <input type="checkbox" role="switch" checked={!!valor} disabled={desabilitado} onChange={e => onChange(e.target.checked)} />
        <span className="interruptor" aria-hidden="true" />
        <span>{def.rotulo}</span>
      </label>
    );
  } else if (def.tipo === "textarea") {
    input = <textarea rows={3} {...comum} onChange={e => onChange(e.target.value)} />;
  } else {
    input = (
      <input
        {...comum}
        type={def.tipo || "text"}
        step={def.tipo === "number" ? def.passo || "any" : undefined}
        onChange={e => onChange(e.target.value)}
      />
    );
  }
  return <Campo rotulo={def.rotulo + (def.obrigatorio ? " *" : "")} dica={def.dica} largo={def.largo}>{input}</Campo>;
}

// Converte os valores do formulário para o tipo que a API espera (números, vazios -> null).
export function prepararValores(defs, valores) {
  const r = {};
  defs.forEach(d => {
    if (d.somenteLeitura) return;
    let v = valores[d.nome];
    if (d.tipo === "number") v = v === "" || v == null ? null : Number(v);
    else if (d.tipo === "checkbox" || d.tipo === "switch") v = !!v;
    else if (d.tipo === "date") v = v ? `${v}T00:00:00.000Z` : null;
    else if (v === "") v = null;
    if (v !== undefined) r[d.nome] = v;
  });
  return r;
}

export function GradeCampos({ defs, valores, onChange, desabilitado }) {
  return (
    <div className="grade-campos">
      {defs.map(d => (
        <CampoDef
          key={d.nome}
          // rotulo/dica podem depender dos outros valores (ex.: tipo de aplicação muda o rótulo do valor)
          def={{ ...d, rotulo: typeof d.rotulo === "function" ? d.rotulo(valores) : d.rotulo, dica: typeof d.dica === "function" ? d.dica(valores) : d.dica }}
          valor={valores[d.nome]}
          desabilitado={desabilitado}
          onChange={v => onChange({ ...valores, [d.nome]: v })}
        />
      ))}
    </div>
  );
}
