const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { omitir } = require("../utils/sanitizar");
const { obterRegras, salvarRegras } = require("../services/saque.service");
const { cifrar, decifrar } = require("../integracoes/cripto");
const { googleGeocodificar, googleDistanciaKm, esquecerChaveGoogle } = require("../utils/geo");

const router = express.Router();

async function obterOuCriarConfiguracao() {
  const existente = await prisma.configuracao.findFirst();
  if (existente) return existente;
  return prisma.configuracao.create({ data: {} });
}

// A chave do Google Maps nunca sai da API — só se está configurada e os 4 últimos caracteres.
function chaveGoogleDe(config) {
  try {
    return config.googleMapsChave ? decifrar(config.googleMapsChave).chave || null : null;
  } catch {
    return null;
  }
}
function publica(config) {
  const chave = chaveGoogleDe(config);
  return {
    ...omitir(config, ["googleMapsChave"]),
    googleMaps: {
      configurada: !!chave,
      final: chave ? chave.slice(-4) : null,
      viaVariavel: !chave && !!process.env.GOOGLE_MAPS_API_KEY,
    },
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const config = await obterOuCriarConfiguracao();
    res.json(publica(config));
  })
);

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const config = await obterOuCriarConfiguracao();
    const atualizado = await prisma.configuracao.update({
      where: { id: config.id },
      data: omitir(req.body, ["id", "googleMapsChave", "googleMaps"]),
    });
    res.json(publica(atualizado));
  })
);

// ---------- Google Maps (só para localizar endereços e medir o km da rota) ----------

// PUT /api/configuracoes/google-maps { chave } — salva criptografada
router.put(
  "/google-maps",
  asyncHandler(async (req, res) => {
    const chave = String(req.body?.chave || "").trim();
    if (!/^[A-Za-z0-9_-]{30,60}$/.test(chave)) {
      return res.status(400).json({ erro: "Chave inválida. Ela começa com “AIza” e tem cerca de 39 caracteres." });
    }
    const config = await obterOuCriarConfiguracao();
    const atualizado = await prisma.configuracao.update({ where: { id: config.id }, data: { googleMapsChave: cifrar({ chave }) } });
    esquecerChaveGoogle();
    res.json(publica(atualizado));
  })
);

router.delete(
  "/google-maps",
  asyncHandler(async (req, res) => {
    const config = await obterOuCriarConfiguracao();
    const atualizado = await prisma.configuracao.update({ where: { id: config.id }, data: { googleMapsChave: null } });
    esquecerChaveGoogle();
    res.json(publica(atualizado));
  })
);

// POST /api/configuracoes/google-maps/testar { origem, destino } — mede a rota entre dois endereços
// usando SÓ o Google (sem reserva), para conferir se a chave e as APIs estão liberadas.
router.post(
  "/google-maps/testar",
  asyncHandler(async (req, res) => {
    const config = await obterOuCriarConfiguracao();
    const chave = chaveGoogleDe(config) || process.env.GOOGLE_MAPS_API_KEY;
    if (!chave) return res.status(400).json({ erro: "Salve a chave do Google Maps antes de testar." });
    const origem = String(req.body?.origem || "").trim();
    const destino = String(req.body?.destino || "").trim();
    if (!origem || !destino) return res.status(400).json({ erro: "Informe os dois endereços." });
    try {
      const [a, b] = await Promise.all([googleGeocodificar(origem, chave), googleGeocodificar(destino, chave)]);
      if (!a || !b) return res.status(400).json({ erro: `O Google não encontrou o endereço ${!a ? "de origem" : "de destino"}.` });
      const km = await googleDistanciaKm(a, b, chave);
      if (km == null) return res.status(400).json({ erro: "O Google não encontrou uma rota entre os dois endereços." });
      res.json({ ok: true, distanciaKm: Number(km.toFixed(2)), origem: a, destino: b });
    } catch (err) {
      res.status(400).json({ erro: `O Google recusou: ${err.message}` });
    }
  })
);

// GET /api/configuracoes/saque — regras de saque normal e rápido
router.get(
  "/saque",
  asyncHandler(async (req, res) => {
    res.json(await obterRegras());
  })
);

// PUT /api/configuracoes/saque  { NORMAL: {...}, RAPIDO: {...} }
router.put(
  "/saque",
  asyncHandler(async (req, res) => {
    res.json(await salvarRegras(req.body));
  })
);

module.exports = router;
