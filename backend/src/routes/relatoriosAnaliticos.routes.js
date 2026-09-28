// Relatórios analíticos do painel — montados em /api/relatorios.
// Período: ?desde=AAAA-MM-DD&ate=AAAA-MM-DD (horário local, "ate" inclui o dia inteiro).
const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { distanciaLinhaRetaKm } = require("../utils/geo");
const { cpfValido } = require("../utils/documento");
const { erro400, periodo, dia } = require("../utils/periodo");
const { ehAceite, ehDevolucao } = require("../utils/statusPedido");

const router = express.Router();

// ---------- Utilitários ----------

// Duração em minutos; zero ou negativa = desconhecida (ex.: pedidos antigos cujo
// horário foi reconstruído na migração com início e fim iguais).
function minutos(a, b) {
  if (!a || !b) return null;
  const m = (new Date(b) - new Date(a)) / 60000;
  return m > 0 ? m : null;
}
function media(valores) {
  const v = valores.filter(x => x != null && Number.isFinite(x));
  return v.length ? Number((v.reduce((s, x) => s + x, 0) / v.length).toFixed(1)) : null;
}
function percentil(valores, p) {
  const v = valores.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return Number(v[Math.min(v.length - 1, Math.floor((p / 100) * v.length))].toFixed(1));
}
const soma = valores => Number(valores.reduce((s, x) => s + (x || 0), 0).toFixed(2));
const pct = (parte, total) => (total ? Number(((parte / total) * 100).toFixed(1)) : 0);
const chaveDia = d => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
function diasDoPeriodo(desde, ate) {
  const lista = [];
  const d = new Date(desde);
  while (d <= ate) { lista.push(chaveDia(d)); d.setDate(d.getDate() + 1); }
  return lista;
}

const SELECT_PEDIDO_TEMPOS = {
  id: true, codigo: true, status: true, comercioId: true, entregadorId: true, valor: true, distanciaKm: true, origem: true,
  createdAt: true, prontoEm: true, aceitoEm: true, entregueEm: true, canceladoEm: true,
};

// ---------- Analítico de Embarcadores (comércios) ----------
// Por comércio no período (pedidos criados): volume, conversão, receita e tempos.
router.get(
  "/embarcadores",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query);
    const [comercios, pedidos] = await Promise.all([
      prisma.comercio.findMany({
        select: { id: true, nomeFantasia: true, segmento: true, bloqueado: true, enderecos: { where: { principal: true }, select: { cidade: true }, take: 1 } },
      }),
      prisma.pedido.findMany({ where: { createdAt: { gte: desde, lte: ate } }, select: SELECT_PEDIDO_TEMPOS }),
    ]);

    const porComercio = new Map(comercios.map(c => [c.id, []]));
    pedidos.forEach(p => { if (porComercio.has(p.comercioId)) porComercio.get(p.comercioId).push(p); });

    const linhas = comercios.map(c => {
      const ps = porComercio.get(c.id);
      const entregues = ps.filter(p => p.status === "ENTREGUE");
      const cancelados = ps.filter(p => p.status === "CANCELADO");
      const receita = soma(entregues.map(p => p.valor));
      return {
        comercioId: c.id,
        nome: c.nomeFantasia,
        segmento: c.segmento,
        cidade: c.enderecos[0]?.cidade || null,
        bloqueado: c.bloqueado,
        pedidos: ps.length,
        entregues: entregues.length,
        cancelados: cancelados.length,
        emAndamento: ps.length - entregues.length - cancelados.length,
        taxaEntrega: pct(entregues.length, ps.length),
        taxaCancelamento: pct(cancelados.length, ps.length),
        receita,
        ticketMedio: entregues.length ? Number((receita / entregues.length).toFixed(2)) : 0,
        distanciaMediaKm: media(entregues.map(p => p.distanciaKm)),
        tempoPreparoMin: media(ps.map(p => minutos(p.createdAt, p.prontoEm))),
        tempoTotalMin: media(entregues.map(p => minutos(p.createdAt, p.entregueEm))),
        ultimoPedido: ps.reduce((m, p) => (!m || p.createdAt > m ? p.createdAt : m), null),
      };
    }).sort((a, b) => b.pedidos - a.pedidos || a.nome.localeCompare(b.nome));

    const entreguesTotal = linhas.reduce((s, l) => s + l.entregues, 0);
    res.json({
      desde, ate, linhas,
      totais: {
        comercios: linhas.length,
        comerciosComPedidos: linhas.filter(l => l.pedidos).length,
        pedidos: pedidos.length,
        entregues: entreguesTotal,
        cancelados: linhas.reduce((s, l) => s + l.cancelados, 0),
        receita: soma(linhas.map(l => l.receita)),
        taxaEntrega: pct(entreguesTotal, pedidos.length),
      },
    });
  })
);

