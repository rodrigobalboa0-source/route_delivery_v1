// Middleware central de tratamento de erros.
// Qualquer rota que chamar next(err) ou lançar dentro de um async handler
// (envolvido por asyncHandler) cai aqui.
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.code === "P2002") {
    return res.status(409).json({ erro: "Já existe um registro com esse valor único.", campo: err.meta?.target });
  }
  if (err.code === "P2025") {
    return res.status(404).json({ erro: "Registro não encontrado." });
  }
  if (err.code === "P2003") {
    return res.status(409).json({ erro: "Este registro está vinculado a outros dados e não pode ser removido." });
  }
  if (err.name === "PrismaClientValidationError") {
    return res.status(400).json({ erro: "Dados inválidos para este registro." });
  }

  const status = err.status || 500;
  res.status(status).json({ erro: err.message || "Erro interno no servidor.", ...(err.extra || {}) });
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
