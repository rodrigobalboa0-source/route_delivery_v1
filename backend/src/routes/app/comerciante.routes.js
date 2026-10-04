// API do SISTEMA DO COMERCIANTE — montada em /api/app/comerciante
const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { requireAuth, requireTipo, assinarToken, TIPOS } = require("../../middleware/auth");
const { INCLUDE_PADRAO, erroHttp, registrarLog, calcularEntrega, criarPedido, soDigitosTelefone, percentualRetorno, recalcularRetorno, salvarCliente } = require("../../services/pedidos.service");
const { buscarEnderecos } = require("../../utils/geo");
const { carimbos, registrarStatusPedido } = require("../../services/historico.service");
const { versaoComercio } = require("../../services/tempoReal.service");
const { TODOS, ABERTOS, COM_ENTREGADOR } = require("../../utils/statusPedido");
const { localizarPendentes } = require("../pedidos.routes");
const { tokenRastreio } = require("../rastreio.routes");
const { distanciaLinhaRetaKm } = require("../../utils/geo");
const { emSegundoPlano } = require("../../utils/segundoPlano");

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

// Funções que o ADM libera (ou não) para cada loja em Configurações › Permissões da loja.
function permissoesLoja(c) {
  return {
    finalizar: !!c.lojaPodeFinalizar,
    editarComercio: !!c.lojaPodeEditarComercio,
    editarEntregador: !!c.lojaPodeEditarEntregador,
    bloquearEntregador: !!c.lojaPodeBloquearEntregador,
    codigoTelefone: !!c.exigirCodigoTelefone,
  };
}
function exigirPermissao(req, nome) {
  if (!permissoesLoja(req.comercio)[nome]) throw erroHttp(403, "Esta função não está liberada para a sua loja. Fale com a equipe.");
}

// Entregador que está (ou esteve) com um pedido desta loja — a loja só mexe em quem trabalhou para ela.
async function entregadorDaLoja(req) {
  const e = await prisma.entregador.findUnique({ where: { id: req.params.entregadorId } });
  const trabalhou = e && await prisma.pedido.count({ where: { comercioId: req.comercio.id, entregadorId: e.id } });
  if (!trabalhou) throw erroHttp(404, "Entregador não encontrado nos seus pedidos.");
  return e;
}

// Volta o pedido para a fila (sem entregador); os entregadores são chamados de novo (push).
async function voltarParaFila(req, pedido, texto) {
  const { count } = await prisma.pedido.updateMany({
    where: { id: pedido.id, status: pedido.status, entregadorId: pedido.entregadorId },
    data: { entregadorId: null, status: "PENDENTE", ...carimbos(pedido, "PENDENTE") },
  });
  if (!count) throw erroHttp(409, "O pedido acabou de mudar. Atualize a tela.");
  await registrarStatusPedido({ pedidoId: pedido.id, de: pedido.status, para: "PENDENTE", entregadorId: pedido.entregadorId, autor: autorComerciante(req) });
  await registrarLog(pedido.id, texto);
}

