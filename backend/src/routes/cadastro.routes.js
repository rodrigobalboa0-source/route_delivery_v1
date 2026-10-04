const express = require("express");
const prisma = require("../lib/prisma");
const { Prisma } = require("@prisma/client");
const { validarFaixas } = require("../utils/faixas");
const { asyncHandler } = require("../middleware/errorHandler");
const { createCrudRouter } = require("../utils/crudRouterFactory");
const { omitir } = require("../utils/sanitizar");
const contasGerenciaisRoutes = require("./contasGerenciais.routes");

const router = express.Router();

// Contas gerenciais têm router próprio (hash de senha, nunca devolve senhaHash).
router.use("/contas-gerenciais", contasGerenciaisRoutes);

// ---- CRUDs genéricos (telas simples da aba Cadastro) ----
router.use("/grupos-operacionais", createCrudRouter("grupoOperacional"));
router.use("/modais", createCrudRouter("modal"));
// Tabela de preço por KM: cálculo por deslocamento, fixo ou por FAIXAS de km ("até 3 km = R$ 7").
const validarTabelaKm = body => {
  const erro = msg => { const e = new Error(msg); e.status = 400; throw e; };
  const d = { ...body };
  if (!String(d.nome || "").trim()) erro("Informe o nome da tabela.");
  d.nome = String(d.nome).trim();
  if (d.tipoCalculo && !["DESLOCAMENTO", "FIXO", "FAIXAS"].includes(d.tipoCalculo)) erro("Tipo de cálculo inválido.");
  if (d.faixas !== undefined) d.faixas = d.faixas === null ? Prisma.DbNull : validarFaixas(d.faixas);
  if (d.tipoCalculo === "FAIXAS" && !(Array.isArray(d.faixas) && d.faixas.length)) erro("Cadastre pelo menos uma faixa de km.");
  return d;
};

