const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { calcularEntrega, criarPedido, erroHttp, soDigitosTelefone } = require("../services/pedidos.service");
const { autorDe } = require("../services/historico.service");
const { buscarEnderecos } = require("../utils/geo");

const router = express.Router();

// POST /api/nova-entrega/calcular
// body: { comercioId, endereco, veiculo?, destino?: {lat,lng}, retorno? }
// Geocodifica o endereço de destino (ou usa a posição escolhida na busca) e calcula a distância
// REAL de percurso até o comércio, junto com o valor da taxa (com o acréscimo do retorno, se houver).
router.post(
  "/calcular",
  asyncHandler(async (req, res) => {
    const { comercioId, endereco, veiculo, destino, destinoAprox, retorno } = req.body;
    if (!comercioId || !endereco) {
      return res.status(400).json({ erro: 'Informe "comercioId" e "endereco".' });
    }
    res.json(await calcularEntrega({ comercioId, endereco, veiculo, destino, destinoAprox, retorno: !!retorno }));
  })
);

// GET /api/nova-entrega/enderecos?q=..&comercioId=.. — busca no OpenStreetMap, perto do comércio
router.get(
  "/enderecos",
  asyncHandler(async (req, res) => {
    const loja = req.query.comercioId
      ? await prisma.comercioEndereco.findFirst({ where: { comercioId: String(req.query.comercioId), principal: true }, select: { lat: true, lng: true } })
      : null;
    try {
      res.json(await buscarEnderecos(req.query.q, loja?.lat != null ? loja : null));
    } catch (err) {
      throw erroHttp(503, err.message);
    }
  })
);

// GET /api/nova-entrega/cliente?comercioId=..&telefone=.. — cliente salvo do comércio (404 se novo)
router.get(
  "/cliente",
  asyncHandler(async (req, res) => {
    const telefone = soDigitosTelefone(req.query.telefone);
    const c = req.query.comercioId && telefone.length >= 8
      ? await prisma.clienteComercio.findUnique({ where: { comercioId_telefone: { comercioId: String(req.query.comercioId), telefone } } })
      : null;
    if (!c) return res.status(404).json({ erro: "Cliente novo." });
    res.json(c);
  })
);

// POST /api/nova-entrega
// Cria o pedido já em status PREPARANDO (aguardando o comércio marcar "Pedido Pronto").
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const pedido = await criarPedido(req.body, "PAINEL_ADMIN", autorDe(req));
    res.status(201).json(pedido);
  })
);

module.exports = router;