// GET /api/app/comerciante/me
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    // Só o que a loja precisa ver (observações internas e dados de comissão ficam no ADM).
    const [loja, retornoPercentual] = await Promise.all([
      prisma.comercio.findUnique({
        where: { id: req.comercio.id },
        select: {
          id: true, fotoUrl: true, segmento: true, razaoSocial: true, nomeFantasia: true, tipoDocumento: true, documento: true,
          nomeCompleto: true, telefone: true, email: true, metodoPagamento: true, createdAt: true,
          enderecos: { orderBy: { principal: "desc" } },
          precificacoesModal: { select: { veiculo: true } },
        },
      }),
      percentualRetorno(),
    ]);
    res.json({ ...loja, retornoPercentual, permissoes: permissoesLoja(req.comercio) });
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
      prisma.entregador.count({ where: { online: true, status: "ATIVO", bloqueado: false, bloqueiosLoja: { none: { comercioId } }, OR: [
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

const clientePublico = c => ({
  nome: c.nome, telefone: c.telefone, endereco: c.endereco, complemento: c.complemento,
  lat: c.lat, lng: c.lng, totalPedidos: c.totalPedidos, ultimoPedidoEm: c.ultimoPedidoEm,
});

// GET /api/app/comerciante/clientes?busca=.. — clientes salvos da loja (pelo telefone), mais recentes primeiro.
router.get(
  "/clientes",
  asyncHandler(async (req, res) => {
    const q = String(req.query.busca || "").trim();
    const digitos = soDigitosTelefone(q);
    const where = { comercioId: req.comercio.id };
    if (q) {
      where.OR = [
        { nome: { contains: q, mode: "insensitive" } },
        { endereco: { contains: q, mode: "insensitive" } },
        ...(digitos.length >= 2 ? [{ telefone: { contains: digitos } }] : []),
      ];
    }
    const lista = await prisma.clienteComercio.findMany({ where, orderBy: { ultimoPedidoEm: "desc" }, take: 8 });
    res.json(lista.map(clientePublico));
  })
);

// GET /api/app/comerciante/clientes/telefone/:telefone — cliente salvo com esse telefone (404 se novo)
router.get(
  "/clientes/telefone/:telefone",
  asyncHandler(async (req, res) => {
    const telefone = soDigitosTelefone(req.params.telefone);
    const c = telefone.length >= 8
      ? await prisma.clienteComercio.findUnique({ where: { comercioId_telefone: { comercioId: req.comercio.id, telefone } } })
      : null;
    if (!c) return res.status(404).json({ erro: "Cliente novo." });
    res.json(clientePublico(c));
  })
);

// GET /api/app/comerciante/enderecos?q=.. — busca de endereços no OpenStreetMap, perto da loja
router.get(
  "/enderecos",
  asyncHandler(async (req, res) => {
    const loja = await prisma.comercioEndereco.findFirst({ where: { comercioId: req.comercio.id, principal: true }, select: { lat: true, lng: true } });
    try {
      res.json(await buscarEnderecos(req.query.q, loja?.lat != null ? loja : null));
    } catch (err) {
      throw erroHttp(503, err.message);
    }
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
        agendadoPara: true, valor: true, prontoEm: true, comercioId: true, latDestino: true, lngDestino: true, createdAt: true, observacao: true,
        integracaoSlug: true, codigoExterno: true, aguardandoRotaAte: true,
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
        prontoEm: p.prontoEm, createdAt: p.createdAt, observacao: p.observacao, rastreio: tokenRastreio(p.id),
        integracaoSlug: p.integracaoSlug, codigoExterno: p.codigoExterno, aguardandoRotaAte: p.aguardandoRotaAte,
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
    const p = await prisma.pedido.findUnique({
      where: { id: req.params.id },
      include: {
        ...INCLUDE_PADRAO,
        entregador: { select: { id: true, nomeCompleto: true, telefone: true, fotoUrl: true, veiculoTipo: true, veiculoModelo: true, veiculoPlaca: true, veiculoAno: true, lat: true, lng: true, localizacaoEm: true } },
        logs: { orderBy: { createdAt: "asc" } },
        disputasIfood: { orderBy: { createdAt: "desc" } },
      },
    });
    const bloqueado = p.entregadorId && await prisma.comercioEntregadorBloqueio.count({ where: { comercioId: req.comercio.id, entregadorId: p.entregadorId } });
    res.json({ ...p, entregadorBloqueado: !!bloqueado, rastreio: tokenRastreio(p.id) });
  })
);

// POST /api/app/comerciante/pedidos/calcular  { endereco, veiculo? }
router.post(
  "/pedidos/calcular",
  asyncHandler(async (req, res) => {
    if (!req.body.endereco) return res.status(400).json({ erro: 'Informe o "endereco".' });
    const { endereco, veiculo, destino, destinoAprox, retorno } = req.body;
    res.json(await calcularEntrega({ comercioId: req.comercio.id, endereco, veiculo, destino, destinoAprox, retorno: !!retorno }));
  })
);

// POST /api/app/comerciante/pedidos — o comércio só cria pedidos para si mesmo
router.post(
  "/pedidos",
  asyncHandler(async (req, res) => {
    const { clienteNome, clienteTelefone, endereco, complemento, retorno, agendadoPara, prazoDesejado, formaPagamento, observacao,
      notaFiscalNumero, notaFiscalChave, notaFiscalValor, destino, destinoAprox, veiculo } = req.body;
    // (o valor é sempre calculado pelo sistema — a loja não define o preço)
    // Código de entrega da loja: o entregador finaliza com os 4 últimos números do telefone informado agora.
    let codigoConfirmacao = null;
    if (req.comercio.exigirCodigoTelefone) {
      const fone = soDigitosTelefone(clienteTelefone);
      if (![10, 11].includes(fone.length)) {
        throw erroHttp(400, "Informe o telefone do cliente com DDD: os 4 últimos números são o código para o entregador finalizar a entrega.");
      }
      codigoConfirmacao = fone.slice(-4);
    }
    const pedido = await criarPedido(
      { comercioId: req.comercio.id, clienteNome, clienteTelefone, endereco, complemento, retorno, agendadoPara, prazoDesejado, formaPagamento, observacao,
        notaFiscalNumero, notaFiscalChave, notaFiscalValor, destino, destinoAprox, veiculo, codigoConfirmacao },
      "SISTEMA_COMERCIANTE",
      autorComerciante(req)
    );
    // "Já está pronto": libera na hora para os entregadores (agendado espera o horário).
    res.status(201).json(req.body.pronto && !pedido.agendadoPara ? await marcarPronto(req, pedido) : pedido);
  })
);

// PUT /api/app/comerciante/pedidos/:id — a loja edita os dados do pedido (até ser entregue/cancelado).
// Retorno ligado/desligado ou endereço novo recalculam a taxa; o app do entregador atualiza sozinho.
// { clienteNome?, clienteTelefone?, endereco?, destino?, destinoAprox?, complemento?, observacao?, formaPagamento?, retorno? }
router.put(
  "/pedidos/:id",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoComercio(req);
    if (["ENTREGUE", "CANCELADO"].includes(pedido.status)) throw erroHttp(409, "Pedido já finalizado — não dá para editar.");
    const b = req.body || {};
    const data = {};
    const texto = v => (v === undefined ? undefined : String(v ?? "").trim() || null);
    for (const k of ["clienteTelefone", "complemento", "observacao", "formaPagamento"]) if (b[k] !== undefined) data[k] = texto(b[k]);
    if (b.clienteNome !== undefined) {
      if (!String(b.clienteNome || "").trim()) throw erroHttp(400, "Informe o nome do cliente.");
      data.clienteNome = String(b.clienteNome).trim();
    }
    const retorno = b.retorno !== undefined ? !!b.retorno : pedido.retorno;
    const logs = [];
    const novoEndereco = b.endereco !== undefined && String(b.endereco).trim() && String(b.endereco).trim() !== pedido.endereco;
    if (novoEndereco) {
      if (COM_ENTREGADOR.includes(pedido.status) && pedido.status !== "ATRIBUIDO") throw erroHttp(409, "O entregador já saiu com o pedido — fale com a equipe para mudar o endereço.");
      const endereco = String(b.endereco).trim();
      const c = await calcularEntrega({ comercioId: req.comercio.id, endereco, destino: b.destino, destinoAprox: b.destinoAprox, retorno });
      Object.assign(data, {
        endereco, retorno, valor: c.valor, acrescimoRetorno: retorno ? c.acrescimoRetorno : null, distanciaKm: c.distanciaKm,
        latDestino: c.destino?.lat ?? null, lngDestino: c.destino?.lng ?? null,
      });
      logs.push(`Endereço alterado pela loja: taxa recalculada para ${c.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (${c.distanciaKm} km).`);
    } else if (b.retorno !== undefined && retorno !== pedido.retorno) {
      const novo = await recalcularRetorno(pedido, retorno);
      data.retorno = retorno;
      if (novo) { data.valor = novo.valor; data.acrescimoRetorno = novo.acrescimoRetorno; logs.push(novo.texto); }
      else logs.push(retorno ? "Loja marcou entrega com retorno." : "Loja retirou o retorno.");
    }
    if (!Object.keys(data).length) return res.json(await prisma.pedido.findUnique({ where: { id: pedido.id }, include: INCLUDE_PADRAO }));
    const atualizado = await prisma.pedido.update({ where: { id: pedido.id }, data, include: INCLUDE_PADRAO });
    await registrarLog(pedido.id, "Dados do pedido editados pela loja.");
    for (const l of logs) await registrarLog(pedido.id, l);
    if (data.clienteTelefone !== undefined || data.clienteNome !== undefined || novoEndereco) {
      await salvarCliente(req.comercio.id, {
        telefone: atualizado.clienteTelefone, nome: atualizado.clienteNome, endereco: atualizado.endereco,
        complemento: atualizado.complemento, lat: atualizado.latDestino, lng: atualizado.lngDestino,
      }).catch(() => {});
    }
    res.json(atualizado);
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

// PATCH /api/app/comerciante/pedidos/:id/cancelar  { motivo? } — enquanto não foi entregue
// (com entregador, a corrida some do app dele na hora).
router.patch(
  "/pedidos/:id/cancelar",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoComercio(req);
    if (!ABERTOS.includes(pedido.status)) throw erroHttp(409, "Este pedido já foi finalizado ou cancelado.");
    // Pedido do iFood: pede o cancelamento ao iFood com o motivo escolhido (cancela aqui quando o iFood confirmar).
    if (pedido.integracaoSlug === "ifood" && pedido.idExterno) {
      if (!req.body?.motivoIfood) throw erroHttp(400, "Pedido do iFood: escolha o motivo de cancelamento aceito pelo iFood.");
      return res.json(await require("../../services/ifood.service").cancelarNoIfood(pedido, req.body.motivoIfood, autorComerciante(req).autorNome));
    }
    const atualizado = await prisma.pedido.update({
      where: { id: pedido.id }, data: { status: "CANCELADO", ...carimbos(pedido, "CANCELADO") }, include: INCLUDE_PADRAO,
    });
    await registrarStatusPedido({ pedidoId: pedido.id, de: pedido.status, para: "CANCELADO", entregadorId: pedido.entregadorId, autor: autorComerciante(req) });
    const motivo = String(req.body?.motivo || "").trim().slice(0, 300);
    await registrarLog(pedido.id, `Pedido cancelado pelo comércio.${motivo ? ` Motivo: ${motivo}` : ""}`);
    res.json(atualizado);
  })
);

// GET /api/app/comerciante/pedidos/:id/ifood/motivos-cancelamento — motivos aceitos pelo iFood
router.get(
  "/pedidos/:id/ifood/motivos-cancelamento",
  asyncHandler(async (req, res) => {
    res.json(await require("../../services/ifood.service").motivosCancelamento(await pedidoDoComercio(req)));
  })
);

// GET /api/app/comerciante/ifood/negociacoes — pedidos do cliente no iFood esperando resposta da loja
router.get(
  "/ifood/negociacoes",
  asyncHandler(async (req, res) => {
    const lista = await prisma.ifoodDisputa.findMany({
      where: { status: "PENDENTE", pedido: { comercioId: req.comercio.id }, OR: [{ expiraEm: null }, { expiraEm: { gt: new Date() } }] },
      orderBy: { expiraEm: "asc" },
      include: { pedido: { select: { id: true, codigo: true, codigoExterno: true, clienteNome: true } } },
    });
    res.json(lista);
  })
);

// POST /api/app/comerciante/pedidos/:id/ifood/disputas/:disputaId  { resposta, motivo?, alternativaId?, valor?, minutos? }
router.post(
  "/pedidos/:id/ifood/disputas/:disputaId",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoComercio(req);
    const d = await prisma.ifoodDisputa.findUnique({ where: { id: req.params.disputaId } });
    if (!d || d.pedidoId !== pedido.id) throw erroHttp(404, "Negociação não encontrada.");
    res.json(await require("../../services/ifood.service").responderDisputa(d, req.body || {}, autorComerciante(req).autorNome));
  })
);

// PATCH /api/app/comerciante/pedidos/:id/finalizar — marca como entregue (se o ADM liberou).
// Com entregador, conta como entrega dele (ganho, ranking, acerto). iFood com código continua pelo app do entregador.
router.patch(
  "/pedidos/:id/finalizar",
  asyncHandler(async (req, res) => {
    exigirPermissao(req, "finalizar");
    const pedido = await pedidoDoComercio(req);
    if (!ABERTOS.includes(pedido.status)) throw erroHttp(409, "Este pedido já foi finalizado ou cancelado.");
    // Código do iFood só o iFood confere (pelo app do entregador). O código da própria loja não impede a loja de finalizar.
    if (pedido.integracaoSlug === "ifood" && pedido.exigeCodigoEntrega) throw erroHttp(409, "Pedido do iFood com código de entrega: o entregador finaliza pelo app digitando o código do cliente.");
    const { count } = await prisma.pedido.updateMany({
      where: { id: pedido.id, status: pedido.status }, data: { status: "ENTREGUE", ...carimbos(pedido, "ENTREGUE") },
    });
    if (!count) throw erroHttp(409, "O pedido acabou de mudar. Atualize a tela.");
    await registrarStatusPedido({ pedidoId: pedido.id, de: pedido.status, para: "ENTREGUE", entregadorId: pedido.entregadorId, autor: autorComerciante(req) });
    await registrarLog(pedido.id, "Pedido finalizado pela loja.");
    res.json(await prisma.pedido.findUnique({ where: { id: pedido.id }, include: INCLUDE_PADRAO }));
  })
);

// PATCH /api/app/comerciante/pedidos/:id/reprocurar — pedido pronto que ninguém aceitou ainda:
// chama de novo todos os entregadores (inclusive quem recusou), com novo alarme. Na rota, vale a rota inteira.
// Depois do aceite não existe mais: para mudar o entregador, a loja usa "Trocar entregador".
router.patch(
  "/pedidos/:id/reprocurar",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoComercio(req);
    if (pedido.entregadorId || COM_ENTREGADOR.includes(pedido.status)) throw erroHttp(409, "O entregador já aceitou este pedido. Para mudar, use “Trocar entregador”.");
    if (pedido.status !== "PENDENTE") throw erroHttp(409, "Só dá para reprocurar pedido pronto que ainda não foi aceito.");
    if (pedido.aguardandoRotaAte) throw erroHttp(409, "O pedido está sendo roteirizado: em alguns segundos os entregadores são chamados.");
    const ids = pedido.rotaId
      ? (await prisma.pedido.findMany({ where: { rotaId: pedido.rotaId }, select: { id: true } })).map(p => p.id)
      : [pedido.id];
    await prisma.$transaction([
      prisma.pedidoRecusa.deleteMany({ where: { pedidoId: { in: ids } } }),
      prisma.pedido.updateMany({ where: { id: { in: ids } }, data: { reprocuradoEm: new Date() } }),
    ]);
    await registrarLog(pedido.id, "Loja reprocurou: entregadores chamados de novo (inclusive quem tinha recusado).");
    // Recomeça a chamada pelo mais perto da loja.
    emSegundoPlano(() => require("../../services/despacho.service").iniciar(pedido.rotaId ? { rotaId: pedido.rotaId } : { pedidoId: pedido.id }), "Chamada reprocurar");
    res.json(await prisma.pedido.findUnique({ where: { id: pedido.id }, include: INCLUDE_PADRAO }));
  })
);

