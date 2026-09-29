// Campo com sugestões de clientes que já receberam entregas da loja (a setinha abre as mais recentes).
// Escolher uma sugestão preenche nome, telefone, endereço e complemento de uma vez.
import { useEffect, useId, useRef, useState } from "react";
import { api, qs } from "../api";

export default function CampoCliente({ valor, onChange, onEscolher, placeholder, rotulo, tipo = "text", obrigatorio, autoFocus, className = "" }) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState([]);
  const [ativo, setAtivo] = useState(-1);
  const ref = useRef(null);
  const timer = useRef(null);
  const ultima = useRef(0);
  const id = useId();

  // Busca as sugestões (com uma pausa curta enquanto digita); só a resposta mais recente vale.
  // Digitando: só abre se houver cliente parecido. Pela setinha: abre sempre (com aviso se vazio).
  function carregar(busca, espera = 250, sempre = false) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const n = ++ultima.current;
      api.get(`/clientes${qs({ busca })}`).then(r => {
        if (n !== ultima.current) return;
        setLista(r); setAtivo(-1); setAberto(sempre || r.length > 0);
      }).catch(() => {});
    }, espera);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!aberto) return;
    const fora = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function escolher(c) {
    clearTimeout(timer.current);
    ultima.current++;
    onEscolher(c);
    setAberto(false);
  }

  function teclas(e) {
    if (!aberto || !lista.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo(a => (a + 1) % lista.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo(a => (a <= 0 ? lista.length - 1 : a - 1)); }
    else if (e.key === "Enter" && ativo >= 0) { e.preventDefault(); escolher(lista[ativo]); }
    else if (e.key === "Escape") setAberto(false);
  }

  return (
    <div className={`campo-cliente ${className}`} ref={ref}>
      <input
        type={tipo}
        value={valor}
        placeholder={placeholder}
        aria-label={rotulo}
        required={obrigatorio}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={id}
        onChange={e => {
          const t = e.target.value;
          onChange(t);
          if (t.trim().length >= 2) carregar(t.trim());
          else { clearTimeout(timer.current); ultima.current++; setAberto(false); }
        }}
        onKeyDown={teclas}
        onBlur={() => { clearTimeout(timer.current); ultima.current++; setAberto(false); }}
      />
      <button type="button" className="campo-cliente-seta" tabIndex={-1} aria-label={`Clientes recentes (${rotulo})`}
        onClick={() => (aberto ? setAberto(false) : carregar("", 0, true))}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {aberto && (
        <ul className="campo-cliente-lista" id={id} role="listbox">
          {lista.length === 0 && <li className="apagado campo-cliente-vazio">Nenhum cliente anterior encontrado.</li>}
          {lista.map((c, i) => (
            <li key={`${c.nome}|${c.endereco}`} role="option" aria-selected={i === ativo}>
              <button type="button" className={i === ativo ? "ativo" : ""} onMouseDown={e => e.preventDefault()} onClick={() => escolher(c)}>
                <strong>{c.nome}</strong>{c.telefone && <span> · {c.telefone}</span>}
                <small>{c.endereco}{c.complemento ? ` · ${c.complemento}` : ""}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
