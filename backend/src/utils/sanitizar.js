// Helpers para limpar o body vindo dos formulários antes de mandar pro Prisma.

// Remove campos que nunca devem ser gravados direto pelo body da requisição.
function omitir(obj, campos) {
  const copia = { ...obj };
  campos.forEach(c => delete copia[c]);
  return copia;
}

// Remove senhaHash de um registro (ou lista de registros) antes de responder.
function semSenha(registro) {
  if (Array.isArray(registro)) return registro.map(semSenha);
  if (!registro) return registro;
  // aparelhoId (identificador do celular logado) também não sai da API — só se há um aparelho conectado.
  const { senhaHash, aparelhoId, ...resto } = registro;
  return { ...resto, temAcessoApp: !!senhaHash, ...(aparelhoId !== undefined ? { aparelhoConectado: !!aparelhoId } : {}) };
}

// Converte campos de formulário (strings) para os tipos esperados pelo schema.
//   datas: "2026-01-31" -> Date   |   numeros: "12,5" -> 12.5   |   "" -> null
function normalizar(obj, { datas = [], numeros = [], inteiros = [] } = {}) {
  const r = { ...obj };
  Object.keys(r).forEach(k => { if (r[k] === "") r[k] = null; });
  datas.forEach(c => { if (r[c] != null) r[c] = new Date(r[c]); });
  numeros.forEach(c => { if (r[c] != null) r[c] = Number(String(r[c]).replace(",", ".")); });
  inteiros.forEach(c => { if (r[c] != null) r[c] = parseInt(r[c], 10); });
  return r;
}

module.exports = { omitir, semSenha, normalizar };
