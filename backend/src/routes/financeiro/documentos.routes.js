// Financeiro › Gerar Recibo e Gerar Nota (nota de débito / demonstrativo — não é NFS-e).
const express = require("express");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { erro400, periodo, dataLocal, dataBR } = require("../../utils/periodo");
const { r2 } = require("../../services/financeiro.service");

const router = express.Router();

async function empresa() {
  const c = await prisma.configuracao.findFirst();
  return {
    nome: c?.empresaNome || "Route Delivery", documento: c?.empresaDocumento || null, endereco: c?.empresaEndereco || null,
    telefone: c?.empresaTelefone || null, email: c?.empresaEmail || null, configurada: !!c?.empresaNome,
  };
}

// ---------- Recibos ----------

router.get(
  "/recibos",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query, 90);
    const where = { data: { gte: desde, lte: ate } };
    if (req.query.tipo) where.tipo = req.query.tipo;
    res.json(await prisma.recibo.findMany({ where, orderBy: { numero: "desc" } }));
  })
);

router.get(
  "/recibos/:id",
  asyncHandler(async (req, res) => {
    const r = await prisma.recibo.findUnique({ where: { id: req.params.id } });
    if (!r) return res.status(404).json({ erro: "Recibo não encontrado." });
    res.json({ ...r, empresa: await empresa() });
  })
);

// Cria o recibo — ou devolve o que já existe para a mesma origem (não duplica numeração).
async function criarRecibo(dados) {
  if (dados.origemTipo && dados.origemId) {
    const existente = await prisma.recibo.findFirst({ where: { origemTipo: dados.origemTipo, origemId: dados.origemId } });
    if (existente) return { recibo: existente, existente: true };
  }
  return { recibo: await prisma.recibo.create({ data: dados }), existente: false };
}

// POST /recibos — recibo avulso
router.post(
  "/recibos",
  asyncHandler(async (req, res) => {
    const b = req.body;
    if (!["PAGAMENTO", "RECEBIMENTO"].includes(b.tipo)) throw erro400("Escolha se é recibo de pagamento ou de recebimento.");
    const pessoaNome = String(b.pessoaNome || "").trim();
    if (!pessoaNome) throw erro400("Informe o nome de quem paga ou recebe.");
    const valor = r2(Number(String(b.valor ?? "").replace(",", ".")));
    if (!Number.isFinite(valor) || valor <= 0) throw erro400("Informe um valor maior que zero.");
    const referente = String(b.referente || "").trim();
    if (!referente) throw erro400("Informe a que se refere o recibo.");
    const data = dataLocal(String(b.data || "").slice(0, 10)) || new Date();
    data.setHours(12);
    const { recibo } = await criarRecibo({
      tipo: b.tipo, pessoaNome, pessoaDocumento: String(b.pessoaDocumento || "").trim() || null, valor, referente, data,
      formaPagamento: b.formaPagamento || null, origemTipo: "AVULSO", autorNome: req.conta?.nome || null,
    });
    res.status(201).json(recibo);
  })
);

// POST /acertos/:id/recibo — recibo de pagamento ao entregador
router.post(
  "/acertos/:id/recibo",
  asyncHandler(async (req, res) => {
    const a = await prisma.acertoEntregador.findUnique({ where: { id: req.params.id }, include: { entregador: true } });
    if (!a) return res.status(404).json({ erro: "Acerto não encontrado." });
    if (!a.pago) throw erro400("Registre o pagamento do acerto antes de gerar o recibo.");
    const { recibo, existente } = await criarRecibo({
      tipo: "PAGAMENTO", pessoaNome: a.entregador.nomeCompleto, pessoaDocumento: a.entregador.cpf || null, valor: a.valorTotal,
      referente: `acerto nº ${a.numero} das entregas realizadas de ${dataBR(a.inicio)} a ${dataBR(a.fim)} (${a.entregas} entrega${a.entregas > 1 ? "s" : ""})`,
      data: a.pagoEm || new Date(), formaPagamento: a.formaPagamento, origemTipo: "ACERTO", origemId: a.id, autorNome: req.conta?.nome || null,
    });
    res.status(existente ? 200 : 201).json(recibo);
  })
);

// POST /faturas/:id/recibo — recibo de recebimento do comércio
router.post(
  "/faturas/:id/recibo",
  asyncHandler(async (req, res) => {
    const f = await prisma.fatura.findUnique({ where: { id: req.params.id }, include: { comercio: true } });
    if (!f) return res.status(404).json({ erro: "Fatura não encontrada." });
    if (!f.paga) throw erro400("Registre o recebimento da fatura antes de gerar o recibo.");
    const { recibo, existente } = await criarRecibo({
      tipo: "RECEBIMENTO", pessoaNome: f.comercio?.razaoSocial || f.comercio?.nomeFantasia || "Cliente", pessoaDocumento: f.comercio?.documento || null,
      valor: f.valor, referente: `fatura nº ${f.numero} — ${f.descricao}`, data: f.pagaEm || new Date(), formaPagamento: f.formaPagamento,
      origemTipo: "FATURA", origemId: f.id, autorNome: req.conta?.nome || null,
    });
    res.status(existente ? 200 : 201).json(recibo);
  })
);

// POST /contas-pagar/:id/recibo — recibo do pagamento de uma conta
router.post(
  "/contas-pagar/:id/recibo",
  asyncHandler(async (req, res) => {
    const c = await prisma.contaPagar.findUnique({ where: { id: req.params.id }, include: { comissaoManual: { include: { entregador: { select: { cpf: true } } } } } });
    if (!c) return res.status(404).json({ erro: "Conta não encontrada." });
    if (!c.paga) throw erro400("Registre o pagamento antes de gerar o recibo.");
    const { recibo, existente } = await criarRecibo({
      tipo: "PAGAMENTO", pessoaNome: c.favorecido || "Favorecido", pessoaDocumento: c.comissaoManual?.entregador?.cpf || null, valor: c.valor, referente: c.descricao,
      data: c.pagaEm || new Date(), formaPagamento: c.formaPagamento, origemTipo: "CONTA_PAGAR", origemId: c.id, autorNome: req.conta?.nome || null,
    });
    res.status(existente ? 200 : 201).json(recibo);
  })
);

// ---------- Nota (demonstrativo da fatura) ----------

// GET /faturas/:id/nota — dados para imprimir a nota de débito com as entregas cobradas
router.get(
  "/faturas/:id/nota",
  asyncHandler(async (req, res) => {
    const f = await prisma.fatura.findUnique({
      where: { id: req.params.id },
      include: {
        comercio: { include: { enderecos: { where: { principal: true }, take: 1 } } },
        pedidos: { orderBy: { entregueEm: "asc" }, select: { codigo: true, entregueEm: true, clienteNome: true, endereco: true, distanciaKm: true, valor: true, notaFiscalNumero: true } },
      },
    });
    if (!f) return res.status(404).json({ erro: "Fatura não encontrada." });
    res.json({ fatura: f, empresa: await empresa() });
  })
);

router.get(
  "/empresa",
  asyncHandler(async (req, res) => {
    res.json(await empresa());
  })
);

module.exports = router;
