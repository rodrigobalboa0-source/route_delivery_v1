// Notificações push no celular do entregador (serviço de push da Expo -> Firebase no Android).
//   Nova corrida  -> canal "corridas" (toca o som de alarme), para os entregadores online que podem pegá-la.
//   Promoção e taxa dinâmica (ex.: chuva) -> canal "avisos", para todos os entregadores ativos com o app instalado.
const prisma = require("../lib/prisma");
const { distanciaLinhaRetaKm } = require("../utils/geo");

const URL_EXPO = process.env.EXPO_PUSH_URL || "https://exp.host/--/api/v2/push/send"; // variável só para testes locais
const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const tokenValido = t => /^Expo(nent)?PushToken\[.+\]$/.test(String(t || ""));

// Envia em lotes de 100 (limite da Expo). Tokens de celulares que desinstalaram o app são apagados.
async function enviar(mensagens) {
  const validas = mensagens.filter(m => tokenValido(m.to));
  for (let i = 0; i < validas.length; i += 100) {
    const lote = validas.slice(i, i + 100);
    const r = await fetch(URL_EXPO, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(lote),
      signal: AbortSignal.timeout(8000),
    });
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
      console.warn("[push] Expo respondeu", r.status, JSON.stringify(corpo)?.slice(0, 300));
      continue;
    }
    const mortos = (corpo?.data || [])
      .map((t, j) => (t.status === "error" && t.details?.error === "DeviceNotRegistered" ? lote[j].to : null))
      .filter(Boolean);
    if (mortos.length) await prisma.entregador.updateMany({ where: { pushToken: { in: mortos } }, data: { pushToken: null } });
    const outros = (corpo?.data || []).filter(t => t.status === "error" && t.details?.error !== "DeviceNotRegistered");
    if (outros.length) console.warn("[push] erros:", outros.map(t => t.details?.error || t.message).join(", "));
  }
  return validas.length;
}

const ativosComToken = extra => ({ status: "ATIVO", bloqueado: false, pushToken: { not: null }, ...extra });

// Pedido ficou pronto (PENDENTE, sem entregador): chama quem está online e pode pegá-lo
// (mesmas regras da lista "Disponíveis": permissão de coleta, recusa e raio máximo).
async function avisarNovaCorrida(pedidoId) {
  const pedido = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    include: {
      comercio: { select: { id: true, nomeFantasia: true, bloqueado: true, enderecos: { where: { principal: true } }, entregadoresBloqueados: { select: { entregadorId: true } } } },
      recusas: { select: { entregadorId: true } },
    },
  });
  if (!pedido || pedido.status !== "PENDENTE" || pedido.entregadorId || pedido.comercio?.bloqueado) return 0;

  const [entregadores, config] = await Promise.all([
    prisma.entregador.findMany({ where: ativosComToken({ online: true }), include: { comerciosPermitidos: { select: { comercioId: true } } } }),
    prisma.configuracao.findFirst({ select: { raioMaximoKm: true } }),
  ]);
  // Quem recusou esta corrida ou foi bloqueado pela loja não é chamado.
  const recusaram = new Set([...pedido.recusas, ...pedido.comercio.entregadoresBloqueados].map(r => r.entregadorId));
  const loja = pedido.comercio.enderecos[0];
  const raio = config?.raioMaximoKm;
  const alvo = entregadores.filter(e => {
    if (recusaram.has(e.id)) return false;
    if (e.permissaoColeta === "SOMENTE_SELECIONADOS" && !e.comerciosPermitidos.some(c => c.comercioId === pedido.comercioId)) return false;
    if (raio && e.lat != null && loja?.lat != null && distanciaLinhaRetaKm({ lat: e.lat, lng: e.lng }, { lat: loja.lat, lng: loja.lng }) > raio) return false;
    return true;
  });
  if (!alvo.length) return 0;

  const { ganhoParaApp } = require("./financeiro.service");
  const mensagens = [];
  for (const e of alvo) {
    const [p] = await ganhoParaApp([pedido], e).catch(() => [pedido]);
    const partes = [
      p.kmEntrega != null ? `${p.kmEstimado ? "≈ " : ""}${String(p.kmEntrega).replace(".", ",")} km da loja até o cliente` : null,
      p.ganhoEntregador != null ? `Você ganha ${brl(p.ganhoEntregador)}` : null,
      pedido.retorno ? "com retorno" : null,
    ].filter(Boolean);
    mensagens.push({
      to: e.pushToken,
      title: `🛵 Nova corrida — ${pedido.comercio.nomeFantasia}`,
      body: partes.join(" · ") || "Toque para ver e aceitar.",
      data: { tipo: "corrida", tela: "disponiveis", pedidoId: pedido.id },
      channelId: "corridas",
      sound: "corrida.wav",
      priority: "high",
      ttl: 300, // corrida velha não serve: descarta se o celular ficar 5 min sem conexão
    });
  }
  return enviar(mensagens);
}

