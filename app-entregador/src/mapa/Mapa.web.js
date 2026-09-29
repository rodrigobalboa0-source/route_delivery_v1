// Mapa no navegador (versão web do app): Leaflet + OpenStreetMap.
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CENTRO_PADRAO, htmlAvatar, htmlCliente, htmlLoja } from "./marcadores";

const icone = (html, tamanho, ancora) => L.divIcon({ className: "", html, iconSize: tamanho, iconAnchor: ancora });
const ICONE_LOJA = icone(htmlLoja(), [30, 30], [15, 15]);
const ICONE_CLIENTE = icone(htmlCliente(), [30, 38], [15, 37]);

// Centraliza na posição do entregador quando ela chega (e quando pedirem para recentralizar).
function Centralizar({ posicao, pedido }) {
  const map = useMap();
  const feito = useRef(false);
  useEffect(() => {
    if (!posicao) return;
    if (!feito.current || pedido) {
      feito.current = true;
      map.setView([posicao.lat, posicao.lng], 14, { animate: true });
    }
  }, [posicao?.lat, posicao?.lng, pedido, map]);
  return null;
}

export default function Mapa({ posicao, entregador, online, marcadores = [], recentralizar }) {
  const iconeEu = useMemo(
    () => icone(htmlAvatar({ fotoUrl: entregador?.fotoUrl, nome: entregador?.nomeCompleto, online }), [48, 48], [24, 24]),
    [entregador?.fotoUrl, entregador?.nomeCompleto, online]
  );
  const centro = posicao || CENTRO_PADRAO;
  return (
    // isolation + zIndex 0: as camadas do Leaflet (z-index 400+) ficam contidas no mapa e não cobrem
    // o botão Online/Offline, o cartão de Ganhos e os atalhos de baixo.
    <div style={{ position: "absolute", inset: 0, zIndex: 0, isolation: "isolate" }}>
      <MapContainer center={[centro.lat, centro.lng]} zoom={posicao ? 14 : 12} zoomControl={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Centralizar posicao={posicao} pedido={recentralizar} />
        {marcadores.map(m => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={m.tipo === "loja" ? ICONE_LOJA : ICONE_CLIENTE}>
            {m.titulo && <Tooltip direction="top" offset={[0, -18]}>{m.titulo}</Tooltip>}
          </Marker>
        ))}
        {posicao && <Marker position={[posicao.lat, posicao.lng]} icon={iconeEu} zIndexOffset={1000} />}
      </MapContainer>
    </div>
  );
}