// ---------- Créditos ----------

const r2 = v => Math.round(v * 100) / 100;
// Comprovante: imagem (já reduzida no navegador) ou PDF, como data URL, até ~2,5 MB.
const comprovanteValido = v => typeof v === "string" && v.length <= 3.5 * 1024 * 1024
  && /^data:(image\/(jpeg|jpg|png|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(v);

// GET /api/app/comerciante/creditos — saldo, totais, extrato e solicitações (sem o comprovante)
router.get(
  "/creditos",
  asyncHandler(async (req, res) => {
    const [movimentos, solicitacoes, g] = await Promise.all([
      prisma.creditoMovimento.findMany({ where: { comercioId: req.comercio.id }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, tipo: true, valor: true, descricao: true, createdAt: true } }),
      prisma.creditoSolicitacao.findMany({ where: { comercioId: req.comercio.id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, valor: true, metodo: true, observacao: true, status: true, motivo: true, analisadoEm: true, createdAt: true } }),
      // Totais pelo extrato completo (a lista acima é limitada).
      prisma.creditoMovimento.groupBy({ by: ["tipo"], where: { comercioId: req.comercio.id }, _sum: { valor: true } }),
    ]);
    const total = tipo => r2(g.find(x => x.tipo === tipo)?._sum.valor || 0);
    const totalComprado = total("CREDITO"), totalUtilizado = total("DEBITO");
    res.json({ saldo: r2(totalComprado - totalUtilizado), totalComprado, totalUtilizado, movimentos, solicitacoes });
  })
);

// POST /api/app/comerciante/creditos/solicitar { valor, metodo: PIX|OUTROS, comprovante, observacao? }
// Só vai para análise com o comprovante do pagamento.
router.post(
  "/creditos/solicitar",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const valor = r2(Number(String(b.valor ?? "").replace(",", ".")));
    if (!Number.isFinite(valor) || valor <= 0) throw erroHttp(400, "Informe um valor maior que zero.");
    if (valor > 100000) throw erroHttp(400, "Valor acima do permitido por solicitação (R$ 100.000,00).");
    if (!["PIX", "OUTROS"].includes(b.metodo)) throw erroHttp(400, "Escolha o método de pagamento.");
    if (!comprovanteValido(b.comprovante)) throw erroHttp(400, "Anexe o comprovante do pagamento (imagem ou PDF de até 2,5 MB).");
    const observacao = String(b.observacao || "").trim().slice(0, 500) || null;
    const s = await prisma.creditoSolicitacao.create({
      data: { comercioId: req.comercio.id, valor, metodo: b.metodo, comprovante: b.comprovante, observacao },
      select: { id: true, valor: true, metodo: true, observacao: true, status: true, createdAt: true },
    });
    await prisma.notificacao.create({ data: { tipo: "financeiro", texto: `${req.comercio.nomeFantasia} pediu R$ ${valor.toFixed(2).replace(".", ",")} de crédito (${b.metodo === "PIX" ? "PIX" : "outros"}). Analise em Financeiro › Crédito.` } }).catch(() => {});
    res.status(201).json(s);
  })
);

