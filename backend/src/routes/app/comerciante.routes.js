// API do SISTEMA DO COMERCIANTE — montada em /api/app/comerciante
const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { requireAuth, requireTipo, assinarToken, TIPOS } = require("../../middleware/auth");
const { INCLUDE_PADRAO, erroHttp, registrarLog, calcularEntrega, criarPedido } = require("../../services/pedidos.service");
const { carimbos, registrarStatusPedido } = require("../../services/historico.service");

const autorComerciante = req => ({ autorTipo: "COMERCIANTE", autorNome: `${req.comercio.nomeFantasia} (${req.conta.email})` });

const router = express.Router();

// ---------- Público ----------

// POST /api/app/comerciante/login  { email, senha }
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'Informe "email" e "senha".' });

    const usuario = await prisma.comercioUsuario.findUnique({ where: { email }, include: { comercio: true } });
    if (!usuario || !(await bcrypt.compare(senha, usuario.senhaHash))) {
      return res.status(401).json({ erro: "Credenciais inválidas." });
    }
    if (usuario.comercio.bloqueado) {
      return res.status(403).json({ erro: "Este comércio está bloqueado. Fale com o suporte." });
    }

    const token = assinarToken({
      tipo: TIPOS.COMERCIANTE, id: usuario.id, email: usuario.email, comercioId: usuario.comercioId,
    });
    res.json({
      token,
      usuario: { id: usuario.id, email: usuario.email },
      comercio: { id: usuario.comercio.id, nomeFantasia: usuario.comercio.nomeFantasia },
    });
  })
);

// ---------- Autenticado ----------

router.use(requireAuth, requireTipo(TIPOS.COMERCIANTE));

// Recarrega o comércio a cada requisição: bloqueio pelo ADM vale na hora.
router.use(
  asyncHandler(async (req, res, next) => {
    const usuario = await prisma.comercioUsuario.findUnique({ where: { id: req.conta.id }, include: { comercio: true } });
    if (!usuario) return res.status(401).json({ erro: "Usuário não encontrado." });
    if (usuario.comercio.bloqueado) return res.status(403).json({ erro: "Este comércio está bloqueado. Fale com o suporte." });
    req.comercio = usuario.comercio;
    next();
  })
);

async function pedidoDoComercio(req) {
  const pedido = await prisma.pedido.findUnique({ where: { id: req.params.id } });
  if (!pedido || pedido.comercioId !== req.comercio.id) throw erroHttp(404, "Pedido não encontrado.");
  return pedido;
}

// GET /api/app/comerciante/me
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    res.json(await prisma.comercio.findUnique({
      where: { id: req.comercio.id },
      include: { enderecos: true, precificacoesModal: true },
    }));
  })
);

// GET /api/app/comerciante/resumo
router.get(
  "/resumo",
  asyncHandler(async (req, res) => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const mes = new Date(hoje); mes.setDate(1);
    const comercioId = req.comercio.id;

    const [porStatus, entreguesMes, faturasAbertas] = await Promise.all([
      prisma.pedido.groupBy({ by: ["status"], where: { comercioId, createdAt: { gte: hoje } }, _count: { _all: true } }),
      prisma.pedido.aggregate({ where: { comercioId, status: "ENTREGUE", createdAt: { gte: mes } }, _count: { _all: true }, _sum: { valor: true } }),
      prisma.fatura.aggregate({ where: { comercioId, paga: false }, _sum: { valor: true }, _count: { _all: true } }),
    ]);

    const hojePorStatus = {};
    porStatus.forEach(g => { hojePorStatus[g.status] = g._count._all; });
    res.json({
      hojePorStatus,
      entreguesNoMes: entreguesMes._count._all,
      valorNoMes: Number((entreguesMes._sum.valor || 0).toFixed(2)),
      faturasAbertas: faturasAbertas._count._all,
      valorFaturasAbertas: Number((faturasAbertas._sum.valor || 0).toFixed(2)),
    });
  })
);

