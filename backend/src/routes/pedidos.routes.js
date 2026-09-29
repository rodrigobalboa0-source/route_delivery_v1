const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { INCLUDE_PADRAO, erroHttp, gerarCodigoPedido, registrarLog, dadosNotaFiscal, localizarDestino } = require("../services/pedidos.service");
const { autorDe, carimbos, registrarStatusPedido } = require("../services/historico.service");
const { emSegundoPlano } = require("../utils/segundoPlano");

const router = express.Router();

const { TODOS: STATUS, ABERTOS, COM_ENTREGADOR, ROTULOS } = require("../utils/statusPedido");
const CAMPOS_EDITAVEIS = ["clienteNome", "clienteTelefone", "endereco", "complemento", "retorno", "valor", "distanciaKm", "formaPagamento", "prazoDesejado", "observacao"];

function autor(req) {
  return req.conta?.nome ? ` (por ${req.conta.nome})` : "";
}

// Muda o pedido de status só se o status atual for um dos permitidos.
async function transicionar(req, statusPermitidos, data, textoLog) {
  const atual = await prisma.pedido.findUnique({ where: { id: req.params.id } });
  if (!atual) throw erroHttp(404, "Pedido não encontrado.");
  if (!statusPermitidos.includes(atual.status)) {
    throw erroHttp(409, `Ação não permitida para pedidos com status ${atual.status}.`);
  }
  const para = data.status || atual.status;
  const pedido = await prisma.pedido.update({
    where: { id: atual.id }, data: { ...data, ...carimbos(atual, para) }, include: INCLUDE_PADRAO,
  });
  // Entregador envolvido: o novo (atribuir/trocar) ou o que estava (reprocurar/cancelar/finalizar).
  await registrarStatusPedido({
    pedidoId: pedido.id, de: atual.status, para, entregadorId: data.entregadorId || atual.entregadorId, autor: autorDe(req),
  });
  await registrarLog(pedido.id, textoLog + autor(req));
  return pedido;
}

const ORIGENS = ["PAINEL_ADMIN", "SISTEMA_COMERCIANTE", "APP_COMERCIANTE", "INTEGRACAO"];

// Filtros compartilhados pela lista e pela contagem, para os números baterem com a tabela.
//   comercioId, entregadorId, busca, cidade (do comércio), origem, desde/ate (data de criação)
//   status só entra na lista (a contagem mostra todos os status do recorte).
function montarWhere(q, { comStatus = true } = {}) {
  const where = {};
  if (comStatus && q.status && STATUS.includes(q.status)) where.status = q.status;
  if (q.comercioId) where.comercioId = q.comercioId;
  if (q.entregadorId) where.entregadorId = q.entregadorId;
  if (q.origem && ORIGENS.includes(q.origem)) where.origem = q.origem;
  if (q.cidade) {
    where.comercio = { enderecos: { some: { cidade: { contains: q.cidade, mode: "insensitive" } } } };
  }
  // Condições com OR ficam em AND para não se sobrescreverem.
  const e = [];
  if (q.desde || q.ate) {
    const createdAt = {};
    if (q.desde) createdAt.gte = new Date(q.desde);
    if (q.ate) createdAt.lte = new Date(q.ate);
    // incluirAbertos=1 (tela de Operação): pedido ainda em aberto aparece mesmo criado antes do período.
    if (q.incluirAbertos === "1") e.push({ OR: [{ createdAt }, { status: { in: ABERTOS } }] });
    else where.createdAt = createdAt;
  }
  // notaFiscal=com|sem — entregas com ou sem nota fiscal informada
  if (q.notaFiscal === "com") e.push({ OR: [{ notaFiscalNumero: { not: null } }, { notaFiscalChave: { not: null } }] });
  if (q.notaFiscal === "sem") e.push({ notaFiscalNumero: null, notaFiscalChave: null });
  if (q.busca) {
    e.push({ OR: [
      { codigo: { contains: q.busca, mode: "insensitive" } },
      { clienteNome: { contains: q.busca, mode: "insensitive" } },
      { endereco: { contains: q.busca, mode: "insensitive" } },
      { notaFiscalNumero: { contains: q.busca } },
    ] });
  }
  if (e.length) where.AND = e;
  return where;
}

// GET /api/pedidos?status&comercioId&entregadorId&busca&cidade&origem&desde&ate&limite
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const limite = Math.min(Number(req.query.limite) || 200, 1000);
    const pedidos = await prisma.pedido.findMany({
      where: montarWhere(req.query),
      include: INCLUDE_PADRAO,
      orderBy: { createdAt: "desc" },
      take: limite,
    });
    // Na Operação, os pedidos em aberto vêm primeiro (mantendo o mais novo no topo dentro de cada grupo).
    if (req.query.incluirAbertos === "1") {
      const aberto = p => (ABERTOS.includes(p.status) ? 0 : 1);
      pedidos.sort((a, b) => aberto(a) - aberto(b));
    }
    res.json(pedidos);
  })
);

