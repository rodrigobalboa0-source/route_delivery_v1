// API do SISTEMA DO COMERCIANTE — montada em /api/app/comerciante
const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { requireAuth, requireTipo, assinarToken, TIPOS } = require("../../middleware/auth");
const { INCLUDE_PADRAO, erroHttp, registrarLog, calcularEntrega, criarPedido } = require("../../services/pedidos.service");
const { carimbos, registrarStatusPedido } = require("../../services/historico.service");
const { versaoComercio } = require("../../services/tempoReal.service");
const { TODOS, ABERTOS } = require("../../utils/statusPedido");
const { localizarPendentes } = require("../pedidos.routes");

const autorComerciante = req => ({ autorTipo: "COMERCIANTE", autorNome: `${req.comercio.nomeFantasia} (${req.conta.email})` });

const router = express.Router();

// ---------- Público ----------

// POST /api/app/comerciante/login  { email, senha }
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'Informe "email" e "senha".' });

    const usuario = await prisma.comercioUsuario.findFirst({
      where: { email: { equals: String(email).trim(), mode: "insensitive" } }, include: { comercio: true },
    });
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
    // Só o que a loja precisa ver (observações internas e dados de comissão ficam no ADM).
    res.json(await prisma.comercio.findUnique({
      where: { id: req.comercio.id },
      select: {
        id: true, fotoUrl: true, segmento: true, razaoSocial: true, nomeFantasia: true, tipoDocumento: true, documento: true,
        nomeCompleto: true, telefone: true, email: true, metodoPagamento: true, createdAt: true,
        enderecos: { orderBy: { principal: "desc" } },
        precificacoesModal: { select: { veiculo: true } },
      },
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

    const [porStatus, entreguesMes, faturasAbertas, agendados, entregadoresOnline] = await Promise.all([
      prisma.pedido.groupBy({ by: ["status"], where: { comercioId, createdAt: { gte: hoje } }, _count: { _all: true } }),
      prisma.pedido.aggregate({ where: { comercioId, status: "ENTREGUE", createdAt: { gte: mes } }, _count: { _all: true }, _sum: { valor: true } }),
      prisma.fatura.aggregate({ where: { comercioId, paga: false }, _sum: { valor: true }, _count: { _all: true } }),
      prisma.pedido.count({ where: { comercioId, status: "PREPARANDO", agendadoPara: { not: null } } }),
      // Entregadores online que podem pegar corridas desta loja (só a quantidade).
      prisma.entregador.count({ where: { online: true, status: "ATIVO", bloqueado: false, OR: [
        { permissaoColeta: "TODOS_CLIENTES" },
        { comerciosPermitidos: { some: { comercioId } } },
      ] } }),
    ]);

    const hojePorStatus = {};
    porStatus.forEach(g => { hojePorStatus[g.status] = g._count._all; });
    res.json({
      hojePorStatus,
      entreguesNoMes: entreguesMes._count._all,
      valorNoMes: Number((entreguesMes._sum.valor || 0).toFixed(2)),
      faturasAbertas: faturasAbertas._count._all,
      valorFaturasAbertas: Number((faturasAbertas._sum.valor || 0).toFixed(2)),
      agendados,
      entregadoresOnline,
    });
  })
);

// GET /api/app/comerciante/tempo-real — "algo mudou?" (a tela consulta a cada ~2 s enquanto está visível)
router.get(
  "/tempo-real",
  asyncHandler(async (req, res) => {
    res.set("Cache-Control", "no-store").json(await versaoComercio(req.comercio.id));
  })
);

// GET /api/app/comerciante/pedidos?status=..&desde=AAAA-MM-DD&ate=AAAA-MM-DD&busca=..&abertos=1
// "status" aceita vários separados por vírgula. Pedidos em aberto sempre aparecem (mesmo criados antes de "desde").
router.get(
  "/pedidos",
  asyncHandler(async (req, res) => {
    const { status, desde, ate, busca } = req.query;
    const where = { comercioId: req.comercio.id };
    const e = [];
    if (status) {
      const lista = String(status).split(",").filter(s => TODOS.includes(s));
      if (lista.length) e.push({ status: { in: lista } });
    }
    if (desde || ate) {
      const periodo = {};
      if (desde) periodo.gte = new Date(`${desde}T00:00:00-03:00`);
      if (ate) periodo.lte = new Date(`${ate}T23:59:59.999-03:00`);
      e.push(req.query.abertos === "1" ? { OR: [{ createdAt: periodo }, { status: { in: ABERTOS } }] } : { createdAt: periodo });
    }
    if (req.query.agendados === "1") e.push({ status: "PREPARANDO", agendadoPara: { not: null } });
    if (req.query.retorno === "1") e.push({ retorno: true });
    if (busca) {
      const q = String(busca).trim();
      e.push({ OR: [
        { codigo: { contains: q, mode: "insensitive" } },
        { clienteNome: { contains: q, mode: "insensitive" } },
        { clienteTelefone: { contains: q } },
        { endereco: { contains: q, mode: "insensitive" } },
      ] });
    }
    if (e.length) where.AND = e;
    res.json(await prisma.pedido.findMany({ where, include: INCLUDE_PADRAO, orderBy: { createdAt: "desc" }, take: 300 }));
  })
);

