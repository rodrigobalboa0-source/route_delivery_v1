// Financeiro › Comissão de entregadores e Acerto de Entregadores.
const express = require("express");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { erro400, periodo, periodoObrigatorio, dataBR } = require("../../utils/periodo");
const { r2, comissaoDoPedido, entregasDoPeriodo } = require("../../services/financeiro.service");

const router = express.Router();
const autor = req => req.conta?.nome || null;

// Comissões automáticas por entrega (extra pago pela empresa) com data no período.
function comissoesAutomaticas({ desde, ate, entregadorId, somentePendentes }) {
  return prisma.comissaoManual.findMany({
    where: { origem: "AUTOMATICA", referencia: { gte: desde, lte: ate }, entregadorId: entregadorId || { not: null }, ...(somentePendentes ? { acertoId: null } : {}) },
    select: { id: true, entregadorId: true, valor: true, acertoId: true, pedidoId: true },
  });
}

// GET /ganhos?desde&ate&entregadorId — ganhos por entregador no período (entregas concluídas).
// Com entregadorId, traz também o detalhe de cada entrega e a regra usada.
router.get(
  "/ganhos",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query);
    const [pedidos, autos] = await Promise.all([
      entregasDoPeriodo({ desde, ate, entregadorId: req.query.entregadorId }),
      comissoesAutomaticas({ desde, ate, entregadorId: req.query.entregadorId }),
    ]);
    const autoPorPedido = new Map(autos.filter(a => a.pedidoId).map(a => [a.pedidoId, a.valor]));

    const porEntregador = new Map();
    const novo = e => ({
      entregadorId: e.id, nome: e.nomeCompleto, veiculoTipo: e.veiculoTipo, tipoEntrega: e.tipoEntrega,
      entregas: 0, valorEntregas: 0, comissao: 0, pendentes: 0, comissaoPendente: 0, acertadas: 0, comissaoAcertada: 0, semRegra: 0,
      comissaoAuto: 0, comissaoAutoPendente: 0,
    });
    const detalhe = [];
    for (const p of pedidos) {
      const c = comissaoDoPedido(p);
      const e = p.entregador;
      const g = porEntregador.get(e.id) || novo(e);
      g.entregas++;
      g.valorEntregas += p.valor || 0;
      g.comissao += c.valor;
      if (p.acertoId) { g.acertadas++; g.comissaoAcertada += c.valor; } else { g.pendentes++; g.comissaoPendente += c.valor; }
      if (c.tipo === "SEM_REGRA") g.semRegra++;
      porEntregador.set(e.id, g);
      if (req.query.entregadorId) {
        detalhe.push({
          pedidoId: p.id, codigo: p.codigo, entregueEm: p.entregueEm, comercio: p.comercio?.nomeFantasia, valor: p.valor,
          comissao: c.valor, regra: c.regra, tipoRegra: c.tipo, acerto: p.acerto ? { numero: p.acerto.numero, pago: p.acerto.pago } : null,
          comissaoAuto: autoPorPedido.get(p.id) ?? null,
        });
      }
    }
    // Comissão automática: separada da comissão da entrega (não sai da taxa nem do valor cobrado do comércio).
    for (const a of autos) {
      const g = porEntregador.get(a.entregadorId);
      if (!g) continue; // entregador sem entrega concluída no período (ex.: entrega desfeita depois do acerto)
      g.comissaoAuto += a.valor;
      if (!a.acertoId) g.comissaoAutoPendente += a.valor;
    }

    const linhas = [...porEntregador.values()]
      .map(g => ({
        ...g, valorEntregas: r2(g.valorEntregas), comissao: r2(g.comissao), comissaoPendente: r2(g.comissaoPendente), comissaoAcertada: r2(g.comissaoAcertada),
        comissaoAuto: r2(g.comissaoAuto), comissaoAutoPendente: r2(g.comissaoAutoPendente), aPagar: r2(g.comissaoPendente + g.comissaoAutoPendente),
      }))
      .sort((a, b) => b.comissaoPendente - a.comissaoPendente || a.nome.localeCompare(b.nome));
    res.json({
      desde, ate, linhas, detalhe,
      totais: {
        entregas: pedidos.length,
        comissao: r2(linhas.reduce((s, l) => s + l.comissao, 0)),
        comissaoPendente: r2(linhas.reduce((s, l) => s + l.comissaoPendente, 0)),
        comissaoAcertada: r2(linhas.reduce((s, l) => s + l.comissaoAcertada, 0)),
        semRegra: linhas.reduce((s, l) => s + l.semRegra, 0),
        comissaoAuto: r2(linhas.reduce((s, l) => s + l.comissaoAuto, 0)),
        comissaoAutoPendente: r2(linhas.reduce((s, l) => s + l.comissaoAutoPendente, 0)),
      },
    });
  })
);

