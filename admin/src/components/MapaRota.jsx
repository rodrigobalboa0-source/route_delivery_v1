// Mapa de percurso: linha(s) + marcadores com rótulo (coleta, entrega, início/fim).
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const CENTRO_PADRAO = [-23.5614, -46.6559];

function escapar(t = "") {
  return String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// tipo: "coleta" | "entrega" | "inicio" | "fim"
function icone(tipo, rotulo) {
  return L.divIcon({
    className: "marcador-avatar",
    html: `<div class="marcador-rota marcador-rota-${tipo}">${escapar(rotulo ?? "")}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    tooltipAnchor: [0, -14],
  });
}

// Reenquadra sempre que o conjunto de pontos muda (troca de dia/entregador).
function Enquadrar({ coords, chave }) {
  const map = useMap();
  useEffect(() => {
    if (!coords.length) return;
    if (coords.length === 1) map.setView(coords[0], 15);
    else map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, map]);
  return null;
}

export default function MapaRota({ linhas = [], marcadores = [], altura = 370, chave = "" }) {
  const coords = [
    ...linhas.flatMap(l => l.pontos),
    ...marcadores.map(m => [m.lat, m.lng]),
  ].filter(c => c[0] != null && c[1] != null);

  return (
    <div className="mapa" style={{ height: altura }}>
      <MapContainer center={coords[0] || CENTRO_PADRAO} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Enquadrar coords={coords} chave={chave + coords.length} />
        {linhas.map((l, i) => (
          <Polyline key={i} positions={l.pontos} pathOptions={{ color: l.cor || "#2a78d6", weight: 3, opacity: 0.85, dashArray: l.tracejada ? "6 6" : undefined }} />
        ))}
        {marcadores.filter(m => m.lat != null && m.lng != null).map((m, i) => (
          <Marker key={i} position={[m.lat, m.lng]} icon={icone(m.tipo, m.rotulo)}>
            {m.dica && <Tooltip direction="top">{m.dica}</Tooltip>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
