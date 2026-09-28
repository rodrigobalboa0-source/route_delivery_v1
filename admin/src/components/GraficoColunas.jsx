import { useEffect, useMemo, useRef, useState } from "react";

// Largura real do contêiner, para o SVG desenhar em pixels 1:1 (texto do eixo
// não cresce nem encolhe quando o cartão muda de tamanho).
function useLargura(padrao = 640) {
  const ref = useRef(null);
  const [largura, setLargura] = useState(padrao);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, Math.round(e.contentRect.width))));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, largura];
}

// Colunas de série única. Segue a spec de marcas: coluna <= 24px, ponta arredondada
// de 4px e base reta, grade em hairline, tooltip por coluna e alternativa em tabela.
// Uma série só -> sem legenda (o título do cartão diz o que está plotado).
function escalaLimpa(max) {
  if (max <= 0) return { topo: 1, passos: [0, 1] };
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map(m => m * mag).find(p => p >= bruto);
  const topo = Math.ceil(max / passo) * passo;
  const passos = [];
  for (let v = 0; v <= topo + passo / 2; v += passo) passos.push(v);
  return { topo, passos };
}

function caminhoColuna(x, y, w, h) {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export default function GraficoColunas({ dados, rotuloX, valor, formatar = v => v, detalhe, titulo, altura = 195 }) {
  const [hover, setHover] = useState(null);
  const [verTabela, setVerTabela] = useState(false);
  const [refArea, largura] = useLargura();

  const margem = { topo: 12, dir: 8, base: 26, esq: 56 };
  const areaW = largura - margem.esq - margem.dir;
  const areaH = altura - margem.topo - margem.base;

  const { topo, passos } = useMemo(() => escalaLimpa(Math.max(0, ...dados.map(valor))), [dados, valor]);
  const banda = dados.length ? areaW / dados.length : areaW;
  const larguraColuna = Math.min(24, banda * 0.6);
  const y = v => margem.topo + areaH - (v / topo) * areaH;
  const maiorIndice = dados.reduce((mi, d, i, arr) => (valor(d) > valor(arr[mi]) ? i : mi), 0);
  // Rótulos do eixo X: todos se couberem, senão um a cada N.
  const cadaN = Math.max(1, Math.ceil(dados.length / Math.max(2, Math.floor(areaW / 56))));

  return (
    <div className="grafico" ref={refArea}>
      <div className="grafico-barra">
        <button type="button" className="link" onClick={() => setVerTabela(v => !v)}>
          {verTabela ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>

      {verTabela ? (
        <div className="tabela-rolagem">
          <table className="tabela tabela-compacta">
            <caption className="sr-only">{titulo}</caption>
            <thead><tr><th>Período</th><th className="num">Valor</th>{detalhe && <th>Detalhe</th>}</tr></thead>
            <tbody>
              {dados.map((d, i) => (
                <tr key={i}><td>{rotuloX(d)}</td><td className="num">{formatar(valor(d))}</td>{detalhe && <td>{detalhe(d)}</td>}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grafico-area" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${largura} ${altura}`} width={largura} height={altura} role="img" aria-label={titulo}>
            {passos.map(p => (
              <g key={p}>
                <line x1={margem.esq} x2={largura - margem.dir} y1={y(p)} y2={y(p)} className={p === 0 ? "eixo-base" : "eixo-grade"} />
                <text x={margem.esq - 8} y={y(p)} dy="0.32em" textAnchor="end" className="eixo-texto">{formatar(p)}</text>
              </g>
            ))}
            {dados.map((d, i) => {
              const v = valor(d);
              const cx = margem.esq + banda * i + banda / 2;
              const topoY = y(v);
              return (
                <g key={i}>
                  {/* Alvo de hover: a banda inteira, maior que a coluna */}
                  <rect
                    x={margem.esq + banda * i}
                    y={margem.topo}
                    width={banda}
                    height={areaH}
                    className={hover === i ? "coluna-alvo ativo" : "coluna-alvo"}
                    onMouseEnter={() => setHover(i)}
                  />
                  <path d={caminhoColuna(cx - larguraColuna / 2, topoY, larguraColuna, margem.topo + areaH - topoY)} className="coluna" pointerEvents="none" />
                  {i === maiorIndice && v > 0 && (
                    <text x={cx} y={topoY - 6} textAnchor="middle" className="rotulo-valor">{formatar(v)}</text>
                  )}
                  {i % cadaN === 0 && (
                    <text x={cx} y={altura - 8} textAnchor="middle" className="eixo-texto">{rotuloX(d)}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover != null && dados[hover] && (
            <div
              className="tooltip"
              style={{
                left: `${((margem.esq + banda * hover + banda / 2) / largura) * 100}%`,
                top: `${(y(valor(dados[hover])) / altura) * 100}%`,
              }}
            >
              <strong>{rotuloX(dados[hover])}</strong>
              <span>{formatar(valor(dados[hover]))}</span>
              {detalhe && <span className="tooltip-detalhe">{detalhe(dados[hover])}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
