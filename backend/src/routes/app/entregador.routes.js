// API do APP DO ENTREGADOR — montada em /api/app/entregador
const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { requireAuth, requireTipo, assinarToken, TIPOS } = require("../../middleware/auth");
const { semSenha } = require("../../utils/sanitizar");
const { distanciaLinhaRetaKm } = require("../../utils/geo");
const { COM_ENTREGADOR, ETAPAS_ENTREGADOR, ROTULOS } = require("../../utils/statusPedido");
const { INCLUDE_PADRAO, erroHttp, registrarLog, aceitarPedido } = require("../../services/pedidos.service");
const { obterRegras } = require("../../services/saque.service");
const { vigentesPara, avisosPara, marcarVisto, publico: publicoPromocao } = require("../../services/promocoes.service");
const { carimbos, registrarStatusPedido, registrarStatusEntregador, registrarLocalizacao } = require("../../services/historico.service");

const autorEntregador = req => ({ autorTipo: "ENTREGADOR", autorNome: req.entregador.nomeCompleto });

const router = express.Router();

const INCLUDE_PEDIDO_APP = {
  ...INCLUDE_PADRAO,
  comercio: { select: { id: true, nomeFantasia: true, telefone: true, enderecos: { where: { principal: true } } } },
};

// ---------- Público ----------

// POST /api/app/entregador/login  { email, senha }
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'Informe "email" e "senha".' });

    // E-mail sem diferenciar maiúsculas/minúsculas (o celular costuma colocar a 1ª letra maiúscula).
    const entregador = await prisma.entregador.findFirst({ where: { email: { equals: String(email).trim(), mode: "insensitive" } } });
    if (!entregador?.senhaHash || !(await bcrypt.compare(senha, entregador.senhaHash))) {
      return res.status(401).json({ erro: "Credenciais inválidas." });
    }
    if (entregador.bloqueado) return res.status(403).json({ erro: "Seu acesso está bloqueado. Fale com o suporte." });
    if (entregador.status === "INATIVO") return res.status(403).json({ erro: "Seu cadastro está inativo. Fale com o suporte." });

    const token = assinarToken({ tipo: TIPOS.ENTREGADOR, id: entregador.id, nome: entregador.nomeCompleto }, "30d");
    res.json({ token, entregador: semSenha(entregador) });
  })
);

// POST /api/app/entregador/cadastro — auto-cadastro pelo app; entra como EM_ANALISE até o ADM aprovar
router.post(
  "/cadastro",
  asyncHandler(async (req, res) => {
    const { nomeCompleto, email, senha, telefone, cpf, veiculoTipo, veiculoModelo, veiculoPlaca, cidade } = req.body;
    if (!nomeCompleto || !email || !senha) {
      return res.status(400).json({ erro: 'Informe "nomeCompleto", "email" e "senha".' });
    }
    if (String(senha).length < 6) return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres." });

    const entregador = await prisma.entregador.create({
      data: {
        nomeCompleto, email, telefone, cpf, cidade, veiculoModelo, veiculoPlaca,
        veiculoTipo: ["MOTO", "BIKE", "CARRO"].includes(veiculoTipo) ? veiculoTipo : "MOTO",
        tipoEntrega: "PROPRIO",
        status: "EM_ANALISE",
        senhaHash: await bcrypt.hash(senha, 10),
      },
    });
    await registrarStatusEntregador({
      entregadorId: entregador.id, tipo: "CADASTRO", para: "EM_ANALISE",
      autor: { autorTipo: "ENTREGADOR", autorNome: nomeCompleto },
    });
    await prisma.notificacao.create({
      data: { tipo: "cadastro", texto: `Novo entregador aguardando aprovação: ${nomeCompleto}.` },
    });
    res.status(201).json({ ok: true, mensagem: "Cadastro enviado. Aguarde a aprovação da equipe.", entregador: semSenha(entregador) });
  })
);

// ---------- Autenticado ----------

router.use(requireAuth, requireTipo(TIPOS.ENTREGADOR));

