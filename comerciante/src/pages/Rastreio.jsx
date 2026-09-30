// Página pública de rastreio (o cliente abre pelo link que a loja copia). Não precisa de login.
// Mostra a etapa da entrega, a loja, o entregador (primeiro nome, veículo, placa) e o mapa ao vivo. Atualiza a cada 15 s.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { VEICULOS, dataHora } from "../utils/format";

const API = import.meta.env.VITE_API_BASE_URL || "https://routedelivery.vercel.app/api";

const ETAPAS = [
  { chave: "criado", rotulo: "Pedido recebido", status: ["PREPARANDO"] },
  { chave: "pronto", rotulo: "Procurando entregador", status: ["PENDENTE"] },
  { chave: "aceito", rotulo: "Entregador a caminho da loja", status: ["ATRIBUIDO", "NA_LOJA"] },
  { chave: "saiu", rotulo: "Saiu para entrega", status: ["EM_ROTA", "NO_CLIENTE", "ATRASADO"] },
  { chave: "entregue", rotulo: "Entregue", status: ["ENTREGUE"] },
];

const icone = (html, tam = 34) => L.divIcon({ className: "rastreio-marcador", html, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] });
const ICONE_LOJA = icone('<div class="rastreio-pino loja">🏪</div>');
const ICONE_CASA = icone('<div class="rastreio-pino casa">🏠</div>');
const ICONE_MOTO = icone('<div class="rastreio-pino moto">🛵</div>', 40);

function Enquadrar({ pontos }) {
  const map = useMap();
  const chave = pontos.map(p => p.join(",")).join("|");
  useEffect(() => {
    if (pontos.length === 1) map.setView(pontos[0], 15);
    else if (pontos.length > 1) map.fitBounds(L.latLngBounds(pontos), { padding: [40, 40], maxZoom: 16 });
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function Rastreio() {
  const { token } = useParams();
  const [d, setD] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    const carregar = () => fetch(`${API}/rastreio/${encodeURIComponent(token)}`)
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.erro || "Não foi possível carregar."); return j; })
      .then(j => { if (vivo) { setD(j); setErro(null); } })
      .catch(e => { if (vivo) setErro(e.message); });
    carregar();
    const t = setInterval(carregar, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, [token]);

  const pontos = useMemo(() => {
    if (!d) return [];
    return [
      d.loja.lat != null && [d.loja.lat, d.loja.lng],
      d.destino && [d.destino.lat, d.destino.lng],
      d.entregador?.posicao && [d.entregador.posicao.lat, d.entregador.posicao.lng],
    ].filter(Boolean);
  }, [d]);

  useEffect(() => { document.title = d ? `Rastreio — ${d.loja.nome}` : "Rastreio da entrega"; }, [d]);

  if (erro && !d) return <div className="rastreio"><div className="rastreio-cartao"><h1>Rastreio da entrega</h1><p>{erro}</p></div></div>;
  if (!d) return <div className="rastreio"><div className="rastreio-cartao"><p>Carregando…</p></div></div>;

  const cancelado = d.status === "CANCELADO";
  const atual = ETAPAS.findIndex(e => e.status.includes(d.status));
  const e = d.entregador;

  return (
    <div className="rastreio">
      <div className="rastreio-cartao">
        <header className="rastreio-topo">
          <span className="rastreio-logo" aria-hidden="true">{d.loja.fotoUrl ? <img src={d.loja.fotoUrl} alt="" /> : d.loja.nome[0]}</span>
          <div>
            <h1>{d.loja.nome}</h1>
            <small>Pedido {d.codigo}{d.cliente ? ` · para ${d.cliente}` : ""}</small>
          </div>
        </header>

        {cancelado ? (
          <div className="rastreio-aviso cancelado">Este pedido foi cancelado{d.horarios.cancelado ? ` em ${dataHora(d.horarios.cancelado)}` : ""}. Em caso de dúvida, fale com a loja.</div>
        ) : (
          <ol className="rastreio-etapas" aria-label="Andamento da entrega">
            {ETAPAS.map((et, i) => (
              <li key={et.chave} className={i < atual ? "feita" : i === atual ? "atual" : ""} aria-current={i === atual ? "step" : undefined}>
                <span className="rastreio-ponto" aria-hidden="true">{i < atual || (i === atual && et.chave === "entregue") ? "✓" : ""}</span>
                <span>{et.rotulo}</span>
              </li>
            ))}
          </ol>
        )}
        {d.status === "PREPARANDO" && d.agendadoPara && <p className="rastreio-dica">Entrega agendada: o entregador será chamado em {dataHora(d.agendadoPara)}.</p>}
        {d.status === "ENTREGUE" && d.horarios.entregue && <p className="rastreio-dica">Entregue em {dataHora(d.horarios.entregue)}. Bom apetite! 😋</p>}

        {e && (
          <div className="rastreio-entregador">
            <span className="rastreio-logo pequeno" aria-hidden="true">{e.fotoUrl ? <img src={e.fotoUrl} alt="" /> : e.nome[0]}</span>
            <div>
              <strong>{e.nome}</strong>
              <small>{VEICULOS[e.veiculoTipo] || "Entregador"}{e.veiculoPlaca ? ` · placa ${e.veiculoPlaca}` : ""}</small>
            </div>
          </div>
        )}

        {!cancelado && d.status !== "ENTREGUE" && pontos.length > 0 && (
          <div className="rastreio-mapa">
            <MapContainer center={pontos[0]} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false} zoomAnimation={false}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {d.loja.lat != null && <Marker position={[d.loja.lat, d.loja.lng]} icon={ICONE_LOJA}><Tooltip>{d.loja.nome}</Tooltip></Marker>}
              {d.destino && <Marker position={[d.destino.lat, d.destino.lng]} icon={ICONE_CASA}><Tooltip>Endereço de entrega</Tooltip></Marker>}
              {e?.posicao && <Marker position={[e.posicao.lat, e.posicao.lng]} icon={ICONE_MOTO}><Tooltip permanent direction="top">{e.nome}</Tooltip></Marker>}
              <Enquadrar pontos={pontos} />
            </MapContainer>
          </div>
        )}
        <p className="rastreio-endereco">📍 {d.endereco}</p>
        <p className="rastreio-rodape">Atualiza sozinho a cada 15 segundos · Route Delivery</p>
      </div>
    </div>
  );
}
