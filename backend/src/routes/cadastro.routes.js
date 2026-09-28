const express = require("express");
const prisma = require("../lib/prisma");
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
router.use("/tabela-preco-km", createCrudRouter("tabelaPrecoKm", { orderBy: { createdAt: "desc" } }));
router.use("/tabela-comissoes", createCrudRouter("tabelaComissao"));
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
const opcoesRegraPreco = tipoPadrao => ({ orderBy: { nome: "asc" }, beforeCreate: validarRegraPreco(tipoPadrao), beforeUpdate: validarRegraPreco(tipoPadrao) });
router.use("/preco-dinamico-demanda", createCrudRouter("precoDinamicoDemanda", opcoesRegraPreco("MULTIPLICADOR")));
router.use("/preco-dinamico-entregador", createCrudRouter("precoDinamicoEntregador", opcoesRegraPreco("VALOR_FIXO")));
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