// ---------- Analítico de Entregadores ----------
// Entregas concluídas no período (pela data da entrega) + aceites e desistências do histórico.
router.get(
  "/entregadores-analitico",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query);
    const [entregadores, entregues, eventos] = await Promise.all([
      prisma.entregador.findMany({ select: { id: true, nomeCompleto: true, status: true, bloqueado: true, veiculoTipo: true, tipoEntrega: true, taxaEntrega: true } }),
      prisma.pedido.findMany({
        where: { status: "ENTREGUE", entregadorId: { not: null }, entregueEm: { gte: desde, lte: ate } },
        select: SELECT_PEDIDO_TEMPOS,
      }),
      prisma.pedidoStatusHistorico.findMany({
        where: { entregadorId: { not: null }, createdAt: { gte: desde, lte: ate } },
        select: { entregadorId: true, de: true, para: true, autorTipo: true },
      }),
    ]);

    const linhas = entregadores.map(e => {
      const minhas = entregues.filter(p => p.entregadorId === e.id);
      const meus = eventos.filter(ev => ev.entregadorId === e.id);
      const aceites = meus.filter(ehAceite).length;
      const desistencias = meus.filter(ev => ehDevolucao(ev) && ev.autorTipo === "ENTREGADOR").length;
      const removido = meus.filter(ev => ehDevolucao(ev) && ev.autorTipo !== "ENTREGADOR").length;
      const valor = soma(minhas.map(p => p.valor));
      return {
        entregadorId: e.id,
        nome: e.nomeCompleto,
        status: e.status,
        bloqueado: e.bloqueado,
        veiculoTipo: e.veiculoTipo,
        tipoEntrega: e.tipoEntrega,
        entregas: minhas.length,
        aceites,
        desistencias,
        removidoPeloPainel: removido,
        taxaConclusao: pct(minhas.length, minhas.length + desistencias),
        distanciaKm: Number(soma(minhas.map(p => p.distanciaKm)).toFixed(1)),
        valorEntregas: valor,
        repasseEstimado: e.taxaEntrega != null ? Number((e.taxaEntrega * minhas.length).toFixed(2)) : null,
        tempoMedioEntregaMin: media(minhas.map(p => minutos(p.aceitoEm, p.entregueEm))),
        diasAtivos: new Set(minhas.map(p => chaveDia(p.entregueEm))).size,
        ultimaEntrega: minhas.reduce((m, p) => (!m || p.entregueEm > m ? p.entregueEm : m), null),
      };
    }).sort((a, b) => b.entregas - a.entregas || a.nome.localeCompare(b.nome));

    res.json({
      desde, ate, linhas,
      totais: {
        entregadores: linhas.length,
        comEntregas: linhas.filter(l => l.entregas).length,
        entregas: entregues.length,
        desistencias: linhas.reduce((s, l) => s + l.desistencias, 0),
        distanciaKm: Number(soma(linhas.map(l => l.distanciaKm)).toFixed(1)),
        repasseEstimado: soma(linhas.map(l => l.repasseEstimado)),
      },
    });
  })
);

