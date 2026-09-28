// Integrações — catálogo com a situação de cada uma.
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { Badge, Cabecalho, Carregando, ErroCaixa } from "../components/ui";
import { numero } from "../utils/format";

// Sigla no lugar do logotipo (não usamos marcas de terceiros).
const sigla = nome => nome.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).map(p => p[0]).join("").slice(0, 2).toUpperCase() || nome.slice(0, 2);

export function situacao(i) {
  if (i.ativa) return { tom: "ok", rotulo: "● Ativa" };
  if (i.configurada) return { tom: "aviso", rotulo: "Pausada" };
  return { tom: "apagado", rotulo: "Não configurada" };
}

const TIPO = { pedidos: "Recebe pedidos", saida: "Recebe eventos das entregas", generica: "Configurável" };

export default function Integracoes() {
  const navegar = useNavigate();
  const { dados, erro, carregando, recarregar } = useApi("/integracoes");

  // Agrupa mantendo a ordem do catálogo.
  const grupos = [];
  (dados || []).forEach(i => {
    let g = grupos.find(x => x.categoria === i.categoria);
    if (!g) grupos.push((g = { categoria: i.categoria, itens: [] }));
    g.itens.push(i);
  });
  const ativas = (dados || []).filter(i => i.ativa).length;

  return (
    <>
      <Cabecalho titulo="Integrações" subtitulo={dados ? `${ativas} de ${dados.length} ativas · pedidos de plataformas externas e envio de eventos das entregas` : "Pedidos de plataformas externas e envio de eventos das entregas"} />
      <ErroCaixa erro={erro} onTentar={() => recarregar()} />
      {carregando && !dados ? <Carregando /> : grupos.map(g => (
        <section key={g.categoria} className="grupo-integracoes">
          <h2>{g.categoria}</h2>
          <div className="grade-integracoes">
            {g.itens.map(i => {
              const s = situacao(i);
              return (
                <button key={i.slug} type="button" className="cartao-integracao" onClick={() => navegar(`/integracoes/${i.slug}`)}>
                  <div className="cartao-integracao-topo">
                    <span className="logo-integracao" aria-hidden="true">{sigla(i.nome)}</span>
                    <div>
                      <strong>{i.nome}</strong>
                      <small>{TIPO[i.tipo]}</small>
                    </div>
                    <Badge tom={s.tom}>{s.rotulo}</Badge>
                  </div>
                  <p>{i.descricao}</p>
                  <div className="cartao-integracao-rodape">
                    {i.tipo !== "saida" && <span>{numero(i.lojas)} loja(s) vinculada(s)</span>}
                    <span>{numero(i.eventos24h)} evento(s) em 24 h</span>
                    {i.erros24h > 0 && <Badge tom="critico">⚠ {numero(i.erros24h)} erro(s)</Badge>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
