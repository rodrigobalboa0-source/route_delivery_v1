// Regras de saque do entregador (saque normal e saque rápido).
const prisma = require("../lib/prisma");

const PADROES = {
  NORMAL: { limitePorSolicitacao: null, maxSolicitacoesDia: 1, diasPermitidos: [], datasEspecificas: [] },
  RAPIDO: { limitePorSolicitacao: null, maxSolicitacoesDia: 4, diasPermitidos: [], datasEspecificas: [] },
};

function erro400(mensagem) {
  const err = new Error(mensagem);
  err.status = 400;
  return err;
}

// Retorna { NORMAL: {...}, RAPIDO: {...} }, criando as linhas com os padrões se faltarem.
async function obterRegras() {
  const existentes = await prisma.regraSaque.findMany();
  const porTipo = Object.fromEntries(existentes.map(r => [r.tipo, r]));
  for (const tipo of Object.keys(PADROES)) {
    if (!porTipo[tipo]) porTipo[tipo] = await prisma.regraSaque.create({ data: { tipo, ...PADROES[tipo] } });
  }
  return porTipo;
}

function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

// Valida e normaliza a regra vinda do painel. `nome` entra nas mensagens de erro.
function normalizarRegra(r = {}, nome) {
  let limite = r.limitePorSolicitacao;
  if (limite === "" || limite === undefined || limite === null) limite = null;
  else {
    limite = Number(String(limite).replace(",", "."));
    if (!Number.isFinite(limite) || limite <= 0) throw erro400(`${nome}: o limite por solicitação precisa ser maior que zero (ou vazio para sem limite).`);
  }

  const max = Number(r.maxSolicitacoesDia);
  if (!Number.isInteger(max) || max < 1) throw erro400(`${nome}: o máximo de solicitações por dia precisa ser um número inteiro a partir de 1.`);

  const dias = [...new Set((r.diasPermitidos || []).map(Number))];
  if (dias.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw erro400(`${nome}: dia da semana inválido.`);

  // Aceita lista ou texto separado por vírgula/espaço/quebra de linha.
  const brutas = Array.isArray(r.datasEspecificas) ? r.datasEspecificas : String(r.datasEspecificas || "").split(/[\s,;]+/);
  const datas = [...new Set(brutas.map(s => String(s).trim()).filter(Boolean))];
  const invalidas = datas.filter(d => !dataValida(d));
  if (invalidas.length) throw erro400(`${nome}: data(s) inválida(s): ${invalidas.join(", ")}. Use o formato AAAA-MM-DD.`);

  // Taxa (%) descontada de cada saque deste tipo (ex.: saque rápido). Vazio = 0.
  const taxa = r.taxaPercentual === "" || r.taxaPercentual == null ? 0 : Number(String(r.taxaPercentual).replace(",", "."));
  if (!Number.isFinite(taxa) || taxa < 0 || taxa > 50) throw erro400(`${nome}: a taxa deve ficar entre 0% e 50%.`);

  return {
    limitePorSolicitacao: limite,
    taxaPercentual: Math.round(taxa * 100) / 100,
    maxSolicitacoesDia: max,
    diasPermitidos: dias.sort((a, b) => a - b),
    datasEspecificas: datas.sort(),
  };
}

async function salvarRegras(body = {}) {
  const normal = normalizarRegra(body.NORMAL, "Saque normal");
  const rapido = normalizarRegra(body.RAPIDO, "Saque rápido");
  await prisma.$transaction([
    prisma.regraSaque.upsert({ where: { tipo: "NORMAL" }, update: normal, create: { tipo: "NORMAL", ...normal } }),
    prisma.regraSaque.upsert({ where: { tipo: "RAPIDO" }, update: rapido, create: { tipo: "RAPIDO", ...rapido } }),
  ]);
  return obterRegras();
}

module.exports = { obterRegras, salvarRegras };