// ---------- Roteirização ----------
// Sequência de coletas e entregas de um entregador num dia (ordem do aceite).
// Sem entregadorId: resumo de todos os entregadores com corridas no dia.
router.get(
  "/roteirizacao",
  asyncHandler(async (req, res) => {
    const { inicio, fim } = dia(req.query);
    const noDia = { OR: [{ aceitoEm: { gte: inicio, lte: fim } }, { entregueEm: { gte: inicio, lte: fim } }] };

    if (!req.query.entregadorId) {
      const pedidos = await prisma.pedido.findMany({
        where: { entregadorId: { not: null }, ...noDia },
        select: { entregadorId: true, distanciaKm: true, status: true, entregador: { select: { nomeCompleto: true } } },
      });
      const porEntregador = {};
      pedidos.forEach(p => {
        const r = porEntregador[p.entregadorId] ||= { entregadorId: p.entregadorId, nome: p.entregador?.nomeCompleto, corridas: 0, entregues: 0, distanciaKm: 0 };
        r.corridas++;
        if (p.status === "ENTREGUE") r.entregues++;
        r.distanciaKm += p.distanciaKm || 0;
      });
      return res.json({
        data: chaveDia(inicio),
        entregadores: Object.values(porEntregador).map(r => ({ ...r, distanciaKm: Number(r.distanciaKm.toFixed(1)) })).sort((a, b) => b.corridas - a.corridas),
      });
    }

    const pedidos = await prisma.pedido.findMany({
      where: { entregadorId: req.query.entregadorId, ...noDia },
      orderBy: [{ aceitoEm: "asc" }, { createdAt: "asc" }],
      select: {
        id: true, codigo: true, status: true, clienteNome: true, endereco: true, latDestino: true, lngDestino: true,
        distanciaKm: true, valor: true, aceitoEm: true, entregueEm: true,
        comercio: { select: { nomeFantasia: true, enderecos: { where: { principal: true }, take: 1, select: { rua: true, numero: true, lat: true, lng: true } } } },
      },
    });

    // Deslocamento entre a entrega anterior e a próxima coleta (linha reta — estimativa).
    let deslocamentoKm = 0;
    let anterior = null;
    const paradas = pedidos.map((p, i) => {
      const coleta = p.comercio.enderecos[0];
      if (anterior?.lat != null && coleta?.lat != null) deslocamentoKm += distanciaLinhaRetaKm(anterior, { lat: coleta.lat, lng: coleta.lng });
      if (p.latDestino != null) anterior = { lat: p.latDestino, lng: p.lngDestino };
      return {
        ordem: i + 1,
        pedidoId: p.id,
        codigo: p.codigo,
        status: p.status,
        cliente: p.clienteNome,
        coleta: { nome: p.comercio.nomeFantasia, endereco: coleta ? `${coleta.rua}${coleta.numero ? ", " + coleta.numero : ""}` : null, lat: coleta?.lat ?? null, lng: coleta?.lng ?? null },
        entrega: { endereco: p.endereco, lat: p.latDestino, lng: p.lngDestino },
        distanciaKm: p.distanciaKm,
        valor: p.valor,
        aceitoEm: p.aceitoEm,
        entregueEm: p.entregueEm,
        duracaoMin: minutos(p.aceitoEm, p.entregueEm) != null ? Number(minutos(p.aceitoEm, p.entregueEm).toFixed(0)) : null,
      };
    });

    const kmEntregas = soma(pedidos.map(p => p.distanciaKm));
    res.json({
      data: chaveDia(inicio),
      paradas,
      totais: {
        corridas: paradas.length,
        entregues: paradas.filter(p => p.status === "ENTREGUE").length,
        kmEntregas: Number(kmEntregas.toFixed(1)),
        kmDeslocamentoEstimado: Number(deslocamentoKm.toFixed(1)),
        valor: soma(pedidos.map(p => p.valor)),
        semCoordenadas: paradas.filter(p => p.entrega.lat == null || p.coleta.lat == null).length,
      },
    });
  })
);

// ---------- Analítico da Operação ----------
// Volume por hora/dia da semana, tempos de cada etapa e distribuição por status e origem.
router.get(
  "/operacao",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query);
    const [pedidos, cancelamentos, atrasos] = await Promise.all([
      prisma.pedido.findMany({ where: { createdAt: { gte: desde, lte: ate } }, select: SELECT_PEDIDO_TEMPOS }),
      prisma.pedidoStatusHistorico.groupBy({
        by: ["autorTipo"], where: { para: "CANCELADO", createdAt: { gte: desde, lte: ate } }, _count: { _all: true },
      }),
      prisma.pedidoStatusHistorico.count({ where: { para: "ATRASADO", createdAt: { gte: desde, lte: ate } } }),
    ]);

    const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: h, pedidos: 0 }));
    const nomesDia = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const porDiaSemana = nomesDia.map(d => ({ dia: d, pedidos: 0 }));
    const mapaCalor = nomesDia.map(() => Array(24).fill(0));
    const porStatus = {};
    const porOrigem = {};
    pedidos.forEach(p => {
      const d = new Date(p.createdAt);
      porHora[d.getHours()].pedidos++;
      porDiaSemana[d.getDay()].pedidos++;
      mapaCalor[d.getDay()][d.getHours()]++;
      porStatus[p.status] = (porStatus[p.status] || 0) + 1;
      const o = p.origem || "NAO_INFORMADA";
      porOrigem[o] = (porOrigem[o] || 0) + 1;
    });

    const etapa = valores => ({ media: media(valores), p50: percentil(valores, 50), p90: percentil(valores, 90), amostras: valores.filter(v => v != null).length });
    const entregues = pedidos.filter(p => p.status === "ENTREGUE");
    const horaPico = porHora.reduce((m, h) => (h.pedidos > m.pedidos ? h : m), porHora[0]);

    res.json({
      desde, ate,
      totais: {
        pedidos: pedidos.length,
        entregues: entregues.length,
        cancelados: porStatus.CANCELADO || 0,
        taxaEntrega: pct(entregues.length, pedidos.length),
        taxaCancelamento: pct(porStatus.CANCELADO || 0, pedidos.length),
        mediaPorDia: Number((pedidos.length / diasDoPeriodo(desde, ate).length).toFixed(1)),
        horaPico: pedidos.length ? horaPico.hora : null,
        marcacoesDeAtraso: atrasos,
      },
      tempos: {
        preparo: etapa(pedidos.map(p => minutos(p.createdAt, p.prontoEm))),
        esperaEntregador: etapa(pedidos.map(p => minutos(p.prontoEm, p.aceitoEm))),
        entrega: etapa(entregues.map(p => minutos(p.aceitoEm, p.entregueEm))),
        total: etapa(entregues.map(p => minutos(p.createdAt, p.entregueEm))),
      },
      porHora, porDiaSemana, mapaCalor, porStatus, porOrigem,
      cancelamentosPor: Object.fromEntries(cancelamentos.map(c => [c.autorTipo, c._count._all])),
    });
  })
);