// Entregadores que podem pegar corridas desta loja (online, ativos, com permissão de coleta e sem bloqueio da loja).
async function entregadoresQuePodem(comercioId) {
  return prisma.entregador.findMany({
    where: {
      online: true, status: "ATIVO", bloqueado: false, bloqueiosLoja: { none: { comercioId } },
      OR: [{ permissaoColeta: "TODOS_CLIENTES" }, { comerciosPermitidos: { some: { comercioId } } }],
    },
    select: {
      id: true, nomeCompleto: true, fotoUrl: true, veiculoTipo: true, veiculoPlaca: true, lat: true, lng: true, localizacaoEm: true,
      _count: { select: { pedidos: { where: { status: { in: COM_ENTREGADOR } } } } },
    },
  });
}

// GET /api/app/comerciante/entregadores-disponiveis — para "Trocar entregador" (mais perto da loja primeiro)
router.get(
  "/entregadores-disponiveis",
  asyncHandler(async (req, res) => {
    const [lista, loja] = await Promise.all([
      entregadoresQuePodem(req.comercio.id),
      prisma.comercioEndereco.findFirst({ where: { comercioId: req.comercio.id, principal: true }, select: { lat: true, lng: true } }),
    ]);
    res.json(lista.map(e => ({
      id: e.id, nomeCompleto: e.nomeCompleto, fotoUrl: e.fotoUrl, veiculoTipo: e.veiculoTipo, veiculoPlaca: e.veiculoPlaca,
      emAndamento: e._count.pedidos,
      distanciaKm: loja?.lat != null && e.lat != null ? Number(distanciaLinhaRetaKm({ lat: e.lat, lng: e.lng }, loja).toFixed(1)) : null,
    })).sort((a, b) => (a.distanciaKm ?? 999) - (b.distanciaKm ?? 999)));
  })
);