// GET /api/app/comerciante/pedidos?status=..
router.get(
  "/pedidos",
  asyncHandler(async (req, res) => {
    const where = { comercioId: req.comercio.id };
    if (req.query.status) where.status = req.query.status;
    res.json(await prisma.pedido.findMany({ where, include: INCLUDE_PADRAO, orderBy: { createdAt: "desc" }, take: 200 }));
  })
);

// GET /api/app/comerciante/pedidos/:id — inclui a posição do entregador para acompanhamento
router.get(
  "/pedidos/:id",
  asyncHandler(async (req, res) => {
    await pedidoDoComercio(req);
    res.json(await prisma.pedido.findUnique({
      where: { id: req.params.id },
      include: {
        ...INCLUDE_PADRAO,
        entregador: { select: { id: true, nomeCompleto: true, telefone: true, veiculoTipo: true, veiculoPlaca: true, lat: true, lng: true, localizacaoEm: true } },
        logs: { orderBy: { createdAt: "asc" } },
      },
    }));
  })
);

// POST /api/app/comerciante/pedidos/calcular  { endereco, veiculo? }
router.post(
  "/pedidos/calcular",
  asyncHandler(async (req, res) => {
    if (!req.body.endereco) return res.status(400).json({ erro: 'Informe o "endereco".' });
    res.json(await calcularEntrega({ comercioId: req.comercio.id, endereco: req.body.endereco, veiculo: req.body.veiculo }));
  })
);

// POST /api/app/comerciante/pedidos — o comércio só cria pedidos para si mesmo
router.post(
  "/pedidos",
  asyncHandler(async (req, res) => {
    const { clienteNome, clienteTelefone, endereco, prazoDesejado, formaPagamento, observacao,
      notaFiscalNumero, notaFiscalChave, notaFiscalValor } = req.body;
    const pedido = await criarPedido(
      { comercioId: req.comercio.id, clienteNome, clienteTelefone, endereco, prazoDesejado, formaPagamento, observacao,
        notaFiscalNumero, notaFiscalChave, notaFiscalValor },
      "SISTEMA_COMERCIANTE",
      autorComerciante(req)
    );
    res.status(201).json(pedido);
  })
);

// PATCH /api/app/comerciante/pedidos/:id/pronto — libera para os entregadores
router.patch(
  "/pedidos/:id/pronto",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoComercio(req);
    if (pedido.status !== "PREPARANDO") throw erroHttp(409, "Só pedidos em preparo podem ser marcados como prontos.");
    const atualizado = await prisma.pedido.update({
      where: { id: pedido.id }, data: { status: "PENDENTE", ...carimbos(pedido, "PENDENTE") }, include: INCLUDE_PADRAO,
    });
    await registrarStatusPedido({ pedidoId: pedido.id, de: pedido.status, para: "PENDENTE", autor: autorComerciante(req) });
    await registrarLog(pedido.id, "Comércio marcou o pedido como pronto — liberado para entregadores.");
    res.json(atualizado);
  })
);

// PATCH /api/app/comerciante/pedidos/:id/cancelar  { motivo? } — só antes de um entregador aceitar
router.patch(
  "/pedidos/:id/cancelar",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoComercio(req);
    if (!["PREPARANDO", "PENDENTE"].includes(pedido.status)) {
      throw erroHttp(409, "Este pedido já saiu para entrega. Fale com o suporte para cancelar.");
    }
    const atualizado = await prisma.pedido.update({
      where: { id: pedido.id }, data: { status: "CANCELADO", ...carimbos(pedido, "CANCELADO") }, include: INCLUDE_PADRAO,
    });
    await registrarStatusPedido({ pedidoId: pedido.id, de: pedido.status, para: "CANCELADO", autor: autorComerciante(req) });
    const motivo = req.body?.motivo ? ` Motivo: ${req.body.motivo}` : "";
    await registrarLog(pedido.id, `Pedido cancelado pelo comércio.${motivo}`);
    res.json(atualizado);
  })
);

// GET /api/app/comerciante/faturas
router.get(
  "/faturas",
  asyncHandler(async (req, res) => {
    res.json(await prisma.fatura.findMany({ where: { comercioId: req.comercio.id }, orderBy: { vencimento: "desc" } }));
  })
);

module.exports = router;