// ---------- Notas Fiscais ----------
// Resumo de entregas com e sem nota fiscal no período (a lista vem de /api/pedidos?notaFiscal=).
router.get(
  "/notas-fiscais",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query);
    const pedidos = await prisma.pedido.findMany({
      where: { createdAt: { gte: desde, lte: ate }, status: { not: "CANCELADO" } },
      select: { comercioId: true, notaFiscalNumero: true, notaFiscalChave: true, notaFiscalValor: true, comercio: { select: { nomeFantasia: true } } },
    });
    const temNota = p => !!(p.notaFiscalNumero || p.notaFiscalChave);
    const porComercio = {};
    pedidos.forEach(p => {
      const r = porComercio[p.comercioId] ||= { comercioId: p.comercioId, nome: p.comercio.nomeFantasia, comNota: 0, semNota: 0, valorNotas: 0 };
      if (temNota(p)) { r.comNota++; r.valorNotas += p.notaFiscalValor || 0; } else r.semNota++;
    });
    const com = pedidos.filter(temNota);
    res.json({
      desde, ate,
      totais: {
        entregas: pedidos.length,
        comNota: com.length,
        semNota: pedidos.length - com.length,
        cobertura: pct(com.length, pedidos.length),
        valorNotas: soma(com.map(p => p.notaFiscalValor)),
        semChave: com.filter(p => !p.notaFiscalChave).length,
      },
      porComercio: Object.values(porComercio)
        .map(r => ({ ...r, valorNotas: Number(r.valorNotas.toFixed(2)), cobertura: pct(r.comNota, r.comNota + r.semNota) }))
        .sort((a, b) => b.semNota - a.semNota),
    });
  })
);

// ---------- Recorrência de Entregas ----------
// Clientes (destinatários) que recebem mais de uma vez. Identifica pelo telefone;
// sem telefone, pelo nome + endereço.
router.get(
  "/recorrencia",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query, 90);
    const minimo = Math.max(2, Number(req.query.minimo) || 2);
    const where = { createdAt: { gte: desde, lte: ate }, status: { not: "CANCELADO" } };
    if (req.query.comercioId) where.comercioId = req.query.comercioId;
    const pedidos = await prisma.pedido.findMany({
      where, orderBy: { createdAt: "asc" },
      select: { clienteNome: true, clienteTelefone: true, endereco: true, valor: true, createdAt: true, comercio: { select: { nomeFantasia: true } } },
    });

    const normalizar = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
    const grupos = new Map();
    pedidos.forEach(p => {
      const tel = String(p.clienteTelefone || "").replace(/\D/g, "");
      const chave = tel.length >= 8 ? `t:${tel}` : `n:${normalizar(p.clienteNome)}|${normalizar(p.endereco)}`;
      const g = grupos.get(chave) || { cliente: p.clienteNome, telefone: p.clienteTelefone || null, datas: [], valores: [], comercios: new Set(), enderecos: new Set() };
      g.datas.push(p.createdAt);
      g.valores.push(p.valor);
      g.comercios.add(p.comercio.nomeFantasia);
      g.enderecos.add(p.endereco);
      g.ultimoEndereco = p.endereco;
      grupos.set(chave, g);
    });

    const todos = [...grupos.values()];
    const recorrentes = todos.filter(g => g.datas.length >= minimo).map(g => {
      const intervalos = g.datas.slice(1).map((d, i) => (d - g.datas[i]) / 86400000);
      return {
        cliente: g.cliente,
        telefone: g.telefone,
        endereco: g.ultimoEndereco,
        enderecosDiferentes: g.enderecos.size,
        comercios: [...g.comercios],
        entregas: g.datas.length,
        primeira: g.datas[0],
        ultima: g.datas[g.datas.length - 1],
        intervaloMedioDias: media(intervalos),
        valorTotal: soma(g.valores),
      };
    }).sort((a, b) => b.entregas - a.entregas);

    res.json({
      desde, ate, minimo,
      totais: {
        clientes: todos.length,
        recorrentes: recorrentes.length,
        percentualRecorrentes: pct(recorrentes.length, todos.length),
        entregasDeRecorrentes: recorrentes.reduce((s, r) => s + r.entregas, 0),
        entregas: pedidos.length,
      },
      linhas: recorrentes.slice(0, 500),
    });
  })
);