// PATCH /api/app/comerciante/pedidos/:id/trocar-entregador  { entregadorId } — passa a corrida para outro entregador
router.patch(
  "/pedidos/:id/trocar-entregador",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoComercio(req);
    if (!COM_ENTREGADOR.includes(pedido.status)) throw erroHttp(409, "Só dá para trocar o entregador depois que a corrida foi aceita.");
    const novo = (await entregadoresQuePodem(req.comercio.id)).find(e => e.id === req.body?.entregadorId);
    if (!novo) throw erroHttp(400, "Escolha um entregador online da lista.");
    if (novo.id === pedido.entregadorId) throw erroHttp(400, "Este já é o entregador do pedido.");
    const antigo = await prisma.entregador.findUnique({ where: { id: pedido.entregadorId }, select: { nomeCompleto: true } });
    const { count } = await prisma.pedido.updateMany({
      where: { id: pedido.id, entregadorId: pedido.entregadorId, status: pedido.status },
      data: { entregadorId: novo.id, aceitoEm: new Date() },
    });
    if (!count) throw erroHttp(409, "O pedido acabou de mudar. Atualize a tela.");
    await registrarLog(pedido.id, `Loja trocou o entregador: de ${antigo?.nomeCompleto || "—"} para ${novo.nomeCompleto}.`);
    emSegundoPlano(() => require("../../services/push.service").avisarAtribuicao(pedido.id, novo.id), "Push atribuição");
    res.json(await prisma.pedido.findUnique({ where: { id: pedido.id }, include: INCLUDE_PADRAO }));
  })
);

