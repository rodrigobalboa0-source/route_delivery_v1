// Mapa da Operação (Pedidos • Acompanhamento):
// - pedidos em aberto no endereço de entrega, com o nome do cliente e o motoboy que aceitou;
// - lojas com pedidos em aberto (ponto de coleta);
// - entregadores online (posição enviada pelo app), ligados por uma linha ao pedido que levam.
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { COM_ENTREGADOR, VEICULOS, tempoRelativo } from "../utils/format";

const CENTRO_PADRAO = [-23.5614, -46.6559]; // São Paulo
const NOVO_MS = 2 * 60 * 1000; // pedido lançado há menos de 2 min pisca no mapa

function escapar(texto = "") {
  return String(texto).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function iniciais(nome = "") {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] || "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

const primeiroNome = (nome = "") => nome.trim().split(/\s+/).slice(0, 2).join(" ");

// Marcador em forma de avatar (foto ou iniciais) com bolinha de status:
// verde = livre, azul = em corrida.
function iconeAvatar(e, emCorrida) {
  const miolo = e.fotoUrl
    ? `<img src="${escapar(e.fotoUrl)}" alt="" />`
    : `<span>${escapar(iniciais(e.nomeCompleto))}</span>`;
  return L.divIcon({
    className: "marcador-avatar",
    html: `<div class="avatar-mapa">${miolo}<i class="${emCorrida ? "status-corrida" : "status-livre"}"></i></div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    tooltipAnchor: [0, -24],
  });
}

// Pino do pedido, na cor do status; pisca se acabou de ser lançado.
function iconePedido(p, novo) {
  return L.divIcon({
    className: "marcador-pedido",
    html: `<div class="pino-pedido st-${p.status}${p.destino ? "" : " sem-local"}${novo ? " novo" : ""}"><span></span></div>`,
    iconSize: [26, 34],
    iconAnchor: [13, 32],
    tooltipAnchor: [12, -20],
  });
}

const ICONE_LOJA = L.divIcon({
  className: "marcador-loja",
  html: `<div class="loja-mapa"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6"/></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  tooltipAnchor: [0, -16],
});

function enquadrarTudo(map, pontos) {
  if (pontos.length === 1) map.setView(pontos[0], 15);
  else if (pontos.length) map.fitBounds(L.latLngBounds(pontos), { padding: [60, 60], maxZoom: 15 });
}

// Enquadra todos os pontos quando os dados terminam de carregar (uma vez; depois não briga
// com o zoom do usuário). Pedido novo fora da área visível: afasta o mapa só o necessário.
// Botão "Ver todos" reenquadra quando o usuário quiser.
function Enquadrar({ pontos, carregado, novos }) {
  const map = useMap();
  const feito = useRef(false);
  useEffect(() => {
    if (feito.current || !carregado) return;
    feito.current = true;
    enquadrarTudo(map, pontos);
  }, [carregado, pontos, map]);
  useEffect(() => {
    if (!feito.current || !novos.length) return;
    const area = map.getBounds();
    novos.filter(p => !area.contains(p)).forEach(p => map.panInside(p, { padding: [60, 60] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novos.map(p => p.join()).join("|"), map]);
  // Longe (zoom < 14): rótulo só com cliente e motoboy, para não embolar.
  useEffect(() => {
    const aplicar = () => map.getContainer().classList.toggle("zoom-longe", map.getZoom() < 14);
    aplicar();
    map.on("zoomend", aplicar);
    return () => map.off("zoomend", aplicar);
  }, [map]);
  return (
    <div className="leaflet-top leaflet-right">
      <div className="leaflet-control">
        <button type="button" className="mapa-botao" onClick={() => enquadrarTudo(map, pontos)}>Ver todos</button>
      </div>
    </div>
  );
}

const temPos = o => o && o.lat != null && o.lng != null;

export default function MapaEntregadores({ entregadores = [], pedidos = [], altura = 280, onPedido, carregado = true }) {
  const agora = Date.now();

  // Pedido sem posição do endereço (ainda não localizado): fica ao redor da loja, sem empilhar.
  const pedidosNoMapa = useMemo(() => {
    const porLoja = {};
    return pedidos
      .map(p => {
        if (temPos(p.destino)) return { ...p, pos: [p.destino.lat, p.destino.lng] };
        if (!temPos(p.loja)) return null;
        const i = (porLoja[p.loja.id] = (porLoja[p.loja.id] ?? -1) + 1);
        const ang = (i * 2 * Math.PI) / 8, raio = 0.0012 * (1 + Math.floor(i / 8));
        return { ...p, pos: [p.loja.lat + raio * Math.sin(ang), p.loja.lng + raio * Math.cos(ang)] };
      })
      .filter(Boolean);
  }, [pedidos]);

  // Lojas com pedido em aberto.
  const lojas = useMemo(() => {
    const m = new Map();
    pedidos.forEach(p => {
      if (!temPos(p.loja)) return;
      const l = m.get(p.loja.id) || { ...p.loja, qtd: 0 };
      l.qtd++;
      m.set(p.loja.id, l);
    });
    return [...m.values()];
  }, [pedidos]);

  // Entregadores: os online + quem aceitou algum pedido aberto (mesmo que não esteja na lista de online).
  const motoboys = useMemo(() => {
    const m = new Map(entregadores.filter(temPos).map(e => [e.id, { ...e, levando: [] }]));
    pedidos.forEach(p => {
      if (!p.entregador) return;
      if (!m.has(p.entregador.id) && temPos(p.entregador)) m.set(p.entregador.id, { ...p.entregador, levando: [] });
      m.get(p.entregador.id)?.levando.push(p);
    });
    return [...m.values()];
  }, [entregadores, pedidos]);

  const linhas = pedidosNoMapa
    .filter(p => p.entregador && COM_ENTREGADOR.includes(p.status))
    .map(p => ({ p, de: motoboys.find(e => e.id === p.entregador.id) }))
    .filter(l => l.de);

  const pontos = useMemo(
    () => [...motoboys.map(e => [e.lat, e.lng]), ...pedidosNoMapa.map(p => p.pos), ...lojas.map(l => [l.lat, l.lng])],
    [motoboys, pedidosNoMapa, lojas]
  );

  const iconesMotoboy = useMemo(
    () => Object.fromEntries(motoboys.map(e => [e.id, iconeAvatar(e, e.levando.length > 0 || e.pedidos?.length > 0)])),
    // Recria só quando muda algo que aparece no ícone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [motoboys.map(e => `${e.id}:${e.fotoUrl}:${e.levando.length}:${e.pedidos?.length}`).join("|")]
  );

  return (
    <div className="mapa" style={{ height: altura }}>
      <MapContainer center={pontos[0] || CENTRO_PADRAO} zoom={13} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Enquadrar
          pontos={pontos}
          carregado={carregado}
          novos={pedidosNoMapa.filter(p => agora - new Date(p.createdAt).getTime() < NOVO_MS).map(p => p.pos)}
        />

        {linhas.map(({ p, de }) => (
          <Polyline key={`l-${p.id}`} positions={[[de.lat, de.lng], p.pos]} pathOptions={{ color: p.status === "ATRASADO" ? "#d03b3b" : "#2a78d6", weight: 2, dashArray: "6 6", opacity: 0.8 }} />
        ))}

        {lojas.map(l => (
          <Marker key={`loja-${l.id}`} position={[l.lat, l.lng]} icon={ICONE_LOJA}>
            <Tooltip direction="top"><strong>{l.nome}</strong><br />{l.qtd} pedido(s) em aberto</Tooltip>
          </Marker>
        ))}

        {pedidosNoMapa.map(p => (
          <Marker
            key={`p-${p.id}`}
            position={p.pos}
            icon={iconePedido(p, agora - new Date(p.createdAt).getTime() < NOVO_MS)}
            eventHandlers={onPedido ? { click: () => onPedido(p) } : undefined}
            zIndexOffset={p.entregador ? 0 : 500}
          >
            <Tooltip permanent direction="right" className={`rotulo-pedido st-${p.status}`} interactive={false}>
              {/* Só o nome do cliente e, se já aceitou, o motoboy (a cor do pino indica o status). */}
              <strong>{p.clienteNome}</strong>
              {p.entregador && <span className="rotulo-linha">🏍 {primeiroNome(p.entregador.nomeCompleto)}</span>}
            </Tooltip>
          </Marker>
        ))}

        {motoboys.map(e => (
          <Marker key={`e-${e.id}`} position={[e.lat, e.lng]} icon={iconesMotoboy[e.id]} zIndexOffset={1000}>
            <Tooltip direction="top">
              <strong>{e.nomeCompleto}</strong> · {VEICULOS[e.veiculoTipo]}
              <br />
              {e.levando.length
                ? `Levando: ${e.levando.map(p => `${p.clienteNome} (${p.codigo})`).join(", ")}`
                : e.pedidos?.length ? `Em corrida: ${e.pedidos.map(p => p.codigo).join(", ")}` : "Livre"}
              <br />
              Posição {tempoRelativo(e.localizacaoEm)}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
      <div className="mapa-legenda">
        <span><i className="ponto" style={{ background: "#8a93a1" }} /> Criado</span>
        <span><i className="ponto" style={{ background: "#d98a00" }} /> Pronto (sem motoboy)</span>
        <span><i className="ponto" style={{ background: "#7c5cc4" }} /> Atribuída / na loja</span>
        <span><i className="ponto" style={{ background: "#2a78d6" }} /> Em rota / no cliente</span>
        <span><i className="ponto" style={{ background: "#d03b3b" }} /> Atrasado</span>
        <span><i className="ponto" style={{ background: "#22c55e" }} /> Motoboy livre</span>
        <span>▣ Loja</span>
      </div>
    </div>
  );
}