// Recarrega o entregador a cada requisição: bloqueio/inativação pelo ADM vale na hora.
router.use(
  asyncHandler(async (req, res, next) => {
    const entregador = await prisma.entregador.findUnique({ where: { id: req.conta.id } });
    if (!entregador) return res.status(401).json({ erro: "Conta não encontrada." });
    if (entregador.bloqueado) return res.status(403).json({ erro: "Seu acesso está bloqueado. Fale com o suporte." });
    if (entregador.status === "INATIVO") return res.status(403).json({ erro: "Seu cadastro está inativo." });
    req.entregador = entregador;
    next();
  })
);

function exigirAtivo(req) {
  if (req.entregador.status !== "ATIVO") throw erroHttp(403, "Seu cadastro ainda está em análise.");
}

async function pedidoDoEntregador(req) {
  const pedido = await prisma.pedido.findUnique({ where: { id: req.params.id } });
  if (!pedido || pedido.entregadorId !== req.entregador.id) throw erroHttp(404, "Pedido não encontrado.");
  return pedido;
}

// GET /api/app/entregador/me
router.get("/me", (req, res) => res.json(semSenha(req.entregador)));

// PATCH /api/app/entregador/status  { online, lat?, lng? }
router.patch(
  "/status",
  asyncHandler(async (req, res) => {
    const online = !!req.body.online;
    if (online) exigirAtivo(req);
    const data = { online };
    if (req.body.lat != null && req.body.lng != null) {
      Object.assign(data, { lat: Number(req.body.lat), lng: Number(req.body.lng), localizacaoEm: new Date() });
    }
    const entregador = await prisma.entregador.update({ where: { id: req.entregador.id }, data });
    await registrarStatusEntregador({
      entregadorId: entregador.id, tipo: "ONLINE", de: req.entregador.online ? "ONLINE" : "OFFLINE",
      para: online ? "ONLINE" : "OFFLINE", autor: autorEntregador(req),
    });
    if (data.lat != null) await registrarLocalizacao(entregador.id, data.lat, data.lng);
    res.json(semSenha(entregador));
  })
);

// POST /api/app/entregador/localizacao  { lat, lng } — enviado periodicamente pelo app
router.post(
  "/localizacao",
  asyncHandler(async (req, res) => {
    const { lat, lng } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ erro: 'Informe "lat" e "lng".' });
    await prisma.entregador.update({
      where: { id: req.entregador.id },
      data: { lat: Number(lat), lng: Number(lng), localizacaoEm: new Date() },
    });
    await registrarLocalizacao(req.entregador.id, Number(lat), Number(lng));
    res.json({ ok: true });
  })
);

// GET /api/app/entregador/pedidos/disponiveis
// Pedidos prontos (PENDENTE) sem entregador, respeitando a permissão de coleta
// do entregador e o raio máximo configurado no painel.
router.get(
  "/pedidos/disponiveis",
  asyncHandler(async (req, res) => {
    exigirAtivo(req);
    if (!req.entregador.online) return res.json([]);

    const where = { status: "PENDENTE", entregadorId: null, comercio: { bloqueado: false } };
    if (req.entregador.permissaoColeta === "SOMENTE_SELECIONADOS") {
      const permitidos = await prisma.entregadorComercioPermitido.findMany({
        where: { entregadorId: req.entregador.id }, select: { comercioId: true },
      });
      where.comercioId = { in: permitidos.map(p => p.comercioId) };
    }

    const [pedidos, config] = await Promise.all([
      prisma.pedido.findMany({ where, include: INCLUDE_PEDIDO_APP, orderBy: { updatedAt: "asc" }, take: 50 }),
      prisma.configuracao.findFirst(),
    ]);

    const { lat, lng } = req.entregador;
    const raio = config?.raioMaximoKm;
    const comDistancia = pedidos.map(p => {
      const origem = p.comercio.enderecos[0];
      const distanciaAteColetaKm = lat != null && origem?.lat != null
        ? Number(distanciaLinhaRetaKm({ lat, lng }, { lat: origem.lat, lng: origem.lng }).toFixed(2))
        : null;
      return { ...p, distanciaAteColetaKm };
    });

    res.json(
      comDistancia
        .filter(p => !raio || p.distanciaAteColetaKm == null || p.distanciaAteColetaKm <= raio)
        .sort((a, b) => (a.distanciaAteColetaKm ?? Infinity) - (b.distanciaAteColetaKm ?? Infinity))
    );
  })
);