// PUT /api/app/comerciante/entregadores/:entregadorId  — editar dados do entregador (se o ADM liberou)
router.put(
  "/entregadores/:entregadorId",
  asyncHandler(async (req, res) => {
    exigirPermissao(req, "editarEntregador");
    const e = await entregadorDaLoja(req);
    const b = req.body || {};
    const data = {};
    const texto = (v, max = 80) => String(v ?? "").trim().slice(0, max);
    if (b.nomeCompleto !== undefined) {
      if (texto(b.nomeCompleto).split(/\s+/).length < 2) throw erroHttp(400, "Informe nome e sobrenome do entregador.");
      data.nomeCompleto = texto(b.nomeCompleto);
    }
    if (b.telefone !== undefined) {
      const d = String(b.telefone).replace(/\D/g, "");
      if (d && ![10, 11].includes(d.length)) throw erroHttp(400, "Telefone com DDD (10 ou 11 dígitos).");
      data.telefone = texto(b.telefone, 20) || null;
    }
    if (b.veiculoTipo !== undefined) {
      if (!["MOTO", "BIKE", "CARRO"].includes(b.veiculoTipo)) throw erroHttp(400, "Veículo inválido.");
      data.veiculoTipo = b.veiculoTipo;
    }
    if (b.veiculoModelo !== undefined) data.veiculoModelo = texto(b.veiculoModelo) || null;
    if (b.veiculoPlaca !== undefined) {
      const placa = texto(b.veiculoPlaca, 8).toUpperCase();
      if (placa && !/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/.test(placa)) throw erroHttp(400, "Placa inválida (ABC1D23 ou ABC-1234).");
      data.veiculoPlaca = placa || null;
    }
    if (b.veiculoAno !== undefined) {
      const ano = texto(b.veiculoAno, 4);
      if (ano && !/^(19[5-9]\d|20\d{2})$/.test(ano)) throw erroHttp(400, "Ano do veículo inválido.");
      data.veiculoAno = ano || null;
    }
    if (!Object.keys(data).length) throw erroHttp(400, "Nada para alterar.");
    const atualizado = await prisma.entregador.update({
      where: { id: e.id }, data,
      select: { id: true, nomeCompleto: true, telefone: true, fotoUrl: true, veiculoTipo: true, veiculoModelo: true, veiculoPlaca: true, veiculoAno: true },
    });
    const mudou = Object.keys(data).join(", ");
    await prisma.entregadorStatusHistorico.create({
      data: { entregadorId: e.id, tipo: "CADASTRO", para: `Dados alterados pela loja (${mudou})`, autorTipo: "COMERCIANTE", autorNome: autorComerciante(req).autorNome },
    });
    await prisma.notificacao.create({ data: { tipo: "cadastro", texto: `${req.comercio.nomeFantasia} alterou dados do entregador ${atualizado.nomeCompleto} (${mudou}).` } });
    res.json(atualizado);
  })
);