// GET /api/pedidos/contagem — cards de status; aceita os mesmos filtros da lista (menos status).
router.get(
  "/contagem",
  asyncHandler(async (req, res) => {
    const grupos = await prisma.pedido.groupBy({
      by: ["status"], where: montarWhere(req.query, { comStatus: false }), _count: { _all: true },
    });
    const contagem = Object.fromEntries(STATUS.map(s => [s, 0]));
    grupos.forEach(g => { contagem[g.status] = g._count._all; });
    res.json(contagem);
  })
);

// GET /api/pedidos/cidades — cidades dos comércios, para o filtro "Cidade"
router.get(
  "/cidades",
  asyncHandler(async (req, res) => {
    const linhas = await prisma.comercioEndereco.findMany({
      where: { cidade: { not: null } }, distinct: ["cidade"], select: { cidade: true }, orderBy: { cidade: "asc" },
    });
    res.json(linhas.map(l => l.cidade).filter(Boolean));
  })
);

// ---------- Mapa da Operação ----------

const STATUS_ABERTOS = ABERTOS;
const tentativasLocalizar = new Map(); // pedidoId -> quando tentou (não repete por 10 min)
let localizando = false;

// Pedidos abertos sem posição (ex.: criados com o serviço de mapas fora do ar): localiza em
// segundo plano, poucos por vez e 1 por segundo (limite do serviço gratuito de endereços).
function localizarPendentes(pedidos) {
  if (localizando) return;
  const agora = Date.now();
  const fila = pedidos.filter(p => p.latDestino == null && agora - (tentativasLocalizar.get(p.id) || 0) > 10 * 60 * 1000).slice(0, 3);
  if (!fila.length) return;
  localizando = true;
  emSegundoPlano(async () => {
    try {
      for (const p of fila) {
        tentativasLocalizar.set(p.id, Date.now());
        const d = await localizarDestino(p.comercioId, p.endereco);
        // Só grava se o endereço não mudou enquanto isso.
        if (d) await prisma.pedido.updateMany({ where: { id: p.id, endereco: p.endereco, latDestino: null }, data: { latDestino: d.lat, lngDestino: d.lng } });
        await new Promise(r => setTimeout(r, 1100));
      }
    } finally {
      localizando = false;
    }
  }, "mapa: localizar pedidos");
}

// GET /api/pedidos/mapa?comercioId&cidade&origem — pedidos em aberto para o mapa:
// destino com o nome do cliente, loja de coleta e o entregador que aceitou (com a posição dele).
router.get(
  "/mapa",
  asyncHandler(async (req, res) => {
    const { comercioId, cidade, origem } = req.query;
    const where = { ...montarWhere({ comercioId, cidade, origem }, { comStatus: false }), status: { in: STATUS_ABERTOS } };
    const pedidos = await prisma.pedido.findMany({
      where, orderBy: { createdAt: "desc" }, take: 300,
      select: {
        id: true, codigo: true, status: true, clienteNome: true, endereco: true, comercioId: true, latDestino: true, lngDestino: true,
        createdAt: true, aceitoEm: true, prazoDesejado: true,
        comercio: { select: { id: true, nomeFantasia: true, enderecos: { where: { principal: true }, take: 1, select: { lat: true, lng: true } } } },
        entregador: { select: { id: true, nomeCompleto: true, fotoUrl: true, veiculoTipo: true, telefone: true, online: true, lat: true, lng: true, localizacaoEm: true } },
      },
    });
    localizarPendentes(pedidos);
    res.json(pedidos.map(p => {
      const loja = p.comercio.enderecos[0];
      return {
        id: p.id, codigo: p.codigo, status: p.status, clienteNome: p.clienteNome, endereco: p.endereco,
        createdAt: p.createdAt, aceitoEm: p.aceitoEm, prazoDesejado: p.prazoDesejado,
        destino: p.latDestino != null ? { lat: p.latDestino, lng: p.lngDestino } : null,
        loja: { id: p.comercio.id, nome: p.comercio.nomeFantasia, lat: loja?.lat ?? null, lng: loja?.lng ?? null },
        entregador: p.entregador,
      };
    }));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const pedido = await prisma.pedido.findUnique({
      where: { id: req.params.id },
      include: { ...INCLUDE_PADRAO, logs: { orderBy: { createdAt: "asc" } } },
    });
    if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
    res.json(pedido);
  })
);