// GET /api/app/comerciante/clientes?busca=.. — clientes que já receberam entregas da loja
// (para preencher nome, telefone, endereço e complemento de uma vez). Um por cliente+endereço, o mais recente.
router.get(
  "/clientes",
  asyncHandler(async (req, res) => {
    const q = `%${String(req.query.busca || "").trim().replace(/[%_\\]/g, "\\$&")}%`;
    const linhas = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT DISTINCT ON (lower("clienteNome"), lower("endereco"))
          "clienteNome" AS nome, "clienteTelefone" AS telefone, "endereco", "complemento", "createdAt"
        FROM "Pedido"
        WHERE "comercioId" = ${req.comercio.id}
          AND ("clienteNome" ILIKE ${q} OR "clienteTelefone" ILIKE ${q} OR "endereco" ILIKE ${q})
        ORDER BY lower("clienteNome"), lower("endereco"), "createdAt" DESC
      ) c ORDER BY "createdAt" DESC LIMIT 8`;
    res.json(linhas.map(({ createdAt, ...c }) => c));
  })
);

// GET /api/app/comerciante/mapa — entregas em aberto da loja: destino (cliente) e o entregador com a posição dele
router.get(
  "/mapa",
  asyncHandler(async (req, res) => {
    const pedidos = await prisma.pedido.findMany({
      where: { comercioId: req.comercio.id, status: { in: ABERTOS } }, orderBy: { createdAt: "desc" }, take: 100,
      select: {
        id: true, codigo: true, status: true, clienteNome: true, clienteTelefone: true, endereco: true, complemento: true, retorno: true,
        agendadoPara: true, valor: true, prontoEm: true, comercioId: true, latDestino: true, lngDestino: true, createdAt: true,
        entregador: { select: { id: true, nomeCompleto: true, fotoUrl: true, veiculoTipo: true, telefone: true, lat: true, lng: true, localizacaoEm: true } },
      },
    });
    localizarPendentes(pedidos);
    const loja = await prisma.comercioEndereco.findFirst({ where: { comercioId: req.comercio.id, principal: true }, select: { lat: true, lng: true, rua: true, numero: true } });
    res.json({
      loja: { nome: req.comercio.nomeFantasia, lat: loja?.lat ?? null, lng: loja?.lng ?? null },
      pedidos: pedidos.map(p => ({
        id: p.id, codigo: p.codigo, status: p.status, clienteNome: p.clienteNome, clienteTelefone: p.clienteTelefone,
        endereco: p.endereco, complemento: p.complemento, retorno: p.retorno, agendadoPara: p.agendadoPara, valor: p.valor,
        prontoEm: p.prontoEm, createdAt: p.createdAt,
        destino: p.latDestino != null ? { lat: p.latDestino, lng: p.lngDestino } : null,
        entregador: p.entregador,
      })),
    });
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
        entregador: { select: { id: true, nomeCompleto: true, telefone: true, fotoUrl: true, veiculoTipo: true, veiculoPlaca: true, lat: true, lng: true, localizacaoEm: true } },
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
    const { clienteNome, clienteTelefone, endereco, complemento, retorno, agendadoPara, prazoDesejado, formaPagamento, observacao,
      notaFiscalNumero, notaFiscalChave, notaFiscalValor } = req.body;
    const pedido = await criarPedido(
      { comercioId: req.comercio.id, clienteNome, clienteTelefone, endereco, complemento, retorno, agendadoPara, prazoDesejado, formaPagamento, observacao,
        notaFiscalNumero, notaFiscalChave, notaFiscalValor },
      "SISTEMA_COMERCIANTE",
      autorComerciante(req)
    );
    // "Já está pronto": libera na hora para os entregadores (agendado espera o horário).
    res.status(201).json(req.body.pronto && !pedido.agendadoPara ? await marcarPronto(req, pedido) : pedido);
  })
);

async function marcarPronto(req, pedido) {
  const atualizado = await prisma.pedido.update({
    where: { id: pedido.id }, data: { status: "PENDENTE", ...carimbos(pedido, "PENDENTE") }, include: INCLUDE_PADRAO,
  });
  await registrarStatusPedido({ pedidoId: pedido.id, de: pedido.status, para: "PENDENTE", autor: autorComerciante(req) });
  await registrarLog(pedido.id, "Comércio marcou o pedido como pronto — liberado para entregadores.");
  return atualizado;
}

// PATCH /api/app/comerciante/pedidos/:id/pronto — libera para os entregadores
router.patch(
  "/pedidos/:id/pronto",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoComercio(req);
    if (pedido.status !== "PREPARANDO") throw erroHttp(409, "Só pedidos em preparo podem ser marcados como prontos.");
    res.json(await marcarPronto(req, pedido));
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
    res.json(await prisma.fatura.findMany({
      where: { comercioId: req.comercio.id }, orderBy: { vencimento: "desc" },
      include: { _count: { select: { pedidos: true } } },
    }));
  })
);

// GET /api/app/comerciante/faturas/:id — fatura com as entregas cobradas
router.get(
  "/faturas/:id",
  asyncHandler(async (req, res) => {
    const f = await prisma.fatura.findUnique({
      where: { id: req.params.id },
      include: { pedidos: { orderBy: { createdAt: "asc" }, select: { id: true, codigo: true, clienteNome: true, endereco: true, valor: true, distanciaKm: true, createdAt: true, entregueEm: true } } },
    });
    if (!f || f.comercioId !== req.comercio.id) throw erroHttp(404, "Fatura não encontrada.");
    res.json(f);
  })
);

// ---------- Mensagens com a equipe (aparecem no painel ADM em Mensagens) ----------

async function conversaDo(comercio) {
  const existente = await prisma.conversa.findUnique({ where: { comercioId: comercio.id } });
  if (existente) return existente;
  return prisma.conversa.create({ data: { nome: comercio.nomeFantasia, tipo: "CLIENTE", comercioId: comercio.id } });
}

// GET /api/app/comerciante/mensagens — histórico (de: ELES = comércio, NOS = equipe)
router.get(
  "/mensagens",
  asyncHandler(async (req, res) => {
    const c = await conversaDo(req.comercio);
    const mensagens = await prisma.mensagem.findMany({ where: { conversaId: c.id }, orderBy: { createdAt: "asc" }, take: 300 });
    res.json(mensagens.map(m => ({ id: m.id, texto: m.texto, minha: m.de === "ELES", createdAt: m.createdAt })));
  })
);

// POST /api/app/comerciante/mensagens { texto }
router.post(
  "/mensagens",
  asyncHandler(async (req, res) => {
    const texto = String(req.body?.texto || "").trim();
    if (!texto) throw erroHttp(400, "Escreva a mensagem.");
    if (texto.length > 2000) throw erroHttp(400, "Mensagem muito longa.");
    const c = await conversaDo(req.comercio);
    const m = await prisma.mensagem.create({ data: { conversaId: c.id, de: "ELES", texto } });
    await prisma.conversa.update({ where: { id: c.id }, data: { naoLida: true, nome: req.comercio.nomeFantasia } });
    await prisma.notificacao.create({ data: { tipo: "mensagem", texto: `Nova mensagem de ${req.comercio.nomeFantasia}: “${texto.slice(0, 80)}”` } });
    res.status(201).json({ id: m.id, texto: m.texto, minha: true, createdAt: m.createdAt });
  })
);

// ---------- Conta ----------

// PATCH /api/app/comerciante/senha { atual, nova }
router.patch(
  "/senha",
  asyncHandler(async (req, res) => {
    const { atual, nova } = req.body || {};
    if (!atual || !nova) throw erroHttp(400, "Informe a senha atual e a nova.");
    if (String(nova).length < 6) throw erroHttp(400, "A nova senha precisa ter pelo menos 6 caracteres.");
    const u = await prisma.comercioUsuario.findUnique({ where: { id: req.conta.id } });
    if (!(await bcrypt.compare(atual, u.senhaHash))) throw erroHttp(400, "Senha atual incorreta.");
    await prisma.comercioUsuario.update({ where: { id: u.id }, data: { senhaHash: await bcrypt.hash(String(nova), 10) } });
    res.json({ ok: true });
  })
);

module.exports = router;