// ---------- Trajeto dos Entregadores ----------
// Rastro de posições enviado pelo app num dia + coletas/entregas do entregador.
router.get(
  "/trajeto",
  asyncHandler(async (req, res) => {
    if (!req.query.entregadorId) throw erro400('Informe o "entregadorId".');
    const { inicio, fim } = dia(req.query);
    const [pontos, pedidos] = await Promise.all([
      prisma.entregadorLocalizacao.findMany({
        where: { entregadorId: req.query.entregadorId, createdAt: { gte: inicio, lte: fim } },
        orderBy: { createdAt: "asc" }, select: { lat: true, lng: true, createdAt: true },
      }),
      prisma.pedido.findMany({
        where: { entregadorId: req.query.entregadorId, OR: [{ aceitoEm: { gte: inicio, lte: fim } }, { entregueEm: { gte: inicio, lte: fim } }] },
        select: {
          codigo: true, status: true, latDestino: true, lngDestino: true, endereco: true, entregueEm: true,
          comercio: { select: { nomeFantasia: true, enderecos: { where: { principal: true }, take: 1, select: { lat: true, lng: true } } } },
        },
      }),
    ]);

    // Distância percorrida: soma dos trechos, ignorando saltos impossíveis (> 150 km/h) de GPS ruim.
    let distanciaKm = 0;
    let descartados = 0;
    for (let i = 1; i < pontos.length; i++) {
      const km = distanciaLinhaRetaKm(pontos[i - 1], pontos[i]);
      const horas = (pontos[i].createdAt - pontos[i - 1].createdAt) / 3600000;
      if (horas > 0 && km / horas > 150) { descartados++; continue; }
      distanciaKm += km;
    }
    const inicioTrajeto = pontos[0]?.createdAt || null;
    const fimTrajeto = pontos[pontos.length - 1]?.createdAt || null;

    res.json({
      data: chaveDia(inicio),
      pontos: pontos.map(p => ({ lat: p.lat, lng: p.lng, t: p.createdAt })),
      totais: {
        pontos: pontos.length,
        distanciaKm: Number(distanciaKm.toFixed(2)),
        inicio: inicioTrajeto,
        fim: fimTrajeto,
        duracaoMin: minutos(inicioTrajeto, fimTrajeto) != null ? Math.round(minutos(inicioTrajeto, fimTrajeto)) : null,
        pontosDescartados: descartados,
      },
      pedidos: pedidos.map(p => ({
        codigo: p.codigo, status: p.status, entregueEm: p.entregueEm,
        coleta: { nome: p.comercio.nomeFantasia, lat: p.comercio.enderecos[0]?.lat ?? null, lng: p.comercio.enderecos[0]?.lng ?? null },
        entrega: { endereco: p.endereco, lat: p.latDestino, lng: p.lngDestino },
      })),
    });
  })
);