// GET /api/app/entregador/pedidos?status=EM_ROTA — meus pedidos (status=ATIVOS: todos em andamento)
router.get(
  "/pedidos",
  asyncHandler(async (req, res) => {
    const where = { entregadorId: req.entregador.id };
    if (req.query.status === "ATIVOS") where.status = { in: COM_ENTREGADOR };
    else if (req.query.status) where.status = req.query.status;
    const pedidos = await prisma.pedido.findMany({
      where, include: INCLUDE_PEDIDO_APP, orderBy: { updatedAt: "desc" }, take: 100,
    });
    res.json(pedidos);
  })
);

// GET /api/app/entregador/pedidos/:id
router.get(
  "/pedidos/:id",
  asyncHandler(async (req, res) => {
    await pedidoDoEntregador(req);
    res.json(await prisma.pedido.findUnique({
      where: { id: req.params.id },
      include: { ...INCLUDE_PEDIDO_APP, logs: { orderBy: { createdAt: "asc" } } },
    }));
  })
);

// PATCH /api/app/entregador/pedidos/:id/aceitar
router.patch(
  "/pedidos/:id/aceitar",
  asyncHandler(async (req, res) => {
    exigirAtivo(req);
    if (!req.entregador.online) throw erroHttp(403, "Fique online para aceitar corridas.");
    res.json(await aceitarPedido(req.params.id, req.entregador.id));
  })
);

// PATCH /api/app/entregador/pedidos/:id/etapa  { status: NA_LOJA | EM_ROTA | NO_CLIENTE }
// O entregador avança a entrega: Na loja -> Em rota -> Cheguei no cliente (só para frente).
router.patch(
  "/pedidos/:id/etapa",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoEntregador(req);
    const para = req.body?.status;
    const ordem = ETAPAS_ENTREGADOR.indexOf(para);
    if (ordem < 1) throw erroHttp(400, "Etapa inválida. Use NA_LOJA, EM_ROTA ou NO_CLIENTE.");
    if (!COM_ENTREGADOR.includes(pedido.status)) throw erroHttp(409, "Este pedido não está em andamento com você.");
    if (pedido.status !== "ATRASADO" && ETAPAS_ENTREGADOR.indexOf(pedido.status) >= ordem) throw erroHttp(409, "Essa etapa já foi informada.");
    const { count } = await prisma.pedido.updateMany({
      where: { id: pedido.id, status: pedido.status, entregadorId: req.entregador.id },
      data: { status: para, ...carimbos(pedido, para) },
    });
    if (count === 0) throw erroHttp(409, "O pedido mudou enquanto isso. Atualize a tela.");
    await registrarStatusPedido({ pedidoId: pedido.id, de: pedido.status, para, entregadorId: req.entregador.id, autor: autorEntregador(req) });
    await registrarLog(pedido.id, `${req.entregador.nomeCompleto}: ${ROTULOS[para]}.`);
    res.json(await prisma.pedido.findUnique({ where: { id: pedido.id }, include: INCLUDE_PEDIDO_APP }));
  })
);

// PATCH /api/app/entregador/pedidos/:id/finalizar
router.patch(
  "/pedidos/:id/finalizar",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoEntregador(req);
    if (!COM_ENTREGADOR.includes(pedido.status)) throw erroHttp(409, "Este pedido não está em andamento com você.");
    const atualizado = await prisma.pedido.update({
      where: { id: pedido.id }, data: { status: "ENTREGUE", ...carimbos(pedido, "ENTREGUE") }, include: INCLUDE_PEDIDO_APP,
    });
    await registrarStatusPedido({ pedidoId: pedido.id, de: pedido.status, para: "ENTREGUE", entregadorId: req.entregador.id, autor: autorEntregador(req) });
    await registrarLog(pedido.id, `Entrega concluída por ${req.entregador.nomeCompleto}.`);
    res.json(atualizado);
  })
);