// GET /acertos?desde&ate&entregadorId&situacao=pendente|pago
// Acertos cujo período de entregas coincide (mesmo que em parte) com o período escolhido.
router.get(
  "/acertos",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query, 90);
    const where = { inicio: { lte: ate }, fim: { gte: desde } };
    if (req.query.entregadorId) where.entregadorId = req.query.entregadorId;
    if (req.query.situacao === "pendente") where.pago = false;
    if (req.query.situacao === "pago") where.pago = true;
    const acertos = await prisma.acertoEntregador.findMany({
      where, orderBy: { createdAt: "desc" },
      include: { entregador: { select: { nomeCompleto: true, cpf: true } }, contaPagar: { select: { id: true, numero: true } } },
    });
    res.json(acertos);
  })
);

router.get(
  "/acertos/:id",
  asyncHandler(async (req, res) => {
    const a = await prisma.acertoEntregador.findUnique({
      where: { id: req.params.id },
      include: {
        entregador: { select: { nomeCompleto: true, cpf: true, telefone: true } },
        contaPagar: { select: { id: true, numero: true } },
        comissoes: { orderBy: { referencia: "asc" }, select: { id: true, numero: true, valor: true, pedidoId: true } },
        pedidos: { orderBy: { entregueEm: "asc" }, select: { id: true, codigo: true, entregueEm: true, valor: true, comissaoEntregador: true, comercio: { select: { nomeFantasia: true } } } },
      },
    });
    if (!a) return res.status(404).json({ erro: "Acerto não encontrado." });
    res.json(a);
  })
);