// ---------- Entregadores por período ----------
// Por dia: entregadores que concluíram entregas, novos cadastros e entregas.
router.get(
  "/entregadores-periodo",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query);
    const [entregues, novos, entregadores] = await Promise.all([
      prisma.pedido.findMany({
        where: { status: "ENTREGUE", entregadorId: { not: null }, entregueEm: { gte: desde, lte: ate } },
        select: { entregadorId: true, entregueEm: true },
      }),
      prisma.entregador.findMany({ where: { createdAt: { gte: desde, lte: ate } }, select: { createdAt: true } }),
      prisma.entregador.findMany({ select: { id: true, nomeCompleto: true, status: true, veiculoTipo: true, createdAt: true } }),
    ]);

    const dias = diasDoPeriodo(desde, ate).map(d => ({ data: d, ativos: new Set(), entregas: 0, novosCadastros: 0 }));
    const porData = Object.fromEntries(dias.map(d => [d.data, d]));
    entregues.forEach(p => { const d = porData[chaveDia(p.entregueEm)]; if (d) { d.ativos.add(p.entregadorId); d.entregas++; } });
    novos.forEach(e => { const d = porData[chaveDia(e.createdAt)]; if (d) d.novosCadastros++; });

    const porEntregador = {};
    entregues.forEach(p => {
      const r = porEntregador[p.entregadorId] ||= { dias: new Set(), entregas: 0, primeira: p.entregueEm, ultima: p.entregueEm };
      r.dias.add(chaveDia(p.entregueEm)); r.entregas++;
      if (p.entregueEm < r.primeira) r.primeira = p.entregueEm;
      if (p.entregueEm > r.ultima) r.ultima = p.entregueEm;
    });

    const serie = dias.map(d => ({ data: d.data, ativos: d.ativos.size, entregas: d.entregas, novosCadastros: d.novosCadastros }));
    res.json({
      desde, ate, serie,
      totais: {
        ativosNoPeriodo: Object.keys(porEntregador).length,
        mediaAtivosPorDia: media(serie.map(s => s.ativos)),
        picoAtivos: Math.max(0, ...serie.map(s => s.ativos)),
        novosCadastros: novos.length,
        entregas: entregues.length,
      },
      entregadores: entregadores.map(e => {
        const r = porEntregador[e.id];
        return {
          entregadorId: e.id, nome: e.nomeCompleto, status: e.status, veiculoTipo: e.veiculoTipo, cadastradoEm: e.createdAt,
          diasTrabalhados: r ? r.dias.size : 0, entregas: r ? r.entregas : 0,
          mediaEntregasPorDia: r ? Number((r.entregas / r.dias.size).toFixed(1)) : 0,
          primeira: r?.primeira || null, ultima: r?.ultima || null,
        };
      }).sort((a, b) => b.diasTrabalhados - a.diasTrabalhados || b.entregas - a.entregas),
    });
  })
);

// ---------- Diagnóstico de Entregadores ----------
// Pendências de cadastro, documentação, acesso e atividade de cada entregador.
router.get(
  "/diagnostico-entregadores",
  asyncHandler(async (req, res) => {
    const agora = Date.now();
    const trintaDias = new Date(agora - 30 * 86400000);
    const [entregadores, ultimas] = await Promise.all([
      prisma.entregador.findMany({ orderBy: { nomeCompleto: "asc" } }),
      prisma.pedido.groupBy({ by: ["entregadorId"], where: { status: "ENTREGUE", entregadorId: { not: null } }, _max: { entregueEm: true } }),
    ]);
    const ultimaEntrega = Object.fromEntries(ultimas.map(u => [u.entregadorId, u._max.entregueEm]));

    const linhas = entregadores.map(e => {
      const p = [];
      const add = (gravidade, codigo, texto) => p.push({ gravidade, codigo, texto });
      const motorizado = e.veiculoTipo === "MOTO" || e.veiculoTipo === "CARRO";
      const dias = d => Math.floor((agora - new Date(d).getTime()) / 86400000);

      if (e.bloqueado) add("critico", "BLOQUEADO", "Bloqueado — não consegue usar o app.");
      if (e.status === "EM_ANALISE" && dias(e.createdAt) >= 3) add("critico", "ANALISE_PARADA", `Aguardando aprovação há ${dias(e.createdAt)} dias.`);
      if (e.status === "ATIVO" && !e.senhaHash) add("critico", "SEM_ACESSO", "Ativo, mas sem senha de acesso ao app.");
      if (!e.email) add("critico", "SEM_EMAIL", "Sem e-mail (necessário para entrar no app).");
      if (motorizado && !e.cnhValida) add("critico", "CNH_INVALIDA", "CNH marcada como inválida para veículo motorizado.");
      if (!e.cpf) add("aviso", "SEM_CPF", "CPF não informado.");
      else if (!cpfValido(e.cpf)) add("aviso", "CPF_INVALIDO", "CPF informado é inválido.");
      if (!e.telefone) add("aviso", "SEM_TELEFONE", "Sem telefone de contato.");
      if (motorizado && !e.veiculoPlaca) add("aviso", "SEM_PLACA", "Placa do veículo não informada.");
      if (motorizado && !e.fotoCnhUrl) add("aviso", "SEM_FOTO_CNH", "Foto da CNH não enviada.");
      if (motorizado && !e.documentoVeiculoUrl) add("aviso", "SEM_DOC_VEICULO", "Documento do veículo não enviado.");
      if (!e.comprovanteResidenciaUrl) add("aviso", "SEM_COMPROVANTE", "Comprovante de residência não enviado.");
      if (e.taxaEntrega == null) add("aviso", "SEM_REPASSE", "Repasse por entrega não definido.");
      if (e.online && e.localizacaoEm && agora - new Date(e.localizacaoEm).getTime() > 10 * 60000) {
        add("aviso", "ONLINE_SEM_SINAL", `Online, mas sem enviar posição há ${Math.round((agora - new Date(e.localizacaoEm).getTime()) / 60000)} min.`);
      }
      if (e.status === "ATIVO" && !e.bloqueado) {
        const u = ultimaEntrega[e.id];
        if (!u) add("info", "NUNCA_ENTREGOU", "Ativo e ainda sem nenhuma entrega concluída.");
        else if (u < trintaDias) add("info", "INATIVO_30D", `Sem entregas há ${dias(u)} dias.`);
      }
      if (!e.localizacaoEm) add("info", "NUNCA_ONLINE", "Nunca enviou localização pelo app.");

      const ordem = { critico: 0, aviso: 1, info: 2 };
      p.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);
      return {
        entregadorId: e.id, nome: e.nomeCompleto, status: e.status, bloqueado: e.bloqueado, veiculoTipo: e.veiculoTipo,
        ultimaEntrega: ultimaEntrega[e.id] || null,
        problemas: p,
        gravidade: p[0]?.gravidade || "ok",
      };
    });

    const contar = g => linhas.filter(l => l.gravidade === g).length;
    const porCodigo = {};
    linhas.forEach(l => l.problemas.forEach(pr => { porCodigo[pr.codigo] = porCodigo[pr.codigo] || { codigo: pr.codigo, gravidade: pr.gravidade, quantidade: 0 }; porCodigo[pr.codigo].quantidade++; }));
    res.json({
      totais: { entregadores: linhas.length, critico: contar("critico"), aviso: contar("aviso"), info: contar("info"), ok: contar("ok") },
      porProblema: Object.values(porCodigo).sort((a, b) => b.quantidade - a.quantidade),
      linhas: linhas.sort((a, b) => ({ critico: 0, aviso: 1, info: 2, ok: 3 }[a.gravidade] - { critico: 0, aviso: 1, info: 2, ok: 3 }[b.gravidade]) || a.nome.localeCompare(b.nome)),
    });
  })
);

