const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { omitir } = require("./sanitizar");

// Campos gerados pelo banco — ignorados se vierem no body (ex: formulário reenviando o registro inteiro).
const CAMPOS_AUTOMATICOS = ["id", "createdAt", "updatedAt", "atualizadoEm"];

/**
 * Cria um router REST genérico (GET /, GET /:id, POST /, PUT /:id, DELETE /:id)
 * para um model do Prisma. Usado pelas telas de Cadastro que são só CRUDs simples
 * (Grupos operacionais, Modais, Tabela de comissões, Preço dinâmico, Serviços
 * opcionais, Promoção, Franquias, Hubs, Contas gerenciais base, etc.)
 *
 * @param {string} modelName - nome do model no Prisma Client (ex: "gruposOperacional" -> prisma.grupoOperacional)
 * @param {object} options
 *   - orderBy: campo/objeto de ordenação padrão
 *   - beforeCreate / beforeUpdate: hooks assíncronos para transformar o body antes de salvar
 *   - afterSave(registro, anterior): chamado depois de criar (anterior = null) ou editar
 */
function createCrudRouter(modelName, options = {}) {
  const router = express.Router();
  const model = prisma[modelName];

  if (!model) {
    throw new Error(`Model "${modelName}" não existe no Prisma Client.`);
  }

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const registros = await model.findMany({
        orderBy: options.orderBy || { id: "asc" },
      });
      res.json(registros);
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const registro = await model.findUnique({ where: { id: req.params.id } });
      if (!registro) return res.status(404).json({ erro: "Registro não encontrado." });
      res.json(registro);
    })
  );

  router.post(
    "/",
    asyncHandler(async (req, res) => {
      const body = omitir(req.body, CAMPOS_AUTOMATICOS);
      const data = options.beforeCreate ? await options.beforeCreate(body) : body;
      const criado = await model.create({ data });
      if (options.afterSave) await options.afterSave(criado, null);
      res.status(201).json(criado);
    })
  );

  router.put(
    "/:id",
    asyncHandler(async (req, res) => {
      const body = omitir(req.body, CAMPOS_AUTOMATICOS);
      const data = options.beforeUpdate ? await options.beforeUpdate(body) : body;
      const anterior = options.afterSave ? await model.findUnique({ where: { id: req.params.id } }) : null;
      const atualizado = await model.update({ where: { id: req.params.id }, data });
      if (options.afterSave) await options.afterSave(atualizado, anterior);
      res.json(atualizado);
    })
  );

  router.delete(
    "/:id",
    asyncHandler(async (req, res) => {
      await model.delete({ where: { id: req.params.id } });
      res.status(204).send();
    })
  );

  return router;
}

module.exports = { createCrudRouter };
