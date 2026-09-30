// Cliente da API do iFood (Merchant API). Usa as credenciais salvas em Integrações › iFood
// (Client ID / Client Secret, criptografadas). Aplicativo centralizado: grantType=client_credentials.
// O token vale ~6 h; fica em memória e é renovado sozinho um pouco antes de vencer.
const prisma = require("../lib/prisma");
const { decifrar } = require("./cripto");

const BASE = "https://merchant-api.ifood.com.br";
const TIMEOUT_MS = 15000;
let cacheToken = { chave: null, token: null, venceEm: 0 };

function erroIfood(status, mensagem) {
  const e = new Error(mensagem);
  e.status = status;
  return e;
}

async function buscar(url, opcoes = {}) {
  const controle = new AbortController();
  const t = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opcoes, signal: controle.signal });
  } catch (err) {
    throw erroIfood(502, err.name === "AbortError" ? "O iFood demorou para responder. Tente de novo." : "Não foi possível falar com o iFood agora.");
  } finally {
    clearTimeout(t);
  }
}

async function credenciais() {
  const integ = await prisma.integracao.findUnique({ where: { slug: "ifood" } });
  let c = {};
  try { c = integ?.credenciais ? decifrar(integ.credenciais) : {}; } catch { c = {}; }
  if (!c.clientId || !c.clientSecret) throw erroIfood(400, "Salve o Client ID e o Client Secret do iFood em Integrações › iFood.");
  return c;
}

// Token de acesso (cache em memória por Client ID).
async function obterToken({ forcar = false } = {}) {
  const { clientId, clientSecret } = await credenciais();
  if (!forcar && cacheToken.chave === clientId && cacheToken.token && Date.now() < cacheToken.venceEm) return cacheToken.token;
  const corpo = new URLSearchParams({ grantType: "client_credentials", clientId, clientSecret });
  const resp = await buscar(`${BASE}/authentication/v1.0/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: corpo.toString(),
  });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok || !dados.accessToken) {
    const motivo = dados?.error?.message || dados?.message || `HTTP ${resp.status}`;
    throw erroIfood(resp.status === 401 || resp.status === 400 ? 400 : 502, `O iFood recusou as credenciais: ${motivo}. Confira o Client ID e o Client Secret.`);
  }
  const segundos = Number(dados.expiresIn) || 6 * 3600;
  cacheToken = { chave: clientId, token: dados.accessToken, venceEm: Date.now() + (segundos - 300) * 1000 };
  return dados.accessToken;
}

// GET autenticado na API do iFood (renova o token uma vez se ele tiver vencido).
async function getIfood(caminho) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const token = await obterToken({ forcar: tentativa > 0 });
    const resp = await buscar(`${BASE}${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 401 && tentativa === 0) continue;
    const dados = await resp.json().catch(() => null);
    if (!resp.ok) throw erroIfood(502, `iFood respondeu ${resp.status}: ${dados?.error?.message || dados?.message || "erro"}`);
    return dados;
  }
  throw erroIfood(502, "O iFood não aceitou o acesso.");
}

// POST autenticado. Devolve { ok, status, dados } — quem chama decide o que fazer com recusas do iFood.
async function postIfood(caminho, corpo) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const token = await obterToken({ forcar: tentativa > 0 });
    const resp = await buscar(`${BASE}${caminho}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    if (resp.status === 401 && tentativa === 0) continue;
    const texto = await resp.text().catch(() => "");
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
    return { ok: resp.ok, status: resp.status, dados };
  }
  return { ok: false, status: 401, dados: null };
}

const mensagemIfood = r => r?.dados?.error?.message || r?.dados?.message || (typeof r?.dados === "string" ? r.dados.slice(0, 200) : "") || `HTTP ${r?.status}`;

// ---------- Pedidos ----------

const obterPedidoIfood = id => getIfood(`/order/v1.0/orders/${encodeURIComponent(id)}`);
const confirmarPedidoIfood = id => postIfood(`/order/v1.0/orders/${encodeURIComponent(id)}/confirm`);
// Saiu para entrega (entrega própria).
async function despacharPedidoIfood(id) {
  const r = await postIfood(`/order/v1.0/orders/${encodeURIComponent(id)}/dispatch`);
  if (r.ok || ![400, 422].includes(r.status)) return r;
  return postIfood(`/order/v1.0/orders/${encodeURIComponent(id)}/dispatch`, { deliveredBy: "MERCHANT" });
}
const verificarCodigoEntregaIfood = (id, code) => postIfood(`/order/v1.0/orders/${encodeURIComponent(id)}/verifyDeliveryCode`, { code: String(code) });

// ---------- Eventos (polling de reserva) ----------

// Eventos pendentes das lojas informadas (até 100 por chamada, como pede o iFood).
async function buscarEventosIfood(merchantIds) {
  const eventos = [];
  for (let i = 0; i < merchantIds.length; i += 100) {
    const lote = merchantIds.slice(i, i + 100);
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const token = await obterToken({ forcar: tentativa > 0 });
      const resp = await buscar(`${BASE}/order/v1.0/events:polling`, { headers: { Authorization: `Bearer ${token}`, "x-polling-merchants": lote.join(",") } });
      if (resp.status === 401 && tentativa === 0) continue;
      if (resp.status === 204) break;
      const dados = await resp.json().catch(() => null);
      if (!resp.ok) throw erroIfood(502, `Polling do iFood respondeu ${resp.status}: ${dados?.error?.message || dados?.message || "erro"}`);
      if (Array.isArray(dados)) eventos.push(...dados);
      break;
    }
  }
  return eventos;
}

async function confirmarRecebimentoEventos(ids) {
  if (!ids.length) return null;
  return postIfood("/order/v1.0/events/acknowledgment", ids.map(id => ({ id })));
}

// Lojas que o aplicativo pode acessar: [{ id (merchantId), name, corporateName }]
async function listarLojas() {
  const lojas = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const lote = await getIfood(`/merchant/v1.0/merchants?page=${pagina}&size=100`);
    if (!Array.isArray(lote) || !lote.length) break;
    lojas.push(...lote);
    if (lote.length < 100) break;
  }
  return lojas.map(l => ({ id: l.id, nome: l.name || l.corporateName || l.id, razaoSocial: l.corporateName || null }));
}

module.exports = {
  obterToken, listarLojas, getIfood, postIfood, mensagemIfood, credenciais,
  obterPedidoIfood, confirmarPedidoIfood, despacharPedidoIfood, verificarCodigoEntregaIfood,
  buscarEventosIfood, confirmarRecebimentoEventos,
};
