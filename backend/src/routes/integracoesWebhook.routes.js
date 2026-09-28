// Webhook PÚBLICO de entrada de pedidos — montado em /api/integracoes/webhook (sem login).
// A autenticação é o token secreto na própria URL, gerado por integração no painel.
const express = require("express");
const { asyncHandler } = require("../middleware/errorHandler");
const { receberPedido } = require("../services/integracoes.service");

const router = express.Router();

// POST /api/integracoes/webhook/:token — formato documentado no README do backend
router.post(
  "/:token",
  asyncHandler(async (req, res) => {
    const { status, corpo } = await receberPedido(req.params.token, req.body);
    res.status(status).json(corpo);
  })
);

module.exports = router;