// PATCH /api/app/entregador/pedidos/:id/desistir  { motivo? } — devolve o pedido para a fila
router.patch(
  "/pedidos/:id/desistir",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoEntregador(req);
    if (!COM_ENTREGADOR.includes(pedido.status)) throw erroHttp(409, "Este pedido não está em andamento com você.");
    const atualizado = await prisma.pedido.update({
      where: { id: pedido.id }, data: { status: "PENDENTE", entregadorId: null }, include: INCLUDE_PEDIDO_APP,
    });
    await registrarStatusPedido({ pedidoId: pedido.id, de: pedido.status, para: "PENDENTE", entregadorId: req.entregador.id, autor: autorEntregador(req) });
    const motivo = req.body?.motivo ? ` Motivo: ${req.body.motivo}` : "";
    await registrarLog(pedido.id, `${req.entregador.nomeCompleto} desistiu da corrida.${motivo}`);
    await prisma.notificacao.create({
      data: { tipo: "pedido", texto: `${req.entregador.nomeCompleto} desistiu do pedido ${pedido.codigo}.` },
    });
    res.json(atualizado);
  })
);

// ---------- Promoções ----------

// GET /api/app/entregador/promocoes — promoções valendo agora para este entregador (lista/aba do app)
router.get(
  "/promocoes",
  asyncHandler(async (req, res) => {
    res.json((await vigentesPara(req.entregador)).map(publicoPromocao));
  })
);

// GET /api/app/entregador/promocoes/avisos — pop-ups pendentes (promoção ativada, desativada ou encerrada).
// O app consulta ao abrir e periodicamente; depois de mostrar, confirma com POST .../visto.
router.get(
  "/promocoes/avisos",
  asyncHandler(async (req, res) => {
    const avisos = await avisosPara(req.entregador);
    res.json(avisos.map(a => ({
      ...a,
      titulo: a.tipo === "ATIVADA" ? "Nova promoção!" : "Promoção encerrada",
      mensagem: a.tipo === "ATIVADA"
        ? `${a.promocao.titulo}${a.promocao.premio ? ` — ${a.promocao.premio}` : ""}`
        : `A promoção "${a.promocao.titulo}" não está mais valendo.`,
    })));
  })
);

// POST /api/app/entregador/promocoes/avisos/:avisoId/visto — o pop-up não aparece de novo
router.post(
  "/promocoes/avisos/:avisoId/visto",
  asyncHandler(async (req, res) => {
    if (!/^(fim:)?[a-z0-9]+$/i.test(req.params.avisoId)) return res.status(400).json({ erro: "Aviso inválido." });
    await marcarVisto(req.entregador.id, req.params.avisoId);
    res.json({ ok: true });
  })
);

// ---------- Comissões lançadas pelo ADM (Financeiro › Comissão) ----------

// Manual: paga pela conta a pagar. Automática (por entrega): paga no acerto do entregador.
const INCLUDE_COMISSAO_APP = {
  contaPagar: { select: { paga: true, pagaEm: true, vencimento: true } },
  acerto: { select: { pago: true, pagoEm: true } },
  pedido: { select: { codigo: true } },
};

function comissaoParaApp(c) {
  const paga = !!(c.contaPagar?.paga || c.acerto?.pago);
  return {
    id: c.id, numero: c.numero, origem: c.origem, pedidoCodigo: c.pedido?.codigo || null, comercio: c.comercioNome, quantidadeEntregas: c.quantidadeEntregas,
    valorPorEntrega: c.valorPorEntrega, valor: c.valor, referencia: c.referencia, descricao: c.descricao,
    situacao: paga ? "PAGA" : "A_RECEBER", pagaEm: c.contaPagar?.pagaEm || c.acerto?.pagoEm || null, previsaoPagamento: c.contaPagar?.vencimento || null,
  };
}

// GET /api/app/entregador/comissoes — últimos 90 dias, com total do mês e a receber
router.get(
  "/comissoes",
  asyncHandler(async (req, res) => {
    const desde = new Date(); desde.setHours(0, 0, 0, 0); desde.setDate(desde.getDate() - 89);
    const inicioMes = new Date(); inicioMes.setHours(0, 0, 0, 0); inicioMes.setDate(1);
    const itens = await prisma.comissaoManual.findMany({
      where: { entregadorId: req.entregador.id, referencia: { gte: desde } },
      orderBy: [{ referencia: "desc" }, { numero: "desc" }],
      include: INCLUDE_COMISSAO_APP,
    });
    const soma = lista => Number(lista.reduce((s, c) => s + c.valor, 0).toFixed(2));
    res.json({
      comissoes: itens.map(comissaoParaApp),
      totais: { mes: soma(itens.filter(c => c.referencia >= inicioMes)), aReceber: soma(itens.filter(c => !(c.contaPagar?.paga || c.acerto?.pago))) },
    });
  })
);