// A loja (ou o ADM) passou a corrida direto para este entregador: toca o alarme e abre "Em andamento".
async function avisarAtribuicao(pedidoId, entregadorId) {
  const [pedido, e] = await Promise.all([
    prisma.pedido.findUnique({ where: { id: pedidoId }, include: { comercio: { select: { nomeFantasia: true } } } }),
    prisma.entregador.findUnique({ where: { id: entregadorId }, select: { pushToken: true } }),
  ]);
  if (!pedido || !e?.pushToken) return 0;
  return enviar([{
    to: e.pushToken,
    title: `🛵 Corrida passada para você — ${pedido.comercio.nomeFantasia}`,
    body: `${pedido.clienteNome} · ${pedido.endereco}`.slice(0, 180),
    data: { tipo: "atribuida", tela: "andamento", pedidoId },
    channelId: "corridas",
    sound: "corrida.wav",
    priority: "high",
  }]);
}

// Promoção ativada no painel (respeita os veículos escolhidos).
async function avisarPromocao(promocao) {
  const where = ativosComToken(promocao.veiculos?.length ? { veiculoTipo: { in: promocao.veiculos } } : {});
  const entregadores = await prisma.entregador.findMany({ where, select: { pushToken: true } });
  const agendada = promocao.inicio && new Date(promocao.inicio) > new Date();
  const quando = agendada ? ` Começa em ${new Date(promocao.inicio).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}.` : "";
  return enviar(entregadores.map(e => ({
    to: e.pushToken,
    title: `🎁 ${agendada ? "Promoção agendada" : "Nova promoção"}: ${promocao.titulo}`,
    body: [promocao.premio && `Prêmio: ${promocao.premio}.`, promocao.descricao, quando.trim()].filter(Boolean).join(" ").slice(0, 180) || "Toque para ver os detalhes.",
    data: { tipo: "promocao", tela: "promocao", promocaoId: promocao.id },
    channelId: "avisos",
    sound: "default",
    priority: "high",
  })));
}

// Taxa dinâmica ligada no painel (ex.: "Chuva"): regra do entregador (bônus) ou de demanda (valor da entrega).
async function avisarTaxaDinamica(regra, tipo) {
  const entregadores = await prisma.entregador.findMany({ where: ativosComToken(), select: { pushToken: true } });
  const chuva = /chuv/i.test(regra.nome);
  const extra = tipo === "entregador"
    ? (regra.tipoAplicacao === "MULTIPLICADOR" ? `Seus ganhos x${String(regra.valor).replace(".", ",")} por entrega.` : `+${brl(regra.valor)} por entrega.`)
    : "As entregas estão valendo mais agora.";
  return enviar(entregadores.map(e => ({
    to: e.pushToken,
    title: `${chuva ? "🌧️" : "⚡"} Taxa ${regra.nome} ativada`,
    body: `${extra} Fique online para aproveitar.`,
    data: { tipo: "taxa", tela: "home" },
    channelId: "avisos",
    sound: "default",
    priority: "high",
  })));
}

module.exports = { enviar, avisarNovaCorrida, avisarAtribuicao, avisarPromocao, avisarTaxaDinamica, tokenValido };
