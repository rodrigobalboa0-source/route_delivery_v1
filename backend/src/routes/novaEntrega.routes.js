const express = require("express");
const { asyncHandler } = require("../middleware/errorHandler");
const { calcularEntrega, criarPedido } = require("../services/pedidos.service");
const { autorDe } = require("../services/historico.service");

const router = express.Router();

// POST /api/nova-entrega/calcular
// body: { comercioId, endereco, veiculo? }
// Geocodifica o endereço de destino e calcula a distância REAL de percurso
// (não em linha reta) até o comércio, junto com o valor estimado da taxa.
router.post(
  "/calcular",
  asyncHandler(async (req, res) => {
    const { comercioId, endereco, veiculo } = req.body;
    if (!comercioId || !endereco) {
      return res.status(400).json({ erro: 'Informe "comercioId" e "endereco".' });
    }
    res.json(await calcularEntrega({ comercioId, endereco, veiculo }));
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