// POST /api/app/comerciante/entregadores/:entregadorId/bloquear  { motivo?, pedidoId? }
// Bloqueio só nesta loja (se o ADM liberou). Com pedidoId, tira o entregador desse pedido e chama outro.
router.post(
  "/entregadores/:entregadorId/bloquear",
  asyncHandler(async (req, res) => {
    exigirPermissao(req, "bloquearEntregador");
    const e = await entregadorDaLoja(req);
    const motivo = String(req.body?.motivo || "").trim().slice(0, 300) || null;
    await prisma.comercioEntregadorBloqueio.upsert({
      where: { comercioId_entregadorId: { comercioId: req.comercio.id, entregadorId: e.id } },
      update: { motivo, autorNome: req.conta.email },
      create: { comercioId: req.comercio.id, entregadorId: e.id, motivo, autorNome: req.conta.email },
    });
    await prisma.notificacao.create({ data: { tipo: "cadastro", texto: `${req.comercio.nomeFantasia} bloqueou o entregador ${e.nomeCompleto} na loja.${motivo ? ` Motivo: ${motivo}` : ""}` } });
    let pedido = null;
    if (req.body?.pedidoId) {
      req.params.id = req.body.pedidoId;
      pedido = await pedidoDoComercio(req);
      if (pedido.entregadorId === e.id && COM_ENTREGADOR.includes(pedido.status)) {
        await voltarParaFila(req, pedido, `Loja bloqueou ${e.nomeCompleto} e está procurando outro entregador.`);
      }
    }
    res.json({ ok: true, mensagem: `${e.nomeCompleto} não recebe mais corridas da sua loja.` });
  })
);