router.get(
  "/:id/logs",
  asyncHandler(async (req, res) => {
    const logs = await prisma.pedidoLog.findMany({
      where: { pedidoId: req.params.id },
      orderBy: { createdAt: "asc" },
    });
    res.json(logs);
  })
);

// PUT /api/pedidos/:id — "Editar" (só campos de dados; status muda pelas ações abaixo)
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = {};
    CAMPOS_EDITAVEIS.forEach(c => { if (req.body[c] !== undefined) data[c] = req.body[c]; });
    if (data.valor !== undefined) data.valor = data.valor === "" || data.valor === null ? null : Number(data.valor);
    if (data.distanciaKm !== undefined) data.distanciaKm = data.distanciaKm === "" || data.distanciaKm === null ? null : Number(data.distanciaKm);
    if (data.retorno !== undefined) data.retorno = !!data.retorno;
    if (data.complemento !== undefined) data.complemento = String(data.complemento || "").trim() || null;
    Object.assign(data, dadosNotaFiscal(req.body));
    // Endereço mudou: a posição antiga no mapa não vale mais (o mapa localiza de novo).
    if (data.endereco !== undefined) {
      const atual = await prisma.pedido.findUnique({ where: { id: req.params.id }, select: { endereco: true } });
      if (atual && atual.endereco !== data.endereco) {
        Object.assign(data, { latDestino: null, lngDestino: null });
        tentativasLocalizar.delete(req.params.id);
      }
    }

    const pedido = await prisma.pedido.update({ where: { id: req.params.id }, data, include: INCLUDE_PADRAO });
    await registrarLog(pedido.id, "Dados do pedido editados" + autor(req) + ".");
    res.json(pedido);
  })
);

// PATCH /api/pedidos/:id/pronto — libera o pedido para os entregadores (PREPARANDO -> PENDENTE)
router.patch(
  "/:id/pronto",
  asyncHandler(async (req, res) => {
    res.json(await transicionar(req, ["PREPARANDO"], { status: "PENDENTE" },
      "Pedido marcado como pronto — liberado para entregadores"));
  })
);

// PATCH /api/pedidos/:id/aceitar  { entregadorId } — atribui manualmente um entregador (-> ATRIBUIDO)
router.patch(
  "/:id/aceitar",
  asyncHandler(async (req, res) => {
    const { entregadorId } = req.body;
    if (!entregadorId) return res.status(400).json({ erro: 'Informe "entregadorId".' });

    const entregador = await prisma.entregador.findUnique({ where: { id: entregadorId } });
    if (!entregador) return res.status(404).json({ erro: "Entregador não encontrado." });
    if (entregador.bloqueado) return res.status(403).json({ erro: "Este entregador está bloqueado." });

    res.json(await transicionar(req, ["PREPARANDO", "PENDENTE", "ATRASADO"], { entregadorId, status: "ATRIBUIDO" },
      `Corrida atribuída a ${entregador.nomeCompleto}`));
  })
);

// PATCH /api/pedidos/:id/finalizar — "Finalizar pedido"
router.patch(
  "/:id/finalizar",
  asyncHandler(async (req, res) => {
    res.json(await transicionar(req, ["PENDENTE", ...COM_ENTREGADOR], { status: "ENTREGUE" }, "Pedido finalizado"));
  })
);

// PATCH /api/pedidos/:id/status  { status } — o ADM da operação muda o status manualmente:
// Criado, Pedido pronto, Atribuída, Na loja, Em rota, Cheguei no cliente, Pedido entregue, Cancelada (e Atrasado).
//   - etapas do entregador (Atribuída → Cheguei no cliente) exigem entregador vinculado;
//   - voltar para Criado ou Pedido pronto libera o entregador (volta para a fila);
//   - pedido já faturado ou acertado com o entregador não sai de Entregue.
router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const para = req.body?.status;
    if (!STATUS.includes(para)) throw erroHttp(400, "Status inválido.");
    const atual = await prisma.pedido.findUnique({ where: { id: req.params.id } });
    if (!atual) throw erroHttp(404, "Pedido não encontrado.");
    if (atual.status === para) return res.json(await prisma.pedido.findUnique({ where: { id: atual.id }, include: INCLUDE_PADRAO }));
    if (atual.status === "ENTREGUE" && (atual.faturaId || atual.acertoId)) {
      throw erroHttp(409, "Este pedido já foi faturado ou acertado com o entregador e não pode sair de “Pedido entregue”.");
    }
    if (COM_ENTREGADOR.includes(para) && !atual.entregadorId) {
      throw erroHttp(400, `Atribua um entregador antes de mudar para “${ROTULOS[para]}”.`);
    }

    const data = { status: para, ...carimbos(atual, para) };
    if (["PREPARANDO", "PENDENTE"].includes(para)) data.entregadorId = null; // volta para a fila
    if (atual.status === "ENTREGUE") data.entregueEm = null;
    if (atual.status === "CANCELADO") data.canceladoEm = null;

    // Só muda se ninguém mexeu no pedido enquanto isso.
    const { count } = await prisma.pedido.updateMany({ where: { id: atual.id, status: atual.status }, data });
    if (count === 0) throw erroHttp(409, "O status deste pedido acabou de mudar. Atualize a tela.");
    await registrarStatusPedido({ pedidoId: atual.id, de: atual.status, para, entregadorId: atual.entregadorId, autor: autorDe(req) });
    await registrarLog(atual.id, `Status alterado de “${ROTULOS[atual.status]}” para “${ROTULOS[para]}”${autor(req)}.`);
    res.json(await prisma.pedido.findUnique({ where: { id: atual.id }, include: INCLUDE_PADRAO }));
  })
);

