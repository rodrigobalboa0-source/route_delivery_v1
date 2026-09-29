// Campo de endereço com busca no OpenStreetMap enquanto digita (Nova Entrega e cadastro do comércio).
// Escolher uma sugestão devolve { endereco, rua, numero, bairro, cidade, uf, cep, lat, lng, exato }.
import { useEffect, useId, useRef, useState } from "react";
import { api, qs } from "../api";

export default function BuscaEndereco({ valor, onChange, onEscolher, comercioId, placeholder = "Rua, número, bairro", rotulo = "Endereço", obrigatorio, autoFocus }) {
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState(null);
  const [ativo, setAtivo] = useState(-1);
  const ref = useRef(null);
  const timer = useRef(null);
  const ultima = useRef(0);
  const id = useId();

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!aberto) return;
    const fora = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function buscar(texto) {
    clearTimeout(timer.current);
    const n = ++ultima.current;
    setItens([]); // sugestões de um texto antigo não ficam clicáveis
    setAtivo(-1);
    if (texto.trim().length < 3) { setAberto(false); return; }
    timer.current = setTimeout(async () => {
      setBuscando(true); setErro(null); setAberto(true);
      try {
        const r = await api.get(`/nova-entrega/enderecos${qs({ q: texto.trim(), comercioId })}`);
        if (n === ultima.current) { setItens(r); setAtivo(-1); }
      } catch (e) {
        if (n === ultima.current) { setItens([]); setErro(e.message); }
      } finally {
        if (n === ultima.current) setBuscando(false);
      }
    }, 350);
  }

  function escolher(e) {
    clearTimeout(timer.current);
    ultima.current++;
    setAberto(false);
    onEscolher(e);
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
    <div className="busca-endereco" ref={ref}>
      <input
        value={valor}
        onChange={e => { onChange(e.target.value); buscar(e.target.value); }}
        onKeyDown={teclas}
        placeholder={placeholder}
        aria-label={rotulo}
        required={obrigatorio}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={id}
      />
      {aberto && (
        <div className="busca-endereco-lista" id={id} role="listbox">
          {buscando && !itens.length && <div className="busca-endereco-vazio">Buscando…</div>}
          {!buscando && !itens.length && <div className="busca-endereco-vazio">{erro || "Nenhum endereço encontrado. Confira a rua e o número."}</div>}
          {itens.map((e, i) => (
            <button key={e.endereco} type="button" role="option" aria-selected={i === ativo} className={i === ativo ? "ativo" : ""}
              onMouseDown={ev => ev.preventDefault()} onClick={() => escolher(e)}>
              <strong>📍 {e.titulo}</strong>
              <small>{e.subtitulo}</small>
            </button>
          ))}
          <div className="busca-endereco-rodape">Endereços: © OpenStreetMap</div>
        </div>
      )}
    </div>
  );
}
