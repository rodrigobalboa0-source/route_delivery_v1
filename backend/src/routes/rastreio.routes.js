// Rastreio público da entrega (link que a loja copia e manda para o cliente) — montado em /api/rastreio.
// O link leva o id do pedido + uma assinatura (HMAC com JWT_SECRET): não dá para adivinhar o de outro pedido.
// Só sai o necessário para acompanhar: etapa, loja, primeiro nome e veículo do entregador e a posição dele
// enquanto a entrega está em andamento. Sem telefones, valores ou dados do cliente além do endereço de entrega.
const crypto = require("crypto");
const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { COM_ENTREGADOR } = require("../utils/statusPedido");

const router = express.Router();

const assinatura = id => crypto.createHmac("sha256", process.env.JWT_SECRET || "route-delivery").update(`rastreio:${id}`).digest("base64url").slice(0, 22);
const tokenRastreio = id => `${id}.${assinatura(id)}`;

function idDoToken(token) {
  const [id, sig] = String(token || "").split(".");
  if (!id || !sig || sig.length !== 22) return null;
  const esperado = assinatura(id);
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado)) ? id : null;
}

// GET /api/rastreio/:token
router.get(
  "/:token",
  asyncHandler(async (req, res) => {
    const id = idDoToken(req.params.token);
    const p = id && await prisma.pedido.findUnique({
      where: { id },
      include: {
        comercio: { select: { nomeFantasia: true, fotoUrl: true, enderecos: { where: { principal: true }, select: { lat: true, lng: true } } } },
        entregador: { select: { nomeCompleto: true, fotoUrl: true, veiculoTipo: true, veiculoPlaca: true, lat: true, lng: true, localizacaoEm: true } },
      },
    });
    if (!p) return res.status(404).json({ erro: "Entrega não encontrada. Confira o link com a loja." });
    const loja = p.comercio.enderecos[0];
    // Para o cliente, "Retornando" já é entrega feita (o entregador está voltando à loja).
    const status = p.status === "RETORNANDO" ? "ENTREGUE" : p.status;
    const emAndamento = COM_ENTREGADOR.includes(status);
    res.set("Cache-Control", "no-store").json({
      codigo: p.codigoExterno || p.codigo,
      status,
      loja: { nome: p.comercio.nomeFantasia, fotoUrl: p.comercio.fotoUrl, lat: loja?.lat ?? null, lng: loja?.lng ?? null },
      cliente: String(p.clienteNome || "").split(" ")[0],
      endereco: p.endereco,
      destino: p.latDestino != null ? { lat: p.latDestino, lng: p.lngDestino } : null,
      agendadoPara: p.agendadoPara,
      horarios: { criado: p.createdAt, pronto: p.prontoEm, aceito: p.aceitoEm, naLoja: p.naLojaEm, saiu: p.saiuEm, noCliente: p.noClienteEm, entregue: p.entregueEm || p.retornandoEm, cancelado: p.canceladoEm },
      entregador: p.entregador && emAndamento ? {
        nome: p.entregador.nomeCompleto.split(" ")[0],
        fotoUrl: p.entregador.fotoUrl,
        veiculoTipo: p.entregador.veiculoTipo,
        veiculoPlaca: p.entregador.veiculoPlaca,
        posicao: p.entregador.lat != null ? { lat: p.entregador.lat, lng: p.entregador.lng, em: p.entregador.localizacaoEm } : null,
      } : null,
    });
  })
);

module.exports = router;
module.exports.tokenRastreio = tokenRastreio;
