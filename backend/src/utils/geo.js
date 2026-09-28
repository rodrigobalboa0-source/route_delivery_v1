// Utilitários de geocodificação e cálculo de rota, usados para que toda
// entrega seja precificada pela distância real de PERCURSO (rota de carro/moto),
// e não por distância em linha reta ("raio").
//
// Usa serviços públicos e gratuitos do OpenStreetMap (Nominatim + OSRM).
// Em produção com volume alto, troque por Google Maps Directions API,
// Mapbox Directions, ou um servidor OSRM próprio.

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

// `endereco` deve incluir a cidade (ex.: "Rua X, 100, Centro, Campinas").
async function geocodificarEndereco(endereco) {
  const query = encodeURIComponent(`${endereco}, Brasil`);
  const resp = await fetch(`${NOMINATIM_URL}?format=json&limit=1&q=${query}`, {
    headers: { "User-Agent": "route-delivery-backend/1.0" },
  });
  if (!resp.ok) throw new Error("Falha ao consultar o serviço de geocodificação.");
  const data = await resp.json();
  if (!data || data.length === 0) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function calcularDistanciaRotaKm(origem, destino) {
  const url = `${OSRM_URL}/${origem.lng},${origem.lat};${destino.lng},${destino.lat}?overview=false`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("Falha ao calcular a rota.");
  const data = await resp.json();
  if (!data.routes || data.routes.length === 0) return null;
  return data.routes[0].distance / 1000; // metros -> km
}

/**
 * Calcula o valor da entrega a partir da distância de PERCURSO (não em linha reta).
 * Usa a tabela de precificação padrão como base; se uma tabela de preço por KM
 * específica for informada, ela tem prioridade.
 */
function calcularValorEntrega({ distanciaKm, precificacaoPadrao, tabelaPrecoKm }) {
  if (tabelaPrecoKm) {
    if (tabelaPrecoKm.tipoCalculo === "FIXO") {
      return tabelaPrecoKm.valorMinimo ?? 0;
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

module.exports = { geocodificarEndereco, calcularDistanciaRotaKm, calcularValorEntrega, distanciaLinhaRetaKm };