// Tabela de comissões (ganho do entregador por entrega): percentual do valor OU faixas de km.
const VEICULOS = ["MOTO", "BIKE", "CARRO"]; // enum Veiculo do schema
const validarTabelaComissao = body => {
  require("../services/financeiro.service").esquecerTabelasPadrao(); // a tabela padrão do veículo pode mudar
  const erro = msg => { const e = new Error(msg); e.status = 400; throw e; };
  const d = { ...body };
  const n = v => (v === undefined || v === null || v === "" ? null : Number(String(v).replace(",", ".")));
  d.nome = String(d.nome || "").trim() || null;
  d.tipoCalculo = d.tipoCalculo || "PERCENTUAL";
  if (!["PERCENTUAL", "FAIXAS"].includes(d.tipoCalculo)) erro("Tipo de cálculo inválido.");
  if (d.categoria !== undefined && !VEICULOS.includes(d.categoria)) erro("Categoria de veículo inválida.");
  for (const k of ["percentual", "valorMinimo", "kmAdicional"]) {
    if (d[k] !== undefined) {
      d[k] = n(d[k]);
      if (d[k] !== null && (!Number.isFinite(d[k]) || d[k] < 0)) erro("Valores não podem ser negativos.");
    }
  }
  if (d.tipoCalculo === "PERCENTUAL" && !(d.percentual > 0 && d.percentual <= 100)) erro("Informe o percentual (entre 0 e 100).");
  // Retorno (entrega em que o entregador volta à loja)
  if (d.tipoRetorno !== undefined) {
    d.tipoRetorno = d.tipoRetorno || "REPASSE_LOJA";
    if (!["REPASSE_LOJA", "PORCENTAGEM", "VALOR_FIXO", "SEM_ADICIONAL"].includes(d.tipoRetorno)) erro("Tipo de retorno inválido.");
  }
  if (d.valorRetorno !== undefined) {
    d.valorRetorno = n(d.valorRetorno);
    if (d.valorRetorno !== null && (!Number.isFinite(d.valorRetorno) || d.valorRetorno < 0)) erro("O valor do retorno não pode ser negativo.");
  }
  if (["PORCENTAGEM", "VALOR_FIXO"].includes(d.tipoRetorno) && !(d.valorRetorno > 0)) erro("Informe o valor do retorno.");
  if (d.tipoRetorno === "PORCENTAGEM" && d.valorRetorno > 300) erro("A porcentagem do retorno deve ficar até 300%.");
  if (["REPASSE_LOJA", "SEM_ADICIONAL"].includes(d.tipoRetorno)) d.valorRetorno = null;
  if (d.faixas !== undefined) d.faixas = d.faixas === null ? Prisma.DbNull : validarFaixas(d.faixas);
  if (d.tipoCalculo === "FAIXAS" && !(Array.isArray(d.faixas) && d.faixas.length)) erro("Cadastre pelo menos uma faixa de km.");
  return d;
};
router.use("/tabela-preco-km", createCrudRouter("tabelaPrecoKm", { orderBy: { createdAt: "desc" }, beforeCreate: validarTabelaKm, beforeUpdate: validarTabelaKm }));
router.use("/tabela-comissoes", createCrudRouter("tabelaComissao", { beforeCreate: validarTabelaComissao, beforeUpdate: validarTabelaComissao }));
// Regras de preço dinâmico: nome, tipo de aplicação (multiplicador ou valor fixo), valor e ativa.
// Padrão do tipo: demanda multiplica o valor; entregador recebe valor fixo.
const validarRegraPreco = tipoPadrao => body => {
  const erro = msg => { const e = new Error(msg); e.status = 400; throw e; };
  const nome = String(body.nome || "").trim();
  if (!nome) erro("Informe o nome da regra.");
  const tipoAplicacao = body.tipoAplicacao || tipoPadrao;
  if (!["MULTIPLICADOR", "VALOR_FIXO"].includes(tipoAplicacao)) erro("Tipo de aplicação inválido.");
  const valor = Number(String(body.valor ?? "").replace(",", "."));
  if (!Number.isFinite(valor) || valor <= 0) erro("Informe um valor maior que zero.");
  if (tipoAplicacao === "MULTIPLICADOR" && valor > 10) erro("Multiplicador muito alto (máximo 10x).");
  return { nome, tipoAplicacao, valor, ativo: body.ativo === undefined ? true : !!body.ativo };
};
// Regra criada ativa ou ligada agora (ex.: "Chuva"): notificação no celular dos entregadores.
const avisarAoLigar = tipo => (regra, anterior) => {
  if (!regra.ativo || anterior?.ativo) return;
  require("../utils/segundoPlano").emSegundoPlano(() => require("../services/push.service").avisarTaxaDinamica(regra, tipo), "Push taxa dinâmica");
};
// Preço dinâmico do entregador mudou: as entregas abertas recebem (ou perdem) o bônus na hora.
const aplicarNoEntregador = tipo => async () => {
  if (tipo !== "entregador") return;
  const n = await require("../services/precoDinamico.service").aplicarEntregadorNasAbertas();
  if (n) console.log(`[preço dinâmico] ${n} entrega(s) aberta(s) atualizada(s)`);
};
const opcoesRegraPreco = (tipoPadrao, tipo) => ({
  orderBy: { nome: "asc" }, beforeCreate: validarRegraPreco(tipoPadrao), beforeUpdate: validarRegraPreco(tipoPadrao),
  afterSave: async (regra, anterior) => { avisarAoLigar(tipo)(regra, anterior); await aplicarNoEntregador(tipo)(); },
  afterDelete: aplicarNoEntregador(tipo),
});
// PATCH /:chave/:id/ativo { ativo } — liga/desliga a regra direto da lista (sem abrir a edição).
const alternarRegra = (modelo, tipo) => async (req, res) => {
  const anterior = await prisma[modelo].findUnique({ where: { id: req.params.id } });
  if (!anterior) return res.status(404).json({ erro: "Regra não encontrada." });
  const regra = await prisma[modelo].update({ where: { id: req.params.id }, data: { ativo: !!req.body?.ativo } });
  avisarAoLigar(tipo)(regra, anterior);
  await aplicarNoEntregador(tipo)();
  res.json(regra);
};
router.patch("/preco-dinamico-demanda/:id/ativo", asyncHandler(alternarRegra("precoDinamicoDemanda", "demanda")));
router.patch("/preco-dinamico-entregador/:id/ativo", asyncHandler(alternarRegra("precoDinamicoEntregador", "entregador")));
router.use("/preco-dinamico-demanda", createCrudRouter("precoDinamicoDemanda", opcoesRegraPreco("MULTIPLICADOR", "demanda")));
router.use("/preco-dinamico-entregador", createCrudRouter("precoDinamicoEntregador", opcoesRegraPreco("VALOR_FIXO", "entregador")));
router.use("/servicos-opcionais", createCrudRouter("servicoOpcional"));
router.use("/promocoes", createCrudRouter("promocao"));
router.use("/franquias", createCrudRouter("franquia"));
router.use("/hubs", createCrudRouter("hub"));

// ---- Singletons (uma única linha de configuração) ----

async function obterOuCriarSingleton(model) {
  const existente = await prisma[model].findFirst();
  if (existente) return existente;
  return prisma[model].create({ data: {} });
}

router.get(
  "/precificacao-padrao",
  asyncHandler(async (req, res) => {
    res.json(await obterOuCriarSingleton("precificacaoPadrao"));
  })
);
router.put(
  "/precificacao-padrao",
  asyncHandler(async (req, res) => {
    const atual = await obterOuCriarSingleton("precificacaoPadrao");
    const atualizado = await prisma.precificacaoPadrao.update({ where: { id: atual.id }, data: omitir(req.body, ["id", "atualizadoEm"]) });
    res.json(atualizado);
  })
);

router.get(
  "/preco-espera",
  asyncHandler(async (req, res) => {
    res.json(await obterOuCriarSingleton("precoEspera"));
  })
);
router.put(
  "/preco-espera",
  asyncHandler(async (req, res) => {
    const atual = await obterOuCriarSingleton("precoEspera");
    const atualizado = await prisma.precoEspera.update({ where: { id: atual.id }, data: omitir(req.body, ["id", "atualizadoEm"]) });
    res.json(atualizado);
  })
);

module.exports = router;
