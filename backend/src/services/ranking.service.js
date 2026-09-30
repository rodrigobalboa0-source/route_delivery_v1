// Ranking semanal dos entregadores: entregas concluídas de segunda 00:00 a domingo 23:59 (horário de Brasília).
// Os 10 primeiros ganham o prêmio configurado em Configurações › Ranking semanal. Ao virar a semana, o sistema
// fecha a anterior sozinho: guarda o resultado e lança cada prêmio como comissão (aparece no app com pop-up
// e gera conta a pagar no Financeiro).
const prisma = require("../lib/prisma");

const FUSO_MS = 3 * 60 * 60 * 1000; // Brasília = UTC-3 (sem horário de verão)
const DIA_MS = 24 * 60 * 60 * 1000;

// { inicio, fim } da semana (segunda a segunda) que contém `data`.
function semanaDe(data = new Date()) {
  const local = new Date(data.getTime() - FUSO_MS);
  const diasDesdeSegunda = (local.getUTCDay() + 6) % 7;
  const segundaLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - diasDesdeSegunda * DIA_MS;
  const inicio = new Date(segundaLocal + FUSO_MS);
  return { inicio, fim: new Date(inicio.getTime() + 7 * DIA_MS) };
}

async function configRanking() {
  const c = await prisma.configuracao.findFirst({ select: { rankingAtivo: true, rankingPremios: true, rankingMinimoEntregas: true } });
  const premios = Array.from({ length: 10 }, (_, i) => Number((Array.isArray(c?.rankingPremios) ? c.rankingPremios : [])[i]) || 0);
  return { ativo: c?.rankingAtivo ?? true, premios, minimo: c?.rankingMinimoEntregas ?? 1 };
}

// Classificação completa da semana: mais entregas primeiro; empate = quem chegou primeiro ao total (última entrega mais cedo).
async function classificacao({ inicio, fim }, cfg) {
  const c = cfg || await configRanking();
  const linhas = await prisma.$queryRaw`
    SELECT p."entregadorId" AS id, count(*)::int AS entregas, max(p."entregueEm") AS ultima
    FROM "Pedido" p
    WHERE p.status = 'ENTREGUE' AND p."entregadorId" IS NOT NULL AND p."entregueEm" >= ${inicio} AND p."entregueEm" < ${fim}
    GROUP BY p."entregadorId"
    ORDER BY entregas DESC, ultima ASC`;
  const ids = linhas.map(l => l.id);
  const nomes = new Map((await prisma.entregador.findMany({ where: { id: { in: ids } }, select: { id: true, nomeCompleto: true, fotoUrl: true } })).map(e => [e.id, e]));
  return linhas
    .filter(l => l.entregas >= c.minimo)
    .map((l, i) => ({
      posicao: i + 1,
      entregadorId: l.id,
      nome: nomes.get(l.id)?.nomeCompleto || "—",
      fotoUrl: nomes.get(l.id)?.fotoUrl || null,
      entregas: l.entregas,
      premio: i < 10 ? c.premios[i] : 0,
    }));
}

// "João Silva Souza" -> "João S." (o app mostra o ranking para todos os entregadores)
function nomeCurto(nome = "") {
  const p = nome.trim().split(/\s+/);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || "—";
}

let ultimaVerificacao = 0;
// Fecha a semana anterior, se ainda não foi fechada. Roda junto do tempo real (no máximo 1x por minuto).
async function fecharSemanaAnterior({ forcar = false } = {}) {
  if (!forcar && Date.now() - ultimaVerificacao < 60000) return null;
  ultimaVerificacao = Date.now();
  const cfg = await configRanking();
  if (!cfg.ativo) return null;
  const atual = semanaDe();
  const anterior = { inicio: new Date(atual.inicio.getTime() - 7 * DIA_MS), fim: atual.inicio };
  if (await prisma.rankingSemana.findUnique({ where: { inicio: anterior.inicio } })) return null;

  const lista = await classificacao(anterior, cfg);
  const top = lista.slice(0, 10);
  let semana;
  try {
    // Único por "inicio": se dois servidores tentarem ao mesmo tempo, só um fecha (e paga) a semana.
    semana = await prisma.rankingSemana.create({
      data: { inicio: anterior.inicio, fim: anterior.fim, resultado: top, premiosTotal: top.reduce((s, x) => s + x.premio, 0) },
    });
  } catch {
    return null;
  }

  const referencia = new Date(anterior.fim.getTime() - 12 * 60 * 60 * 1000); // domingo
  const periodo = `${dataBR(anterior.inicio)} a ${dataBR(referencia)}`;
  const resultado = [];
  for (const x of top) {
    let comissaoId = null;
    if (x.premio > 0) {
      const c = await prisma.$transaction(async tx => {
        const cm = await tx.comissaoManual.create({
          data: {
            origem: "RANKING", beneficiarioTipo: "ENTREGADOR", entregadorId: x.entregadorId, beneficiarioNome: x.nome,
            comercioNome: "Ranking semanal", quantidadeEntregas: x.entregas, valor: x.premio, referencia,
            descricao: `Prêmio do ranking semanal — ${x.posicao}º lugar (${periodo})`, autorNome: "Ranking semanal",
          },
        });
        await tx.contaPagar.create({
          data: {
            descricao: `Prêmio ranking ${x.posicao}º lugar — ${periodo}`, favorecido: x.nome, categoria: "COMISSAO",
            vencimento: new Date(), valor: x.premio, observacao: `${x.entregas} entregas na semana`, comissaoManualId: cm.id,
          },
        });
        return cm;
      });
      comissaoId = c.id;
    }
    resultado.push({ ...x, comissaoId });
  }
  await prisma.rankingSemana.update({ where: { id: semana.id }, data: { resultado } });
  if (top.length) {
    await prisma.notificacao.create({ data: { tipo: "ranking", texto: `Ranking semanal (${periodo}) fechado: 1º ${top[0].nome} com ${top[0].entregas} entregas.` } }).catch(() => {});
  }
  return semana;
}

const dataBR = d => new Date(d.getTime() - FUSO_MS).toISOString().slice(0, 10).split("-").reverse().join("/");

module.exports = { semanaDe, configRanking, classificacao, fecharSemanaAnterior, nomeCurto, dataBR, DIA_MS };