// GET /api/app/entregador/comissoes/avisos — comissões ainda não vistas: o app mostra um pop-up para cada uma
router.get(
  "/comissoes/avisos",
  asyncHandler(async (req, res) => {
    const novas = await prisma.comissaoManual.findMany({
      where: { entregadorId: req.entregador.id, vistoEm: null }, orderBy: { createdAt: "asc" }, take: 20,
      include: INCLUDE_COMISSAO_APP,
    });
    const brl = v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    res.json(novas.map(c => ({
      avisoId: c.id, tipo: "COMISSAO", titulo: "Nova comissão!",
      mensagem: c.origem === "AUTOMATICA"
        ? `Você ganhou ${brl(c.valor)} de comissão pela entrega${c.pedido ? ` ${c.pedido.codigo}` : ""} de ${c.comercioNome}.`
        : `Você recebeu ${brl(c.valor)} de comissão por ${c.quantidadeEntregas} entrega${c.quantidadeEntregas > 1 ? "s" : ""} de ${c.comercioNome}.`,
      comissao: comissaoParaApp(c),
    })));
  })
);

// POST /api/app/entregador/comissoes/avisos/:id/visto — o pop-up não aparece de novo
router.post(
  "/comissoes/avisos/:id/visto",
  asyncHandler(async (req, res) => {
    await prisma.comissaoManual.updateMany({ where: { id: req.params.id, entregadorId: req.entregador.id, vistoEm: null }, data: { vistoEm: new Date() } });
    res.json({ ok: true });
  })
);

// GET /api/app/entregador/saque/regras — regras vigentes para o app exibir ao entregador
router.get(
  "/saque/regras",
  asyncHandler(async (req, res) => {
    const regras = await obterRegras();
    const publico = r => ({
      limitePorSolicitacao: r.limitePorSolicitacao,
      maxSolicitacoesDia: r.maxSolicitacoesDia,
      diasPermitidos: r.diasPermitidos,
      datasEspecificas: r.datasEspecificas,
    });
    res.json({ normal: publico(regras.NORMAL), rapido: publico(regras.RAPIDO) });
  })
);

// GET /api/app/entregador/ganhos — entregas concluídas hoje / 7 dias / mês
router.get(
  "/ganhos",
  asyncHandler(async (req, res) => {
    const agora = new Date();
    const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
    const semana = new Date(hoje); semana.setDate(semana.getDate() - 6);
    const mes = new Date(hoje); mes.setDate(1);

    const somar = async desde => {
      const [r, com] = await Promise.all([
        prisma.pedido.aggregate({
          where: { entregadorId: req.entregador.id, status: "ENTREGUE", updatedAt: { gte: desde } },
          _count: { _all: true }, _sum: { valor: true, distanciaKm: true },
        }),
        prisma.comissaoManual.aggregate({ where: { entregadorId: req.entregador.id, referencia: { gte: desde } }, _sum: { valor: true } }),
      ]);
      const entregas = r._count._all;
      return {
        entregas,
        valorEntregas: Number((r._sum.valor || 0).toFixed(2)),
        distanciaKm: Number((r._sum.distanciaKm || 0).toFixed(1)),
        repasseEstimado: req.entregador.taxaEntrega != null ? Number((req.entregador.taxaEntrega * entregas).toFixed(2)) : null,
        comissoes: Number((com._sum.valor || 0).toFixed(2)), // lançadas pelo ADM em Financeiro › Comissão
      };
    };

    const [dia, sete, doMes] = await Promise.all([somar(hoje), somar(semana), somar(mes)]);
    res.json({ hoje: dia, ultimos7Dias: sete, mes: doMes });
  })
);

module.exports = router;