// ---------- Alteração de Status por Entregador ----------
// Linha do tempo de mudanças ligadas a cada entregador: as do próprio cadastro
// (aprovação, bloqueio, online/offline) e as dos pedidos em que ele esteve envolvido.
router.get(
  "/alteracoes-status",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query, 7);
    const filtroEntregador = req.query.entregadorId ? { entregadorId: req.query.entregadorId } : {};
    const tipo = req.query.tipo; // "pedido" | "entregador" | vazio
    const [doEntregador, dePedidos, entregadores] = await Promise.all([
      tipo === "pedido" ? [] : prisma.entregadorStatusHistorico.findMany({
        where: { createdAt: { gte: desde, lte: ate }, ...filtroEntregador }, orderBy: { createdAt: "desc" }, take: 2000,
      }),
      tipo === "entregador" ? [] : prisma.pedidoStatusHistorico.findMany({
        where: { createdAt: { gte: desde, lte: ate }, entregadorId: req.query.entregadorId || { not: null } },
        orderBy: { createdAt: "desc" }, take: 2000,
        include: { pedido: { select: { codigo: true } } },
      }),
      prisma.entregador.findMany({ select: { id: true, nomeCompleto: true } }),
    ]);
    const nome = Object.fromEntries(entregadores.map(e => [e.id, e.nomeCompleto]));

    const eventos = [
      ...doEntregador.map(ev => ({
        id: ev.id, data: ev.createdAt, entregadorId: ev.entregadorId, entregador: nome[ev.entregadorId] || "(removido)",
        categoria: ev.tipo, de: ev.de, para: ev.para, pedido: null, autorTipo: ev.autorTipo, autorNome: ev.autorNome,
      })),
      ...dePedidos.map(ev => ({
        id: ev.id, data: ev.createdAt, entregadorId: ev.entregadorId, entregador: nome[ev.entregadorId] || "(removido)",
        categoria: "PEDIDO", de: ev.de, para: ev.para, pedido: ev.pedido.codigo, autorTipo: ev.autorTipo, autorNome: ev.autorNome,
      })),
    ].sort((a, b) => b.data - a.data).slice(0, 2000);

    const resumo = {};
    eventos.forEach(ev => {
      const r = resumo[ev.entregadorId] ||= { entregadorId: ev.entregadorId, entregador: ev.entregador, total: 0, PEDIDO: 0, ONLINE: 0, STATUS: 0, BLOQUEIO: 0, CADASTRO: 0 };
      r.total++; r[ev.categoria] = (r[ev.categoria] || 0) + 1;
    });
    res.json({ desde, ate, eventos, resumo: Object.values(resumo).sort((a, b) => b.total - a.total) });
  })
);

