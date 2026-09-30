// Webhook do iFood: POST /api/ifood/webhook (URL cadastrada no Portal do Desenvolvedor, no aplicativo).
// Cada requisição traz X-IFood-Signature = HMAC-SHA256 (hex) do corpo, com o Client Secret do aplicativo.
// Assinatura inválida -> 401 (exigência da homologação). Válida -> 202 na hora e o evento é processado em seguida.
const express = require("express");
const crypto = require("crypto");
const { credenciais } = require("../integracoes/ifood");
const { emSegundoPlano } = require("../utils/segundoPlano");

const router = express.Router();

function assinaturaValida(rawBody, recebida, segredo) {
  if (!rawBody || !recebida || !segredo) return false;
  const esperada = crypto.createHmac("sha256", segredo).update(rawBody).digest("hex");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(String(recebida).trim().toLowerCase(), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post("/webhook", async (req, res) => {
  let segredo = null;
  try { segredo = (await credenciais()).clientSecret; } catch { /* sem credenciais salvas */ }
  if (!assinaturaValida(req.rawBody, req.get("x-ifood-signature"), segredo)) {
    return res.status(401).json({ erro: "Assinatura inválida." });
  }
  const eventos = Array.isArray(req.body) ? req.body : [req.body];
  res.status(202).json({ ok: true });
  emSegundoPlano(() => require("../services/ifood.service").processarEventos(eventos, "webhook"), "Webhook iFood");
});

module.exports = router;
module.exports.assinaturaValida = assinaturaValida;
