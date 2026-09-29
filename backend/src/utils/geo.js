// Utilitários de geocodificação e cálculo de rota, usados para que toda
// entrega seja precificada pela distância real de PERCURSO (rota de carro/moto),
// e não por distância em linha reta ("raio").
//
// Fonte principal: Google Maps (Geocoding API + Routes API), quando há chave configurada
// em Configurações › Google Maps (ou na variável GOOGLE_MAPS_API_KEY). Serve SÓ para o cálculo:
// o desenho dos mapas do painel continua no OpenStreetMap.
// Sem chave, ou se o Google falhar, usa os serviços públicos do OpenStreetMap (Nominatim + OSRM).

const prisma = require("../lib/prisma");
const { decifrar } = require("../integracoes/cripto");
const { normalizarFaixas, valorPorFaixas } = require("./faixas");

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const TIMEOUT_MS = 8000;

// ---------- Chave do Google (banco, com cache curto; ou variável de ambiente) ----------

let cacheChave = { valor: undefined, em: 0 };
async function chaveGoogle() {
  if (Date.now() - cacheChave.em < 60000) return cacheChave.valor;
  let valor = process.env.GOOGLE_MAPS_API_KEY || null;
  try {
    const c = await prisma.configuracao.findFirst({ select: { googleMapsChave: true } });
    if (c?.googleMapsChave) valor = decifrar(c.googleMapsChave).chave || valor;
  } catch (err) {
    console.error("[geo] não foi possível ler a chave do Google Maps:", err.message);
  }
  cacheChave = { valor, em: Date.now() };
  return valor;
}
function esquecerChaveGoogle() {
  cacheChave = { valor: undefined, em: 0 };
}

async function buscar(url, opcoes = {}) {
  const controle = new AbortController();
  const t = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opcoes, signal: controle.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------- Google Maps ----------

// Devolve {lat,lng}, null (endereço não encontrado) ou lança erro (chave inválida, cota etc.).
async function googleGeocodificar(endereco, chave) {
  const q = new URLSearchParams({ address: endereco, key: chave, region: "br", language: "pt-BR", components: "country:BR" });
  const resp = await buscar(`${GOOGLE_GEOCODE_URL}?${q}`);
  const data = await resp.json().catch(() => ({}));
  if (data.status === "ZERO_RESULTS") return null;
  if (data.status !== "OK") throw new Error(`Google Geocoding: ${data.status || resp.status}${data.error_message ? ` — ${data.error_message}` : ""}`);
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng };
}

async function googleDistanciaKm(origem, destino, chave) {
  const ponto = p => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const resp = await buscar(GOOGLE_ROUTES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": chave, "X-Goog-FieldMask": "routes.distanceMeters" },
    body: JSON.stringify({ origin: ponto(origem), destination: ponto(destino), travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE", units: "METRIC" }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`Google Routes: ${data.error?.status || resp.status}${data.error?.message ? ` — ${data.error.message}` : ""}`);
  if (!data.routes?.length) return null;
  return data.routes[0].distanceMeters / 1000;
}

// ---------- OpenStreetMap (reserva) ----------

async function osmGeocodificar(endereco) {
  const query = encodeURIComponent(`${endereco}, Brasil`);
  const resp = await buscar(`${NOMINATIM_URL}?format=json&limit=1&q=${query}`, {
    headers: { "User-Agent": "route-delivery-backend/1.0" },
  });
  if (!resp.ok) throw new Error("Falha ao consultar o serviço de geocodificação.");
  const data = await resp.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function osmDistanciaKm(origem, destino) {
  const url = `${OSRM_URL}/${origem.lng},${origem.lat};${destino.lng},${destino.lat}?overview=false`;
  const resp = await buscar(url);
  if (!resp.ok) throw new Error("Falha ao calcular a rota.");
  const data = await resp.json();
  if (!data.routes || data.routes.length === 0) return null;
  return data.routes[0].distance / 1000; // metros -> km
}

// ---------- Funções usadas pelo sistema ----------

// `endereco` deve incluir a cidade (ex.: "Rua X, 100, Centro, Campinas").
// Devolve { lat, lng, fonte: "google" | "openstreetmap" } ou null.
async function geocodificarEndereco(endereco) {
  const chave = await chaveGoogle();
  if (chave) {
    try {
      const r = await googleGeocodificar(endereco, chave);
      return r ? { ...r, fonte: "google" } : null;
    } catch (err) {
      console.warn("[geo] Google indisponível, usando OpenStreetMap:", err.message);
    }
  }
  const r = await osmGeocodificar(endereco);
  return r ? { ...r, fonte: "openstreetmap" } : null;
}

// Distância de PERCURSO em km (número) ou null.
async function calcularDistanciaRotaKm(origem, destino) {
  const chave = await chaveGoogle();
  if (chave) {
    try {
      return await googleDistanciaKm(origem, destino, chave);
    } catch (err) {
      console.warn("[geo] Google indisponível, usando OpenStreetMap:", err.message);
    }
  }
  return osmDistanciaKm(origem, destino);
}

/**
 * Calcula o valor da entrega a partir da distância de PERCURSO (não em linha reta).
 * Usa a tabela de precificação padrão como base; se uma tabela de preço por KM
 * específica for informada, ela tem prioridade.
 *   FIXO: valor mínimo da tabela.
 *   DESLOCAMENTO: mínimo + valor por km × km.
 *   FAIXAS: valor da primeira faixa que cobre a distância ("até X km"); acima da última,
 *           valor da última + valor por km (kmAdicional) × km excedente. Respeita o mínimo.
 */
function calcularValorEntrega({ distanciaKm, precificacaoPadrao, tabelaPrecoKm }) {
  if (tabelaPrecoKm) {
    if (tabelaPrecoKm.tipoCalculo === "FIXO") {
      return tabelaPrecoKm.valorMinimo ?? 0;
    }
    if (tabelaPrecoKm.tipoCalculo === "FAIXAS") {
      const r = valorPorFaixas(distanciaKm, tabelaPrecoKm.faixas, tabelaPrecoKm.kmAdicional, tabelaPrecoKm.valorMinimo);
      if (r) return r.valor;
    }
    const valor = (tabelaPrecoKm.valorMinimo || 0) + (tabelaPrecoKm.kmAdicional || 0) * distanciaKm;
    return Math.max(valor, tabelaPrecoKm.valorMinimo || 0);
  }

  const base = precificacaoPadrao?.taxaBase ?? 6;
  const porKm = precificacaoPadrao?.taxaPorKm ?? 1.8;
  const minimo = precificacaoPadrao?.valorMinimo ?? 12;
  return Math.max(base + porKm * distanciaKm, minimo);
}

// Distância em linha reta (Haversine). Usada SÓ para ordenar/filtrar pedidos
// próximos do entregador — o valor da entrega continua sendo por percurso.
function distanciaLinhaRetaKm(a, b) {
  const R = 6371;
  const rad = g => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

module.exports = {
  geocodificarEndereco, calcularDistanciaRotaKm, calcularValorEntrega, distanciaLinhaRetaKm, normalizarFaixas,
  googleGeocodificar, googleDistanciaKm, chaveGoogle, esquecerChaveGoogle,
};
