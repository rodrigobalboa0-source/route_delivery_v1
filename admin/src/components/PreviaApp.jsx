// Prévia de como a promoção aparece no app do entregador (pop-up e lista).
import { VEICULOS } from "../utils/format";

const dataCurta = v => (v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null);

export function periodoTexto(p) {
  const i = dataCurta(p.inicio);
  const f = dataCurta(p.fim);
  if (i && f) return `De ${i} até ${f}`;
  if (f) return `Até ${f}`;
  if (i) return `A partir de ${i}`;
  return "Sem data de término";
}

function Foto({ p, classe }) {
  return p.fotoUrl
    ? <img className={classe} src={p.fotoUrl} alt="" />
    : <div className={`${classe} foto-vazia`} aria-hidden="true">🎁</div>;
}

// modo: "ativada" | "encerrada" | "lista"
export default function PreviaApp({ promocao: p, modo }) {
  const titulo = p.titulo || "Título da promoção";
  return (
    <div className="celular" aria-label="Prévia no app do entregador">
      <div className="celular-tela">
        <div className="app-topo"><strong>Route Entregador</strong><span>● Online</span></div>
        <div className="app-conteudo">
          {modo === "lista" ? (
            <>
              <div className="app-titulo-secao">Promoções</div>
              <div className="app-card-promo">
                <Foto p={p} classe="app-card-foto" />
                <div className="app-card-corpo">
                  <strong>{titulo}</strong>
                  {p.premio && <span className="app-premio">{p.premio}</span>}
                  {p.descricao && <p>{p.descricao}</p>}
                  <small>{periodoTexto(p)}</small>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="app-fundo-lista">
                <div className="app-linha" /><div className="app-linha curta" /><div className="app-linha" /><div className="app-linha curta" />
              </div>
              <div className="app-popup-fundo">
                <div className="app-popup">
                  {modo === "ativada" ? <Foto p={p} classe="app-popup-foto" /> : <div className="app-popup-icone" aria-hidden="true">⏹</div>}
                  <div className="app-popup-corpo">
                    <span className={`app-popup-rotulo ${modo === "ativada" ? "nova" : "fim"}`}>
                      {modo === "ativada" ? "Nova promoção!" : "Promoção encerrada"}
                    </span>
                    <strong>{titulo}</strong>
                    {modo === "ativada" ? (
                      <>
                        {p.premio && <span className="app-premio">{p.premio}</span>}
                        {p.descricao && <p>{p.descricao}</p>}
                        <small>{periodoTexto(p)}</small>
                      </>
                    ) : (
                      <p>Esta promoção não está mais valendo.</p>
                    )}
                    <span className="app-botao">{modo === "ativada" ? "Ver promoção" : "Entendi"}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {p.veiculos?.length > 0 && <div className="celular-legenda">Só para: {p.veiculos.map(v => VEICULOS[v]).join(", ")}</div>}
    </div>
  );
}