// DELETE /api/app/comerciante/entregadores/:entregadorId/bloquear — desbloqueia
router.delete(
  "/entregadores/:entregadorId/bloquear",
  asyncHandler(async (req, res) => {
    exigirPermissao(req, "bloquearEntregador");
    await prisma.comercioEntregadorBloqueio.deleteMany({ where: { comercioId: req.comercio.id, entregadorId: req.params.entregadorId } });
    res.json({ ok: true });
  })
);

// GET /api/app/comerciante/entregadores-bloqueados
router.get(
  "/entregadores-bloqueados",
  asyncHandler(async (req, res) => {
    const lista = await prisma.comercioEntregadorBloqueio.findMany({
      where: { comercioId: req.comercio.id }, orderBy: { createdAt: "desc" },
      include: { entregador: { select: { id: true, nomeCompleto: true, fotoUrl: true, veiculoTipo: true } } },
    });
    res.json(lista.map(b => ({ id: b.id, motivo: b.motivo, createdAt: b.createdAt, entregador: b.entregador })));
  })
);

// PUT /api/app/comerciante/me — a loja edita os próprios dados (se o ADM liberou)
// { nomeFantasia?, nomeCompleto?, telefone?, fotoUrl?, endereco?: { rua, numero, complemento, bairro, cidade, cep, referencia, lat, lng } }
router.put(
  "/me",
  asyncHandler(async (req, res) => {
    exigirPermissao(req, "editarComercio");
    const b = req.body || {};
    const texto = (v, max = 120) => String(v ?? "").trim().slice(0, max);
    const data = {};
    if (b.nomeFantasia !== undefined) {
      if (!texto(b.nomeFantasia)) throw erroHttp(400, "Informe o nome da loja.");
      data.nomeFantasia = texto(b.nomeFantasia);
    }
    if (b.nomeCompleto !== undefined) data.nomeCompleto = texto(b.nomeCompleto) || null;
    if (b.telefone !== undefined) data.telefone = texto(b.telefone, 20) || null;
    if (b.fotoUrl !== undefined) {
      if (b.fotoUrl && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.fotoUrl)) throw erroHttp(400, "Envie a foto em JPG, PNG ou WEBP.");
      if (b.fotoUrl && b.fotoUrl.length > 1.5 * 1024 * 1024) throw erroHttp(400, "A foto é grande demais.");
      data.fotoUrl = b.fotoUrl || null;
    }
    let novoEndereco = null;
    if (b.endereco) {
      const a = b.endereco;
      const lat = Number(a.lat), lng = Number(a.lng);
      if (!texto(a.rua)) throw erroHttp(400, "Informe a rua do endereço de coleta.");
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw erroHttp(400, "Escolha o endereço de coleta na lista de sugestões (para achar no mapa).");
      novoEndereco = {
        rua: texto(a.rua), numero: texto(a.numero, 20) || null, complemento: texto(a.complemento) || null, bairro: texto(a.bairro) || null,
        cidade: texto(a.cidade) || null, cep: texto(a.cep, 10) || null, referencia: texto(a.referencia, 200) || null, lat, lng,
      };
    }
    await prisma.$transaction(async tx => {
      if (Object.keys(data).length) await tx.comercio.update({ where: { id: req.comercio.id }, data });
      if (novoEndereco) {
        const atual = await tx.comercioEndereco.findFirst({ where: { comercioId: req.comercio.id, principal: true } });
        if (atual) await tx.comercioEndereco.update({ where: { id: atual.id }, data: novoEndereco });
        else await tx.comercioEndereco.create({ data: { ...novoEndereco, comercioId: req.comercio.id, principal: true } });
      }
    });
    const mudou = [...Object.keys(data), ...(novoEndereco ? ["endereço de coleta"] : [])];
    if (mudou.length) await prisma.notificacao.create({ data: { tipo: "cadastro", texto: `${data.nomeFantasia || req.comercio.nomeFantasia} alterou os dados da loja (${mudou.join(", ")}).` } });
    res.json({ ok: true });
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
