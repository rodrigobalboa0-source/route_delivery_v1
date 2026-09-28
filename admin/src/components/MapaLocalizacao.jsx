// Modal "Ajustar localização no mapa": clique no mapa ou arraste o pino.
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api";
import { Botao, Carregando, Modal } from "./ui";

const CENTRO_PADRAO = { lat: -23.5614, lng: -46.6559 }; // São Paulo

const PINO = L.divIcon({
  className: "marcador-avatar",
  html: '<div class="pino-mapa"></div>',
  // Quadrado de 30px girado 45°: a ponta fica ~21px abaixo do centro.
  iconSize: [30, 30],
  iconAnchor: [15, 36],
});

function CliqueNoMapa({ onClique }) {
  useMapEvents({ click: e => onClique(e.latlng) });
  return null;
}

function Centralizar({ ponto }) {
  const map = useMap();
  useEffect(() => { if (ponto) map.setView([ponto.lat, ponto.lng], Math.max(map.getZoom(), 16)); }, [ponto, map]);
  return null;
}

export default function MapaLocalizacao({ inicial, textoEndereco, onFechar, onConfirmar }) {
  const [ponto, setPonto] = useState(inicial?.lat != null ? { lat: inicial.lat, lng: inicial.lng } : null);
  const [centro, setCentro] = useState(ponto);
  const [buscando, setBuscando] = useState(!ponto && !!textoEndereco);
  const [aviso, setAviso] = useState(null);

  // Sem coordenadas ainda: começa pela posição do endereço digitado.
  useEffect(() => {
    if (ponto || !textoEndereco) return;
    api.post("/comercios/geocodificar", { endereco: textoEndereco })
      .then(c => { setPonto(c); setCentro(c); })
      .catch(e => setAviso(e.message))
      .finally(() => setBuscando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eventos = useMemo(() => ({ dragend: e => setPonto(e.target.getLatLng()) }), []);

  return (
    <Modal
      titulo="Ajustar localização no mapa"
      onFechar={onFechar}
      largo
      rodape={<>
        <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" disabled={!ponto} onClick={() => onConfirmar({ lat: Number(ponto.lat.toFixed(6)), lng: Number(ponto.lng.toFixed(6)) })}>
          Usar esta localização
        </Botao>
      </>}
    >
      <p className="apagado">
        Clique no mapa ou arraste o pino até a porta do comércio. É daqui que a distância das entregas é calculada.
      </p>
      {aviso && <div className="aviso-caixa">{aviso}</div>}
      {buscando ? <Carregando texto="Localizando o endereço…" /> : (
        <div className="mapa" style={{ height: 330 }}>
          <MapContainer center={[(centro || CENTRO_PADRAO).lat, (centro || CENTRO_PADRAO).lng]} zoom={centro ? 16 : 12} style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <CliqueNoMapa onClique={setPonto} />
            <Centralizar ponto={centro} />
            {ponto && <Marker position={[ponto.lat, ponto.lng]} icon={PINO} draggable eventHandlers={eventos} />}
          </MapContainer>
        </div>
      )}
      <p className="apagado" style={{ marginTop: 8 }}>
        {ponto ? `Posição: ${ponto.lat.toFixed(6)}, ${ponto.lng.toFixed(6)}` : "Nenhuma posição marcada ainda."}
      </p>
    </Modal>
  );
}
