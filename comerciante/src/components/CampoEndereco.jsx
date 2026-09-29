// Campo de endereço com busca no OpenStreetMap enquanto digita (e os clientes salvos da loja em cima).
// Escolher um endereço da busca já traz a posição exata no mapa; escolher um cliente preenche tudo.
import { useEffect, useId, useRef, useState } from "react";
import { api, qs } from "../api";

export default function CampoEndereco({ valor, onChange, onEscolherEndereco, onEscolherCliente, placeholder = "Rua, número, bairro", rotulo = "Endereço de entrega", obrigatorio, className = "" }) {
  const [aberto, setAberto] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [enderecos, setEnderecos] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState(null);
  const [ativo, setAtivo] = useState(-1);
  const ref = useRef(null);
  const timer = useRef(null);
  const ultima = useRef(0);
  const id = useId();

  const itens = [...clientes.map(c => ({ tipo: "cliente", c })), ...enderecos.map(e => ({ tipo: "endereco", e }))];

  function buscar(texto, espera = 350) {
    clearTimeout(timer.current);
    const n = ++ultima.current;
    setEnderecos([]); // sugestões de um texto antigo não ficam clicáveis
    setAtivo(-1);
    timer.current = setTimeout(async () => {
      setBuscando(true); setErro(null); setAberto(true);
      const [cli, end] = await Promise.all([
        api.get(`/clientes${qs({ busca: texto })}`).catch(() => []),
        texto.length >= 3 ? api.get(`/enderecos${qs({ q: texto })}`).catch(e => { if (n === ultima.current) setErro(e.message); return []; }) : Promise.resolve([]),
      ]);
      if (n !== ultima.current) return;
      setClientes(cli.slice(0, texto ? 3 : 6));
      setEnderecos(end);
      setAtivo(-1);
      setBuscando(false);
    }, espera);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!aberto) return;
    const fora = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function escolher(item) {
    clearTimeout(timer.current);
    ultima.current++;
    setAberto(false);
    if (item.tipo === "cliente") onEscolherCliente?.(item.c);
    else onEscolherEndereco(item.e);
  }

  function teclas(e) {
    if (aberto && e.key === "Enter" && ativo < 0) { e.preventDefault(); if (itens.length) escolher(itens[0]); return; }
    if (!aberto || !itens.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAtivo(a => (a + 1) % itens.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo(a => (a <= 0 ? itens.length - 1 : a - 1)); }
    else if (e.key === "Enter" && ativo >= 0) { e.preventDefault(); escolher(itens[ativo]); }
    else if (e.key === "Escape") setAberto(false);
  }

  return (
    <div className={`campo-cliente campo-endereco ${className}`} ref={ref}>
      <input
        value={valor}
        placeholder={placeholder}
        aria-label={rotulo}
        required={obrigatorio}
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={id}
        onChange={e => {
          const t = e.target.value;
          onChange(t);
          if (t.trim().length >= 3) buscar(t.trim());
          else { clearTimeout(timer.current); ultima.current++; setAberto(false); }
        }}
        onKeyDown={teclas}
        onBlur={() => { clearTimeout(timer.current); ultima.current++; setAberto(false); setBuscando(false); }}
      />
      <button type="button" className="campo-cliente-seta" tabIndex={-1} aria-label="Clientes recentes"
        onClick={() => (aberto ? setAberto(false) : buscar("", 0))}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {aberto && (
        <div className="campo-cliente-lista campo-endereco-lista" id={id} role="listbox">
          {clientes.length > 0 && <div className="lista-secao">Clientes salvos</div>}
          {clientes.map((c, i) => (
            <button key={`c${c.telefone}`} type="button" role="option" aria-selected={i === ativo} className={i === ativo ? "ativo" : ""}
              onMouseDown={e => e.preventDefault()} onClick={() => escolher({ tipo: "cliente", c })}>
              <strong>{c.nome}</strong><span> · {c.telefone}</span>
              <small>{c.endereco}{c.complemento ? ` · ${c.complemento}` : ""}</small>
            </button>
          ))}
          {(enderecos.length > 0 || buscando) && <div className="lista-secao">Endereços {buscando && <span className="apagado">— buscando…</span>}</div>}
          {enderecos.map((e, j) => {
            const i = clientes.length + j;
            return (
              <button key={`e${e.endereco}`} type="button" role="option" aria-selected={i === ativo} className={i === ativo ? "ativo" : ""}
                onMouseDown={ev => ev.preventDefault()} onClick={() => escolher({ tipo: "endereco", e })}>
                <span className="pino-sugestao" aria-hidden="true">📍</span>
                <strong>{e.titulo}</strong>
                <small>{e.subtitulo}</small>
              </button>
            );
          })}
          {!buscando && !itens.length && <div className="campo-cliente-vazio apagado">{erro || "Nenhum endereço encontrado. Confira a rua e o número."}</div>}
          <div className="lista-rodape">Endereços: © OpenStreetMap</div>
        </div>
      )}
    </div>
  );
}