// POST /acertos { entregadorId, desde, ate, ajustes?, descricaoAjustes?, observacao?, vencimento? }
// Fecha as entregas ainda não acertadas do período e gera a conta a pagar.
router.post(
  "/acertos",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodoObrigatorio(req.body);
    const entregador = await prisma.entregador.findUnique({ where: { id: req.body.entregadorId || "" } });
    if (!entregador) throw erro400("Escolha o entregador.");

    const ajustes = r2(Number(String(req.body.ajustes ?? 0).replace(",", ".")) || 0);
    if (ajustes !== 0 && !String(req.body.descricaoAjustes || "").trim()) throw erro400("Descreva o motivo do ajuste (bônus ou desconto).");

    const [pedidos, autos] = await Promise.all([
      entregasDoPeriodo({ desde, ate, entregadorId: entregador.id, somentePendentes: true }),
      comissoesAutomaticas({ desde, ate, entregadorId: entregador.id, somentePendentes: true }),
    ]);
    if (!pedidos.length && !autos.length) throw erro400("Nenhuma entrega pendente de acerto neste período.");
    const comissoes = pedidos.map(p => ({ id: p.id, valor: comissaoDoPedido(p).valor }));
    const valorComissao = r2(comissoes.reduce((s, c) => s + c.valor, 0));
    const comissoesAuto = r2(autos.reduce((s, a) => s + a.valor, 0));
    const valorTotal = r2(valorComissao + comissoesAuto + ajustes);
    if (valorTotal < 0) throw erro400("O total do acerto não pode ficar negativo.");

    const vencimento = req.body.vencimento ? new Date(`${req.body.vencimento}T12:00:00`) : new Date();
    const acerto = await prisma.$transaction(async tx => {
      const a = await tx.acertoEntregador.create({
        data: {
          entregadorId: entregador.id, inicio: desde, fim: ate, entregas: pedidos.length, valorComissao, comissoesAutomaticas: comissoesAuto, ajustes,
          descricaoAjustes: req.body.descricaoAjustes?.trim() || null, valorTotal, observacao: req.body.observacao?.trim() || null, autorNome: autor(req),
        },
      });
      // Marca cada entrega; se outra pessoa acertou a mesma entrega ao mesmo tempo, desfaz tudo.
      for (const c of comissoes) {
        const { count } = await tx.pedido.updateMany({ where: { id: c.id, acertoId: null }, data: { acertoId: a.id, comissaoEntregador: c.valor } });
        if (count !== 1) {
          const err = new Error("Algumas entregas deste período acabaram de ser acertadas por outra pessoa. Atualize a tela.");
          err.status = 409;
          throw err;
        }
      }
      if (autos.length) {
        const { count } = await tx.comissaoManual.updateMany({ where: { id: { in: autos.map(a => a.id) }, acertoId: null }, data: { acertoId: a.id } });
        if (count !== autos.length) {
          const err = new Error("Algumas comissões deste período acabaram de ser acertadas por outra pessoa. Atualize a tela.");
          err.status = 409;
          throw err;
        }
      }
      await tx.contaPagar.create({
        data: {
          descricao: `Acerto nº ${a.numero} — entregas de ${dataBR(desde)} a ${dataBR(ate)}`,
          favorecido: entregador.nomeCompleto, categoria: "ENTREGADOR", vencimento, valor: valorTotal, acertoId: a.id,
        },
      });
      return a;
    }, { timeout: 30000 }); // acertos com centenas de entregas
    res.status(201).json(acerto);
  })
);

// PATCH /acertos/:id/pagar { formaPagamento?, pagoEm? } — também quita a conta a pagar
router.patch(
  "/acertos/:id/pagar",
  asyncHandler(async (req, res) => {
    const pagoEm = req.body.pagoEm ? new Date(`${req.body.pagoEm}T12:00:00`) : new Date();
    const formaPagamento = req.body.formaPagamento || null;
    const [a] = await prisma.$transaction([
      prisma.acertoEntregador.update({ where: { id: req.params.id }, data: { pago: true, pagoEm, formaPagamento } }),
      prisma.contaPagar.updateMany({ where: { acertoId: req.params.id }, data: { paga: true, pagaEm: pagoEm, formaPagamento } }),
    ]);
    res.json(a);
  })
);

router.patch(
  "/acertos/:id/reabrir",
  asyncHandler(async (req, res) => {
    const [a] = await prisma.$transaction([
      prisma.acertoEntregador.update({ where: { id: req.params.id }, data: { pago: false, pagoEm: null, formaPagamento: null } }),
      prisma.contaPagar.updateMany({ where: { acertoId: req.params.id }, data: { paga: false, pagaEm: null, formaPagamento: null } }),
    ]);
    res.json(a);
  })
);

// DELETE /acertos/:id — só não pago; as entregas voltam a ficar pendentes de acerto
router.delete(
  "/acertos/:id",
  asyncHandler(async (req, res) => {
    const a = await prisma.acertoEntregador.findUnique({ where: { id: req.params.id } });
    if (!a) return res.status(404).json({ erro: "Acerto não encontrado." });
    if (a.pago) return res.status(409).json({ erro: "Acerto já pago. Reabra o pagamento antes de excluir." });
    await prisma.$transaction([
      prisma.pedido.updateMany({ where: { acertoId: a.id }, data: { acertoId: null, comissaoEntregador: null } }),
      prisma.comissaoManual.updateMany({ where: { acertoId: a.id }, data: { acertoId: null } }),
      prisma.acertoEntregador.delete({ where: { id: a.id } }),
    ]);
    res.status(204).send();
  })
);

module.exports = router;