// ---------- Histórico de Vagas ----------
// "Vaga" = cada período em que um pedido ficou disponível aos entregadores
// (status Pronto). Abre quando o pedido fica pronto ou volta para a fila
// (desistência/reprocura) e fecha quando alguém aceita ou o pedido é cancelado.
router.get(
  "/vagas",
  asyncHandler(async (req, res) => {
    const { desde, ate } = periodo(req.query, 7);
    const filtro = req.query.comercioId ? { comercioId: req.query.comercioId } : {};
    // Pedidos com alguma movimentação no período; o histórico inteiro de cada um para fechar as vagas.
    const ids = await prisma.pedidoStatusHistorico.findMany({
      where: { para: "PENDENTE", createdAt: { gte: desde, lte: ate }, pedido: filtro },
      select: { pedidoId: true }, distinct: ["pedidoId"],
    });
    const historicos = await prisma.pedidoStatusHistorico.findMany({
      where: { pedidoId: { in: ids.map(i => i.pedidoId) } },
      orderBy: { createdAt: "asc" },
      include: { pedido: { select: { codigo: true, comercio: { select: { nomeFantasia: true } } } } },
    });
    const entregadores = await prisma.entregador.findMany({ select: { id: true, nomeCompleto: true } });
    const nome = Object.fromEntries(entregadores.map(e => [e.id, e.nomeCompleto]));

    const porPedido = {};
    historicos.forEach(h => { (porPedido[h.pedidoId] ||= []).push(h); });

    const vagas = [];
    Object.values(porPedido).forEach(evs => {
      let aberta = null;
      evs.forEach(ev => {
        if (ev.para === "PENDENTE" && !aberta) {
          const motivo = ev.de === "PREPARANDO" || ev.de == null ? "PRONTO" : ev.autorTipo === "ENTREGADOR" ? "DESISTENCIA" : "REPROCURA";
          aberta = {
            pedidoId: ev.pedidoId, codigo: ev.pedido.codigo, comercio: ev.pedido.comercio.nomeFantasia,
            abertaEm: ev.createdAt, motivo, liberadaPor: motivo === "DESISTENCIA" ? nome[ev.entregadorId] || null : null,
          };
        } else if (aberta && (ehAceite(ev) || ev.para === "CANCELADO" || ev.para === "ENTREGUE")) {
          vagas.push({
            ...aberta,
            fechadaEm: ev.createdAt,
            resultado: ev.para === "CANCELADO" ? "CANCELADA" : "PREENCHIDA",
            preenchidaPor: ev.para !== "CANCELADO" ? nome[ev.entregadorId] || null : null,
            viaPainel: ehAceite(ev) && ev.autorTipo === "ADMIN",
            minutosEmAberto: Math.round(minutos(aberta.abertaEm, ev.createdAt)),
          });
          aberta = null;
        }
      });
      if (aberta) vagas.push({ ...aberta, fechadaEm: null, resultado: "ABERTA", preenchidaPor: null, viaPainel: false, minutosEmAberto: Math.round(minutos(aberta.abertaEm, new Date())) });
    });

    const noPeriodo = vagas.filter(v => v.abertaEm >= desde && v.abertaEm <= ate).sort((a, b) => b.abertaEm - a.abertaEm);
    const preenchidas = noPeriodo.filter(v => v.resultado === "PREENCHIDA");
    res.json({
      desde, ate,
      totais: {
        vagas: noPeriodo.length,
        preenchidas: preenchidas.length,
        canceladas: noPeriodo.filter(v => v.resultado === "CANCELADA").length,
        abertas: noPeriodo.filter(v => v.resultado === "ABERTA").length,
        reaberturas: noPeriodo.filter(v => v.motivo !== "PRONTO").length,
        atribuidasPeloPainel: preenchidas.filter(v => v.viaPainel).length,
        tempoMedioParaPreencherMin: media(preenchidas.map(v => v.minutosEmAberto)),
        p90ParaPreencherMin: percentil(preenchidas.map(v => v.minutosEmAberto), 90),
      },
      linhas: noPeriodo.slice(0, 1000),
    });
  })
);

module.exports = router;
