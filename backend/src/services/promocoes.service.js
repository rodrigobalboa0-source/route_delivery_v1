// Promoções para entregadores: vigência, público e avisos (pop-up) no app.
const prisma = require("../lib/prisma");

const VEICULOS = ["MOTO", "BIKE", "CARRO"];
const JANELA_AVISOS_DIAS = 7;
const FOTO_MAX_BYTES = 1.5 * 1024 * 1024;

function erro400(mensagem) {
  const err = new Error(mensagem);
  err.status = 400;
  return err;
}

// INATIVA | AGENDADA | ATIVA | ENCERRADA
function situacao(p, agora = new Date()) {
  if (!p.ativa) return "INATIVA";
  if (p.inicio && p.inicio > agora) return "AGENDADA";
  if (p.fim && p.fim <= agora) return "ENCERRADA";
  return "ATIVA";
}

const paraVeiculo = (p, veiculo) => !p.veiculos?.length || p.veiculos.includes(veiculo);

// Valida e normaliza o corpo vindo do painel.
function dadosDoBody(b, parcial = false) {
  const d = {};
  if (!parcial || b.titulo !== undefined) {
    const titulo = String(b.titulo || "").trim();
    if (!titulo) throw erro400("Informe o título da promoção.");
    if (titulo.length > 80) throw erro400("O título pode ter até 80 caracteres.");
    d.titulo = titulo;
  }
  if (b.descricao !== undefined) {
    const t = String(b.descricao || "").trim();
    if (t.length > 600) throw erro400("A descrição pode ter até 600 caracteres.");
    d.descricao = t || null;
  }
  if (b.premio !== undefined) {
    const t = String(b.premio || "").trim();
    if (t.length > 60) throw erro400("O prêmio pode ter até 60 caracteres.");
    d.premio = t || null;
  }
  if (b.fotoUrl !== undefined) {
    if (b.fotoUrl) {
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(b.fotoUrl)) throw erro400("Envie a foto em JPG, PNG ou WEBP.");
      if (b.fotoUrl.length * 0.75 > FOTO_MAX_BYTES) throw erro400("A foto é grande demais (máximo 1,5 MB).");
    }
    d.fotoUrl = b.fotoUrl || null;
  }
  if (b.veiculos !== undefined) {
    const v = [...new Set(Array.isArray(b.veiculos) ? b.veiculos : [])];
    if (v.some(x => !VEICULOS.includes(x))) throw erro400("Veículo inválido.");
    d.veiculos = v;
  }
  for (const campo of ["inicio", "fim"]) {
    if (b[campo] !== undefined) {
      if (!b[campo]) d[campo] = null;
      else {
        const dt = new Date(b[campo]);
        if (Number.isNaN(dt.getTime())) throw erro400(`Data de ${campo === "inicio" ? "início" : "fim"} inválida.`);
        d[campo] = dt;
      }
    }
  }
  return d;
}

function validarPeriodo(inicio, fim) {
  if (inicio && fim && fim <= inicio) throw erro400("O fim da promoção precisa ser depois do início.");
}

// Liga/desliga e registra o evento que vira pop-up no app.
async function mudarAtiva(id, ativa, autorNome) {
  const atual = await prisma.promocaoEntregador.findUnique({ where: { id } });
  if (!atual) {
    const err = new Error("Promoção não encontrada.");
    err.status = 404;
    throw err;
  }
  if (atual.ativa === ativa) return atual;
  if (ativa && atual.fim && atual.fim <= new Date()) throw erro400("O fim desta promoção já passou. Ajuste a data de fim antes de ativar.");
  const [p] = await prisma.$transaction([
    prisma.promocaoEntregador.update({ where: { id }, data: { ativa } }),
    prisma.promocaoEvento.create({ data: { promocaoId: id, tipo: ativa ? "ATIVADA" : "DESATIVADA", autorNome } }),
  ]);
  return p;
}

// Promoções que o entregador vê agora na lista do app.
async function vigentesPara(entregador, agora = new Date()) {
  const lista = await prisma.promocaoEntregador.findMany({
    where: { ativa: true, OR: [{ inicio: null }, { inicio: { lte: agora } }], AND: [{ OR: [{ fim: null }, { fim: { gt: agora } }] }] },
    orderBy: [{ inicio: "desc" }, { createdAt: "desc" }],
  });
  return lista.filter(p => paraVeiculo(p, entregador.veiculoTipo));
}

const publico = p => ({ id: p.id, titulo: p.titulo, descricao: p.descricao, premio: p.premio, fotoUrl: p.fotoUrl, inicio: p.inicio, fim: p.fim });

// Avisos ainda não vistos pelo entregador, um por promoção (o mais recente):
//   ATIVADA    -> promoção começou a valer (ativada e dentro do período)
//   DESATIVADA -> desligada no painel
//   ENCERRADA  -> chegou ao fim do período (aviso gerado automaticamente)
async function avisosPara(entregador, agora = new Date()) {
  const desde = new Date(agora.getTime() - JANELA_AVISOS_DIAS * 86400000);
  const [eventos, encerradas, vistos] = await Promise.all([
    prisma.promocaoEvento.findMany({ where: { createdAt: { gte: desde } }, include: { promocao: true }, orderBy: { createdAt: "desc" } }),
    prisma.promocaoEntregador.findMany({ where: { ativa: true, fim: { gte: desde, lte: agora } } }),
    prisma.promocaoAvisoVisto.findMany({ where: { entregadorId: entregador.id }, select: { avisoId: true } }),
  ]);
  const jaVistos = new Set(vistos.map(v => v.avisoId));

  const porPromocao = new Map();
  for (const ev of eventos) {
    const p = ev.promocao;
    if (porPromocao.has(p.id) || !paraVeiculo(p, entregador.veiculoTipo)) continue;
    const s = situacao(p, agora);
    // Só vale o estado atual: ativação de promoção agendada aparece quando começar.
    if (ev.tipo === "ATIVADA" && s !== "ATIVA") continue;
    if (ev.tipo === "DESATIVADA" && p.ativa) continue;
    porPromocao.set(p.id, { avisoId: ev.id, tipo: ev.tipo, quando: ev.tipo === "ATIVADA" && p.inicio > ev.createdAt ? p.inicio : ev.createdAt, promocao: publico(p) });
  }
  for (const p of encerradas) {
    if (!paraVeiculo(p, entregador.veiculoTipo)) continue;
    porPromocao.set(p.id, { avisoId: `fim:${p.id}`, tipo: "ENCERRADA", quando: p.fim, promocao: publico(p) });
  }

  return [...porPromocao.values()].filter(a => !jaVistos.has(a.avisoId)).sort((a, b) => new Date(b.quando) - new Date(a.quando));
}

async function marcarVisto(entregadorId, avisoId) {
  await prisma.promocaoAvisoVisto.upsert({
    where: { entregadorId_avisoId: { entregadorId, avisoId } },
    update: {},
    create: { entregadorId, avisoId },
  });
}

module.exports = { situacao, dadosDoBody, validarPeriodo, mudarAtiva, vigentesPara, avisosPara, marcarVisto, publico, VEICULOS };
