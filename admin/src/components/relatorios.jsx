// Peças compartilhadas pelas telas de relatório: período, tabela ordenável e exportação CSV.
import { useMemo, useState } from "react";
import { Botao, Carregando, Vazio } from "./ui";
import { paraInputData } from "../utils/format";

function diasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return paraInputData(d);
}

// Estado do período { desde, ate } (AAAA-MM-DD) com padrão "últimos N dias".
export function usePeriodo(diasPadrao = 30) {
  const [p, setP] = useState({ desde: diasAtras(diasPadrao - 1), ate: paraInputData(new Date()) });
  return [p, setP];
}

const ATALHOS = [
  { rotulo: "Hoje", dias: 1 },
  { rotulo: "7 dias", dias: 7 },
  { rotulo: "30 dias", dias: 30 },
  { rotulo: "90 dias", dias: 90 },
];

export function FiltroPeriodo({ valor, onChange, children }) {
  const hoje = paraInputData(new Date());
  const ativo = ATALHOS.find(a => valor.ate === hoje && valor.desde === diasAtras(a.dias - 1));
  return (
    <div className="filtros filtro-periodo">
      <div className="segmentado" role="group" aria-label="Atalhos de período">
        {ATALHOS.map(a => (
          <button key={a.dias} type="button" className={ativo === a ? "ativo" : ""} aria-pressed={ativo === a}
            onClick={() => onChange({ desde: diasAtras(a.dias - 1), ate: hoje })}>
            {a.rotulo}
          </button>
        ))}
      </div>
      <label className="campo-inline">De <input type="date" value={valor.desde} max={valor.ate} onChange={e => onChange({ ...valor, desde: e.target.value })} /></label>
      <label className="campo-inline">até <input type="date" value={valor.ate} min={valor.desde} onChange={e => onChange({ ...valor, ate: e.target.value })} /></label>
      {children}
    </div>
  );
}

// Um único dia (roteirização, trajeto).
export function FiltroDia({ valor, onChange, children }) {
  return (
    <div className="filtros filtro-periodo">
      <label className="campo-inline">Dia <input type="date" value={valor} max={paraInputData(new Date())} onChange={e => onChange(e.target.value)} /></label>
      <Botao pequeno variante="fantasma" onClick={() => onChange(paraInputData(new Date()))}>Hoje</Botao>
      {children}
    </div>
  );
}

// ---------- CSV ----------

function celulaCsv(v) {
  if (v == null) return "";
  if (v instanceof Date) v = v.toLocaleString("pt-BR");
  if (typeof v === "number") return String(v).replace(".", ","); // Excel pt-BR
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Baixa um CSV separado por ";" com BOM (abre com acentos certos no Excel).
export function baixarCsv(nomeArquivo, colunas, linhas) {
  const cab = colunas.map(c => celulaCsv(c.rotulo)).join(";");
  const corpo = linhas.map(l => colunas.map(c => celulaCsv(c.csv ? c.csv(l) : c.ordenar ? c.ordenar(l) : l[c.chave])).join(";"));
  const blob = new Blob(["﻿" + [cab, ...corpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Tabela ----------
// colunas: [{ chave, rotulo, valor?(linha) -> exibição, ordenar?(linha) -> valor p/ ordenar e CSV, csv?(linha), num? }]
export function TabelaRelatorio({ colunas, linhas, carregando, vazio = "Nenhum dado no período", nomeCsv, rodape, chaveLinha = (l, i) => l.id || i, onLinha }) {
  const [ordem, setOrdem] = useState(null); // { chave, desc }

  const ordenadas = useMemo(() => {
    if (!linhas || !ordem) return linhas || [];
    const col = colunas.find(c => c.chave === ordem.chave);
    const val = l => (col.ordenar ? col.ordenar(l) : l[col.chave]);
    return [...linhas].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR");
      return ordem.desc ? -r : r;
    });
  }, [linhas, ordem, colunas]);

  function ordenarPor(chave) {
    setOrdem(o => (o?.chave === chave ? (o.desc ? null : { chave, desc: true }) : { chave, desc: false }));
  }

  return (
    <div className="cartao cartao-tabela">
      {nomeCsv && linhas?.length > 0 && (
        <div className="tabela-barra">
          <span className="apagado">{linhas.length} linha(s)</span>
          <Botao pequeno onClick={() => baixarCsv(nomeCsv, colunas, ordenadas)}>⬇ Exportar CSV</Botao>
        </div>
      )}
      {carregando && !linhas ? <Carregando /> : !linhas?.length ? <Vazio titulo={vazio} /> : (
        <div className="tabela-rolagem">
          <table className={`tabela ${onLinha ? "tabela-clicavel" : ""}`}>
            <thead>
              <tr>
                {colunas.map(c => (
                  <th key={c.chave} className={c.num ? "num" : ""} aria-sort={ordem?.chave === c.chave ? (ordem.desc ? "descending" : "ascending") : "none"}>
                    <button type="button" className="th-ordenar" onClick={() => ordenarPor(c.chave)}>
                      {c.rotulo}
                      <span aria-hidden="true">{ordem?.chave === c.chave ? (ordem.desc ? " ▼" : " ▲") : ""}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((l, i) => (
                <tr key={chaveLinha(l, i)} onClick={onLinha ? () => onLinha(l) : undefined}>
                  {colunas.map(c => <td key={c.chave} className={c.num ? "num" : ""}>{c.valor ? c.valor(l) : l[c.chave] ?? "—"}</td>)}
                </tr>
              ))}
            </tbody>
            {rodape && <tfoot><tr>{rodape}</tr></tfoot>}
          </table>
        </div>
      )}
    </div>
  );
}

// Minutos -> "1 h 05 min" / "12 min".
export function duracao(min) {
  if (min == null) return "—";
  if (min > 0 && min < 1) return "< 1 min";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

export const porcento = v => (v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