// PATCH /api/pedidos/:id/atrasado — sinaliza atraso
router.patch(
  "/:id/atrasado",
  asyncHandler(async (req, res) => {
    res.json(await transicionar(req, ABERTOS.filter(s => s !== "ATRASADO"), { status: "ATRASADO" }, "Pedido marcado como atrasado"));
  })
);

// PATCH /api/pedidos/:id/cancelar  { motivo? }
router.patch(
  "/:id/cancelar",
  asyncHandler(async (req, res) => {
    const motivo = req.body?.motivo ? ` Motivo: ${req.body.motivo}` : "";
    res.json(await transicionar(req, ABERTOS, { status: "CANCELADO" },
      "Entrega cancelada." + motivo));
  })
);

// PATCH /api/pedidos/:id/reprocurar — remove o entregador atual e volta pra fila
router.patch(
  "/:id/reprocurar",
  asyncHandler(async (req, res) => {
    res.json(await transicionar(req, [...COM_ENTREGADOR, "PENDENTE"], { entregadorId: null, status: "PENDENTE" },
      "Buscando um novo entregador para o pedido"));
  })
);

// PATCH /api/pedidos/:id/trocar-entregador  { entregadorId }
router.patch(
  "/:id/trocar-entregador",
  asyncHandler(async (req, res) => {
    const { entregadorId } = req.body;
    if (!entregadorId) return res.status(400).json({ erro: 'Informe "entregadorId".' });

    const entregador = await prisma.entregador.findUnique({ where: { id: entregadorId } });
    if (!entregador) return res.status(404).json({ erro: "Entregador não encontrado." });
    if (entregador.bloqueado) return res.status(403).json({ erro: "Este entregador está bloqueado." });

    res.json(await transicionar(req, COM_ENTREGADOR, { entregadorId },
      `Entregador trocado para ${entregador.nomeCompleto}`));
  })
);

// POST /api/pedidos/:id/observacao  { texto }
router.post(
  "/:id/observacao",
  asyncHandler(async (req, res) => {
    const { texto } = req.body;
    const pedido = await prisma.pedido.update({
      where: { id: req.params.id },
      data: { observacao: texto || "" },
      include: INCLUDE_PADRAO,
    });
    await registrarLog(pedido.id, "Observação adicionada ao pedido" + autor(req) + ".");
    res.json(pedido);
  })
);

// POST /api/pedidos/:id/clonar — "Clonar"
router.post(
  "/:id/clonar",
  asyncHandler(async (req, res) => {
    const original = await prisma.pedido.findUnique({ where: { id: req.params.id } });
    if (!original) return res.status(404).json({ erro: "Pedido não encontrado." });

    const codigo = await gerarCodigoPedido();
    const clone = await prisma.pedido.create({
      data: {
        codigo,
        comercioId: original.comercioId,
        clienteNome: original.clienteNome,
        clienteTelefone: original.clienteTelefone,
        endereco: original.endereco,
        latDestino: original.latDestino,
        lngDestino: original.lngDestino,
        valor: original.valor,
        distanciaKm: original.distanciaKm,
        formaPagamento: original.formaPagamento,
        origem: "PAINEL_ADMIN",
        status: "PREPARANDO",
        logs: { create: [{ texto: `Pedido clonado a partir de ${original.codigo}.` }] },
        historicoStatus: { create: [{ de: null, para: "PREPARANDO", ...autorDe(req) }] },
      },
      include: INCLUDE_PADRAO,
    });
    res.status(201).json(clone);
  })
);

module.exports = router;
module.exports.localizarPendentes = localizarPendentes; // usado também pelo mapa do sistema do comerciante
