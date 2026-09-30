// API do APP DO ENTREGADOR — montada em /api/app/entregador
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { enviarEmail, htmlSimples } = require("../../services/email.service");
const { semanaDe, configRanking, classificacao, nomeCurto } = require("../../services/ranking.service");
const prisma = require("../../lib/prisma");
const { asyncHandler } = require("../../middleware/errorHandler");
const { requireAuth, requireTipo, assinarToken, TIPOS } = require("../../middleware/auth");
const { semSenha } = require("../../utils/sanitizar");
const { distanciaLinhaRetaKm, buscarEnderecos } = require("../../utils/geo");
const { COM_ENTREGADOR, ETAPAS_ENTREGADOR, ROTULOS } = require("../../utils/statusPedido");
const { INCLUDE_PADRAO, erroHttp, registrarLog, aceitarPedido } = require("../../services/pedidos.service");
const { obterRegras } = require("../../services/saque.service");
const { comissaoDoPedido, entregasDoPeriodo } = require("../../services/financeiro.service");
const { versaoEntregador, liberarAgendados } = require("../../services/tempoReal.service");
const { vigentesPara, avisosPara, marcarVisto, publico: publicoPromocao } = require("../../services/promocoes.service");
const { carimbos, registrarStatusPedido, registrarStatusEntregador, registrarLocalizacao } = require("../../services/historico.service");

const autorEntregador = req => ({ autorTipo: "ENTREGADOR", autorNome: req.entregador.nomeCompleto });

const router = express.Router();

const INCLUDE_PEDIDO_APP = {
  ...INCLUDE_PADRAO,
  comercio: { select: { id: true, nomeFantasia: true, telefone: true, enderecos: { where: { principal: true } } } },
};

// Endereço do entregador vindo do app (busca no OpenStreetMap ou digitado).
const CAMPOS_ENDERECO = ["cep", "rua", "numero", "complemento", "bairro", "cidade"];
function dadosEndereco(body = {}) {
  const r = {};
  CAMPOS_ENDERECO.forEach(c => {
    if (body[c] !== undefined) r[c] = String(body[c] ?? "").trim().slice(0, 160) || null;
  });
  return r;
}

// Limite simples por IP para a busca pública de endereços (usada no cadastro, antes do login).
const buscasPorIp = new Map();
function limitarBusca(req, res, next) {
  const agora = Date.now();
  const ip = req.ip || "?";
  const r = buscasPorIp.get(ip) || { inicio: agora, n: 0 };
  if (agora - r.inicio > 60000) { r.inicio = agora; r.n = 0; }
  r.n++;
  buscasPorIp.set(ip, r);
  if (buscasPorIp.size > 5000) buscasPorIp.clear();
  if (r.n > 60) return res.status(429).json({ erro: "Muitas buscas seguidas. Aguarde um instante." });
  next();
}

// ---------- Público ----------

// GET /api/app/entregador/enderecos?q=..&lat=..&lng=.. — busca de endereços no OpenStreetMap
router.get(
  "/enderecos",
  limitarBusca,
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    const perto = Number.isFinite(lat) && Number.isFinite(lng) && req.query.lat !== undefined ? { lat, lng } : null;
    try {
      res.json(await buscarEnderecos(req.query.q, perto));
    } catch (err) {
      throw erroHttp(503, err.message);
    }
  })
);

// Um celular por conta: o app manda um identificador do aparelho (gerado na instalação).
const aparelhoValido = id => typeof id === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(id);
const MSG_OUTRO_APARELHO = "Sua conta já está conectada em outro celular. Saia do app no outro aparelho, use “Esqueci minha senha” para desconectá-lo ou peça à equipe para liberar.";

// POST /api/app/entregador/login  { email, senha, aparelhoId, aparelhoNome? }
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, senha, aparelhoId, aparelhoNome } = req.body;
    if (!email || !senha) return res.status(400).json({ erro: 'Informe "email" e "senha".' });
    if (!aparelhoValido(aparelhoId)) return res.status(426).json({ erro: "Atualize o app do entregador para a versão mais recente." });

    // E-mail sem diferenciar maiúsculas/minúsculas (o celular costuma colocar a 1ª letra maiúscula).
    const entregador = await prisma.entregador.findFirst({ where: { email: { equals: String(email).trim(), mode: "insensitive" } } });
    if (!entregador?.senhaHash || !(await bcrypt.compare(senha, entregador.senhaHash))) {
      return res.status(401).json({ erro: "Credenciais inválidas." });
    }
    if (entregador.bloqueado) return res.status(403).json({ erro: "Seu acesso está bloqueado. Fale com o suporte." });
    if (entregador.status === "INATIVO") return res.status(403).json({ erro: "Seu cadastro está inativo. Fale com o suporte." });

    // Outro celular já logado: não deixa entrar (evita conta compartilhada).
    // Só vale se a troca for feita de propósito: sair no outro aparelho, redefinir a senha ou liberar pelo ADM.
    if (entregador.aparelhoId && entregador.aparelhoId !== aparelhoId) {
      return res.status(409).json({ erro: MSG_OUTRO_APARELHO, codigo: "OUTRO_APARELHO" });
    }
    const atualizado = await prisma.entregador.update({
      where: { id: entregador.id },
      data: { aparelhoId, aparelhoNome: String(aparelhoNome || "").slice(0, 80) || null, aparelhoEm: new Date() },
    });

    const token = assinarToken({ tipo: TIPOS.ENTREGADOR, id: entregador.id, nome: entregador.nomeCompleto, ap: aparelhoId }, "30d");
    res.json({ token, entregador: semSenha(atualizado) });
  })
);

// ---------- Esqueci minha senha (código de 6 dígitos por e-mail) ----------

const MSG_CODIGO = { ok: true, mensagem: "Se esse e-mail estiver cadastrado, enviamos um código de 6 dígitos. Confira também o spam." };

// POST /api/app/entregador/esqueci-senha { email }
router.post(
  "/esqueci-senha",
  limitarBusca,
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "").trim();
    if (!email) throw erroHttp(400, "Informe o e-mail cadastrado.");
    const e = await prisma.entregador.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    if (!e?.email) return res.json(MSG_CODIGO); // não revela se o e-mail existe
    // No máximo 1 código por minuto por conta.
    const recente = await prisma.entregadorCodigoSenha.findFirst({ where: { entregadorId: e.id, createdAt: { gt: new Date(Date.now() - 60000) } } });
    if (recente) throw erroHttp(429, "Aguarde 1 minuto para pedir um novo código.");
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    await prisma.entregadorCodigoSenha.updateMany({ where: { entregadorId: e.id, usado: false }, data: { usado: true } });
    await prisma.entregadorCodigoSenha.create({ data: { entregadorId: e.id, codigoHash: await bcrypt.hash(codigo, 8), expiraEm: new Date(Date.now() + 15 * 60000) } });
    try {
      await enviarEmail({
        para: e.email,
        assunto: `${codigo} é o seu código — Route Delivery`,
        texto: `Olá, ${e.nomeCompleto.split(" ")[0]}. Seu código para criar uma nova senha no app é ${codigo}. Ele vale por 15 minutos.`,
        html: htmlSimples({ titulo: "Nova senha do app", paragrafos: [`Olá, ${e.nomeCompleto.split(" ")[0]}.`, "Use o código abaixo no app para criar uma nova senha. Ele vale por 15 minutos."], destaque: codigo }),
      });
    } catch (err) {
      console.error("[esqueci-senha app] e-mail não enviado:", err.message);
      if (process.env.NODE_ENV === "production") throw erroHttp(503, "Não foi possível enviar o e-mail agora. Fale com a equipe.");
    }
    res.json({ ...MSG_CODIGO, ...(process.env.NODE_ENV !== "production" ? { devCodigo: codigo } : {}) });
  })
);

// POST /api/app/entregador/redefinir-senha { email, codigo, novaSenha }
// Também desconecta o celular que estava logado (quem tem acesso ao e-mail pode entrar num aparelho novo).
router.post(
  "/redefinir-senha",
  limitarBusca,
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || "").trim();
    const codigo = String(req.body?.codigo || "").replace(/\D/g, "");
    const novaSenha = String(req.body?.novaSenha || "");
    if (!email || codigo.length !== 6) throw erroHttp(400, "Informe o e-mail e o código de 6 dígitos.");
    if (novaSenha.length < 6) throw erroHttp(400, "A nova senha precisa ter pelo menos 6 caracteres.");
    const e = await prisma.entregador.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
    const registro = e && await prisma.entregadorCodigoSenha.findFirst({ where: { entregadorId: e.id, usado: false }, orderBy: { createdAt: "desc" } });
    if (!registro || registro.expiraEm < new Date() || registro.tentativas >= 5) throw erroHttp(400, "Código inválido ou vencido. Peça um novo código.");
    if (!(await bcrypt.compare(codigo, registro.codigoHash))) {
      await prisma.entregadorCodigoSenha.update({ where: { id: registro.id }, data: { tentativas: { increment: 1 } } });
      throw erroHttp(400, `Código incorreto. ${Math.max(0, 4 - registro.tentativas)} tentativa(s) restante(s).`);
    }
    await prisma.$transaction([
      prisma.entregadorCodigoSenha.update({ where: { id: registro.id }, data: { usado: true } }),
      prisma.entregador.update({ where: { id: e.id }, data: { senhaHash: await bcrypt.hash(novaSenha, 10), aparelhoId: null, aparelhoNome: null, online: false } }),
    ]);
    res.json({ ok: true, mensagem: "Senha alterada! Entre com a nova senha." });
  })
);

// POST /api/app/entregador/cadastro — auto-cadastro pelo app; entra como EM_ANALISE até o ADM aprovar
router.post(
  "/cadastro",
  asyncHandler(async (req, res) => {
    const { nomeCompleto, email, senha, telefone, cpf, veiculoTipo, veiculoModelo, veiculoPlaca } = req.body;
    if (!nomeCompleto || !email || !senha) {
      return res.status(400).json({ erro: 'Informe "nomeCompleto", "email" e "senha".' });
    }
    if (String(senha).length < 6) return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres." });

    const entregador = await prisma.entregador.create({
      data: {
        nomeCompleto, email, telefone, cpf, veiculoModelo, veiculoPlaca,
        ...dadosEndereco(req.body),
        veiculoTipo: ["MOTO", "BIKE", "CARRO"].includes(veiculoTipo) ? veiculoTipo : "MOTO",
        tipoEntrega: "PROPRIO",
        status: "EM_ANALISE",
        senhaHash: await bcrypt.hash(senha, 10),
      },
    });
    await registrarStatusEntregador({
      entregadorId: entregador.id, tipo: "CADASTRO", para: "EM_ANALISE",
      autor: { autorTipo: "ENTREGADOR", autorNome: nomeCompleto },
    });
    await prisma.notificacao.create({
      data: { tipo: "cadastro", texto: `Novo entregador aguardando aprovação: ${nomeCompleto}.` },
    });
    res.status(201).json({ ok: true, mensagem: "Cadastro enviado. Aguarde a aprovação da equipe.", entregador: semSenha(entregador) });
  })
);

// ---------- Autenticado ----------

router.use(requireAuth, requireTipo(TIPOS.ENTREGADOR));

// Recarrega o entregador a cada requisição: bloqueio/inativação pelo ADM vale na hora.
router.use(
  asyncHandler(async (req, res, next) => {
    const entregador = await prisma.entregador.findUnique({ where: { id: req.conta.id } });
    if (!entregador) return res.status(401).json({ erro: "Conta não encontrada." });
    if (entregador.bloqueado) return res.status(403).json({ erro: "Seu acesso está bloqueado. Fale com o suporte." });
    if (entregador.status === "INATIVO") return res.status(403).json({ erro: "Seu cadastro está inativo." });
    // Sessão de outro aparelho (ou liberada pelo ADM / senha redefinida): pede login de novo.
    if (!req.conta.ap || entregador.aparelhoId !== req.conta.ap) {
      return res.status(401).json({ erro: "Sua conta foi desconectada deste celular. Entre de novo.", codigo: "SESSAO_ENCERRADA" });
    }
    req.entregador = entregador;
    next();
  })
);

function exigirAtivo(req) {
  if (req.entregador.status !== "ATIVO") throw erroHttp(403, "Seu cadastro ainda está em análise.");
}

async function pedidoDoEntregador(req) {
  const pedido = await prisma.pedido.findUnique({ where: { id: req.params.id } });
  if (!pedido || pedido.entregadorId !== req.entregador.id) throw erroHttp(404, "Pedido não encontrado.");
  return pedido;
}

// GET /api/app/entregador/me (inclui o raio de confirmação de local, para o app mostrar quanto falta)
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const cfg = await prisma.configuracao.findFirst({ select: { raioConfirmacaoMetros: true } });
    res.json({ ...semSenha(req.entregador), raioConfirmacaoMetros: cfg?.raioConfirmacaoMetros ?? 200 });
  })
);

// POST /api/app/entregador/sair — fica offline e libera o celular (outro aparelho poderá entrar)
router.post(
  "/sair",
  asyncHandler(async (req, res) => {
    const e = req.entregador;
    await prisma.entregador.update({ where: { id: e.id }, data: { online: false, aparelhoId: null, aparelhoNome: null } });
    if (e.online) {
      await registrarStatusEntregador({ entregadorId: e.id, tipo: "ONLINE", de: "ONLINE", para: "OFFLINE", autor: autorEntregador(req) }).catch(() => {});
    }
    res.json({ ok: true });
  })
);

// GET /api/app/entregador/ranking — ranking da semana (segunda a domingo), prêmios e a semana passada
router.get(
  "/ranking",
  asyncHandler(async (req, res) => {
    const cfg = await configRanking();
    const semana = semanaDe();
    const lista = await classificacao(semana, cfg);
    const eu = lista.find(x => x.entregadorId === req.entregador.id);
    const minhasEntregas = eu?.entregas ?? await prisma.pedido.count({
      where: { entregadorId: req.entregador.id, status: "ENTREGUE", entregueEm: { gte: semana.inicio, lt: semana.fim } },
    });
    const anterior = await prisma.rankingSemana.findFirst({ orderBy: { inicio: "desc" } });
    const minhaAnterior = anterior && (anterior.resultado || []).find(x => x.entregadorId === req.entregador.id);
    const publico = x => ({ posicao: x.posicao, nome: nomeCurto(x.nome), fotoUrl: x.fotoUrl || null, entregas: x.entregas, premio: x.premio, eu: x.entregadorId === req.entregador.id });
    res.json({
      ativo: cfg.ativo,
      inicio: semana.inicio,
      fim: new Date(semana.fim.getTime() - 1000),
      premios: cfg.premios,
      minimo: cfg.minimo,
      top10: lista.slice(0, 10).map(publico),
      eu: { posicao: eu?.posicao ?? null, entregas: minhasEntregas, premio: eu?.premio ?? 0, faltamParaTop10: eu && eu.posicao <= 10 ? 0 : Math.max(1, (lista[9]?.entregas ?? cfg.minimo) - minhasEntregas + (lista[9] ? 1 : 0)) },
      anterior: anterior ? {
        inicio: anterior.inicio, fim: new Date(anterior.fim.getTime() - 1000),
        top3: (anterior.resultado || []).slice(0, 3).map(publico),
        minha: minhaAnterior ? { posicao: minhaAnterior.posicao, entregas: minhaAnterior.entregas, premio: minhaAnterior.premio } : null,
      } : null,
    });
  })
);

// GET /api/app/entregador/tempo-real — "algo mudou?" (o app consulta a cada ~2 s com a tela aberta)
router.get(
  "/tempo-real",
  asyncHandler(async (req, res) => {
    res.set("Cache-Control", "no-store").json(await versaoEntregador(req.entregador.id));
  })
);

// POST /api/app/entregador/ping — "sinal de vida" enquanto online (o app manda a cada 30 s).
// Sem sinal por 2 min, o sistema deixa o entregador offline sozinho.
router.post(
  "/ping",
  asyncHandler(async (req, res) => {
    if (!req.entregador.online) return res.json({ online: false });
    await prisma.entregador.update({ where: { id: req.entregador.id }, data: { localizacaoEm: new Date() } });
    res.json({ online: true });
  })
);

// PATCH /api/app/entregador/status  { online, lat?, lng? }
router.patch(
  "/status",
  asyncHandler(async (req, res) => {
    const online = !!req.body.online;
    if (online) exigirAtivo(req);
    const data = { online };
    if (req.body.lat != null && req.body.lng != null) {
      Object.assign(data, { lat: Number(req.body.lat), lng: Number(req.body.lng), localizacaoEm: new Date() });
    }
    const entregador = await prisma.entregador.update({ where: { id: req.entregador.id }, data });
    await registrarStatusEntregador({
      entregadorId: entregador.id, tipo: "ONLINE", de: req.entregador.online ? "ONLINE" : "OFFLINE",
      para: online ? "ONLINE" : "OFFLINE", autor: autorEntregador(req),
    });
    if (data.lat != null) await registrarLocalizacao(entregador.id, data.lat, data.lng);
    res.json(semSenha(entregador));
  })
);

// POST /api/app/entregador/localizacao  { lat, lng } — enviado periodicamente pelo app
router.post(
  "/localizacao",
  asyncHandler(async (req, res) => {
    const { lat, lng } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ erro: 'Informe "lat" e "lng".' });
    await prisma.entregador.update({
      where: { id: req.entregador.id },
      data: { lat: Number(lat), lng: Number(lng), localizacaoEm: new Date() },
    });
    await registrarLocalizacao(req.entregador.id, Number(lat), Number(lng));
    res.json({ ok: true });
  })
);

// GET /api/app/entregador/pedidos/disponiveis
// Pedidos prontos (PENDENTE) sem entregador, respeitando a permissão de coleta
// do entregador e o raio máximo configurado no painel.
router.get(
  "/pedidos/disponiveis",
  asyncHandler(async (req, res) => {
    exigirAtivo(req);
    if (!req.entregador.online) return res.json([]);
    await liberarAgendados().catch(() => {}); // agendados cuja hora chegou entram na lista agora

    // Recusadas por este entregador não voltam para ele (continuam para os outros).
    const where = { status: "PENDENTE", entregadorId: null, comercio: { bloqueado: false }, recusas: { none: { entregadorId: req.entregador.id } } };
    if (req.entregador.permissaoColeta === "SOMENTE_SELECIONADOS") {
      const permitidos = await prisma.entregadorComercioPermitido.findMany({
        where: { entregadorId: req.entregador.id }, select: { comercioId: true },
      });
      where.comercioId = { in: permitidos.map(p => p.comercioId) };
    }

    const [pedidos, config] = await Promise.all([
      prisma.pedido.findMany({ where, include: INCLUDE_PEDIDO_APP, orderBy: { updatedAt: "asc" }, take: 50 }),
      prisma.configuracao.findFirst(),
    ]);

    const { lat, lng } = req.entregador;
    const raio = config?.raioMaximoKm;
    const comDistancia = pedidos.map(p => {
      const origem = p.comercio.enderecos[0];
      const distanciaAteColetaKm = lat != null && origem?.lat != null
        ? Number(distanciaLinhaRetaKm({ lat, lng }, { lat: origem.lat, lng: origem.lng }).toFixed(2))
        : null;
      return { ...p, distanciaAteColetaKm };
    });

    res.json(
      comDistancia
        .filter(p => !raio || p.distanciaAteColetaKm == null || p.distanciaAteColetaKm <= raio)
        .sort((a, b) => (a.distanciaAteColetaKm ?? Infinity) - (b.distanciaAteColetaKm ?? Infinity))
    );
  })
);

// GET /api/app/entregador/pedidos?status=EM_ROTA — meus pedidos (status=ATIVOS: todos em andamento)
router.get(
  "/pedidos",
  asyncHandler(async (req, res) => {
    const where = { entregadorId: req.entregador.id };
    if (req.query.status === "ATIVOS") where.status = { in: COM_ENTREGADOR };
    else if (req.query.status) where.status = req.query.status;
    const pedidos = await prisma.pedido.findMany({
      where, include: INCLUDE_PEDIDO_APP, orderBy: { updatedAt: "desc" }, take: 100,
    });
    res.json(pedidos);
  })
);

// GET /api/app/entregador/pedidos/:id
router.get(
  "/pedidos/:id",
  asyncHandler(async (req, res) => {
    await pedidoDoEntregador(req);
    res.json(await prisma.pedido.findUnique({
      where: { id: req.params.id },
      include: { ...INCLUDE_PEDIDO_APP, logs: { orderBy: { createdAt: "asc" } } },
    }));
  })
);

// PATCH /api/app/entregador/pedidos/:id/aceitar
router.patch(
  "/pedidos/:id/aceitar",
  asyncHandler(async (req, res) => {
    exigirAtivo(req);
    if (!req.entregador.online) throw erroHttp(403, "Fique online para aceitar corridas.");
    res.json(await aceitarPedido(req.params.id, req.entregador.id));
  })
);

// POST /api/app/entregador/pedidos/:id/recusar — some da lista deste entregador; segue para os outros
router.post(
  "/pedidos/:id/recusar",
  asyncHandler(async (req, res) => {
    exigirAtivo(req);
    const pedido = await prisma.pedido.findUnique({ where: { id: req.params.id }, select: { id: true, status: true, entregadorId: true } });
    if (!pedido) throw erroHttp(404, "Pedido não encontrado.");
    if (pedido.status !== "PENDENTE" || pedido.entregadorId) return res.json({ ok: true }); // já saiu da fila
    const nova = await prisma.pedidoRecusa.upsert({
      where: { pedidoId_entregadorId: { pedidoId: pedido.id, entregadorId: req.entregador.id } },
      create: { pedidoId: pedido.id, entregadorId: req.entregador.id },
      update: {},
    });
    if (Date.now() - new Date(nova.createdAt).getTime() < 5000) {
      await registrarLog(pedido.id, `${req.entregador.nomeCompleto} recusou a corrida.`);
    }
    res.json({ ok: true });
  })
);

// PATCH /api/app/entregador/endereco { cep, rua, numero, complemento, bairro, cidade } — o entregador atualiza o próprio endereço
router.patch(
  "/endereco",
  asyncHandler(async (req, res) => {
    const dados = dadosEndereco(req.body);
    if (!dados.rua) throw erroHttp(400, "Informe pelo menos a rua.");
    res.json(semSenha(await prisma.entregador.update({ where: { id: req.entregador.id }, data: dados })));
  })
);

// PATCH /api/app/entregador/pedidos/:id/etapa  { status: NA_LOJA | EM_ROTA | NO_CLIENTE }
// O entregador avança a entrega: Na loja -> Em rota -> Cheguei no cliente (só para frente).
router.patch(
  "/pedidos/:id/etapa",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoEntregador(req);
    const para = req.body?.status;
    const ordem = ETAPAS_ENTREGADOR.indexOf(para);
    if (ordem < 1) throw erroHttp(400, "Etapa inválida. Use NA_LOJA, EM_ROTA ou NO_CLIENTE.");
    if (!COM_ENTREGADOR.includes(pedido.status)) throw erroHttp(409, "Este pedido não está em andamento com você.");
    if (pedido.status !== "ATRASADO" && ETAPAS_ENTREGADOR.indexOf(pedido.status) >= ordem) throw erroHttp(409, "Essa etapa já foi informada.");
    await conferirLocal(req, pedido, para === "NO_CLIENTE" ? "cliente" : "loja");
    const { count } = await prisma.pedido.updateMany({
      where: { id: pedido.id, status: pedido.status, entregadorId: req.entregador.id },
      data: { status: para, ...carimbos(pedido, para) },
    });
    if (count === 0) throw erroHttp(409, "O pedido mudou enquanto isso. Atualize a tela.");
    await registrarStatusPedido({ pedidoId: pedido.id, de: pedido.status, para, entregadorId: req.entregador.id, autor: autorEntregador(req) });
    await registrarLog(pedido.id, `${req.entregador.nomeCompleto}: ${ROTULOS[para]}.`);
    res.json(await prisma.pedido.findUnique({ where: { id: pedido.id }, include: INCLUDE_PEDIDO_APP }));
  })
);

// PATCH /api/app/entregador/pedidos/:id/finalizar
router.patch(
  "/pedidos/:id/finalizar",
  asyncHandler(async (req, res) => {
    const pedido = await pedidoDoEntregador(req);
    if (!COM_ENTREGADOR.includes(pedido.status)) throw erroHttp(409, "Este pedido não está em andamento com você.");
    await conferirLocal(req, pedido, "cliente");
    // iFood com código de entrega: o cliente informa o código e o iFood confere antes de concluir.
    const ifoodSvc = require("../../services/ifood.service");
    const atual = pedido.integracaoSlug === "ifood" ? await ifoodSvc.atualizarAntesDeFinalizar(pedido) : pedido;
    if (atual.integracaoSlug === "ifood" && atual.exigeCodigoEntrega) {
      await ifoodSvc.validarCodigoEntrega(atual, req.body?.codigoEntrega);
      await registrarLog(pedido.id, "Código de entrega do iFood confirmado.");
    }
    const atualizado = await prisma.pedido.update({
      where: { id: pedido.id }, data: { status: "ENTREGUE", ...carimbos(pedido, "ENTREGUE") }, include: INCLUDE_PEDIDO_APP,
    });
    await registrarStatusPedido({ pedidoId: pedido.id, de: pedido.status, para: "ENTREGUE", entregadorId: req.entregador.id, autor: autorEntregador(req) });
    await registrarLog(pedido.id, `Entrega concluída por ${req.entregador.nomeCompleto}.`);
    res.json(atualizado);
  })
);

// PATCH /api/app/entregador/pedidos/:id/desistir — DESATIVADO: depois de aceitar, o entregador não desiste pelo app.
// Se precisar, a equipe troca o entregador pelo painel (Operação › pedido › Trocar entregador / Buscar outro).
router.patch(
  "/pedidos/:id/desistir",
  asyncHandler(async () => {
    throw erroHttp(403, "Depois de aceitar, não é possível desistir pelo app. Fale com a equipe pelo Suporte.");
  })
);

// ---------- Confirmação de local (Na loja / Saí para entrega na loja; Cheguei no cliente / Finalizar no cliente) ----------

// O app manda { lat, lng, precisao } lidos do GPS na hora do toque. Longe do local, a etapa é recusada.
async function conferirLocal(req, pedido, alvo) {
  const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || req.body?.lat == null) {
    throw erroHttp(422, "Não foi possível ler sua localização. Ative o GPS (localização) do celular e tente de novo.");
  }
  const cfg = await prisma.configuracao.findFirst({ select: { raioConfirmacaoMetros: true } });
  const raio = cfg?.raioConfirmacaoMetros ?? 200;
  let ponto = null, nome;
  if (alvo === "loja") {
    const loja = await prisma.comercioEndereco.findFirst({ where: { comercioId: pedido.comercioId, principal: true }, select: { lat: true, lng: true } });
    ponto = loja?.lat != null ? { lat: loja.lat, lng: loja.lng } : null;
    nome = "da loja";
  } else {
    ponto = pedido.latDestino != null ? { lat: pedido.latDestino, lng: pedido.lngDestino } : null;
    nome = "do cliente";
  }
  // Guarda a posição informada (aparece no mapa do painel e da loja).
  await prisma.entregador.update({ where: { id: req.entregador.id }, data: { lat, lng, localizacaoEm: new Date() } }).catch(() => {});
  if (!ponto) {
    await registrarLog(pedido.id, `Local ${nome} sem posição no mapa — etapa confirmada sem conferir a distância.`);
    return;
  }
  const folga = Math.min(Math.max(Number(req.body?.precisao) || 0, 0), 100); // imprecisão do GPS (até 100 m)
  const metros = Math.round(distanciaLinhaRetaKm({ lat, lng }, ponto) * 1000);
  if (metros > raio + folga) {
    const dist = metros >= 1000 ? `${(metros / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : `${metros} m`;
    const e = erroHttp(422, `Você está a ${dist} ${nome}. Chegue ao local para confirmar (até ${raio} m).`);
    e.extra = { codigo: "LONGE_DO_LOCAL", distanciaMetros: metros, raioMetros: raio };
    throw e;
  }
}

// ---------- Promoções ----------

// GET /api/app/entregador/promocoes — promoções valendo agora para este entregador (lista/aba do app)
router.get(
  "/promocoes",
  asyncHandler(async (req, res) => {
    res.json((await vigentesPara(req.entregador)).map(publicoPromocao));
  })
);

// GET /api/app/entregador/promocoes/avisos — pop-ups pendentes (promoção ativada, desativada ou encerrada).
// O app consulta ao abrir e periodicamente; depois de mostrar, confirma com POST .../visto.
router.get(
  "/promocoes/avisos",
  asyncHandler(async (req, res) => {
    const avisos = await avisosPara(req.entregador);
    res.json(avisos.map(a => ({
      ...a,
      titulo: a.tipo === "ATIVADA" ? "Nova promoção!" : "Promoção encerrada",
      mensagem: a.tipo === "ATIVADA"
        ? `${a.promocao.titulo}${a.promocao.premio ? ` — ${a.promocao.premio}` : ""}`
        : `A promoção "${a.promocao.titulo}" não está mais valendo.`,
    })));
  })
);

// POST /api/app/entregador/promocoes/avisos/:avisoId/visto — o pop-up não aparece de novo
router.post(
  "/promocoes/avisos/:avisoId/visto",
  asyncHandler(async (req, res) => {
    if (!/^(fim:)?[a-z0-9]+$/i.test(req.params.avisoId)) return res.status(400).json({ erro: "Aviso inválido." });
    await marcarVisto(req.entregador.id, req.params.avisoId);
    res.json({ ok: true });
  })
);

// ---------- Comissões lançadas pelo ADM (Financeiro › Comissão) ----------

// Manual: paga pela conta a pagar. Automática (por entrega): paga no acerto do entregador.
const INCLUDE_COMISSAO_APP = {
  contaPagar: { select: { paga: true, pagaEm: true, vencimento: true } },
  acerto: { select: { pago: true, pagoEm: true } },
  pedido: { select: { codigo: true } },
};

function comissaoParaApp(c) {
  const paga = !!(c.contaPagar?.paga || c.acerto?.pago);
  return {
    id: c.id, numero: c.numero, origem: c.origem, pedidoCodigo: c.pedido?.codigo || null, comercio: c.comercioNome, quantidadeEntregas: c.quantidadeEntregas,
    valorPorEntrega: c.valorPorEntrega, valor: c.valor, referencia: c.referencia, descricao: c.descricao,
    situacao: paga ? "PAGA" : "A_RECEBER", pagaEm: c.contaPagar?.pagaEm || c.acerto?.pagoEm || null, previsaoPagamento: c.contaPagar?.vencimento || null,
  };
}

// GET /api/app/entregador/comissoes — últimos 90 dias, com total do mês e a receber
router.get(
  "/comissoes",
  asyncHandler(async (req, res) => {
    const desde = new Date(); desde.setHours(0, 0, 0, 0); desde.setDate(desde.getDate() - 89);
    const inicioMes = new Date(); inicioMes.setHours(0, 0, 0, 0); inicioMes.setDate(1);
    const itens = await prisma.comissaoManual.findMany({
      where: { entregadorId: req.entregador.id, referencia: { gte: desde } },
      orderBy: [{ referencia: "desc" }, { numero: "desc" }],
      include: INCLUDE_COMISSAO_APP,
    });
    const soma = lista => Number(lista.reduce((s, c) => s + c.valor, 0).toFixed(2));
    res.json({
      comissoes: itens.map(comissaoParaApp),
      totais: { mes: soma(itens.filter(c => c.referencia >= inicioMes)), aReceber: soma(itens.filter(c => !(c.contaPagar?.paga || c.acerto?.pago))) },
    });
  })
);

// GET /api/app/entregador/comissoes/avisos — comissões ainda não vistas: o app mostra um pop-up para cada uma
router.get(
  "/comissoes/avisos",
  asyncHandler(async (req, res) => {
    const novas = await prisma.comissaoManual.findMany({
      where: { entregadorId: req.entregador.id, vistoEm: null }, orderBy: { createdAt: "asc" }, take: 20,
      include: INCLUDE_COMISSAO_APP,
    });
    const brl = v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    res.json(novas.map(c => ({
      avisoId: c.id, tipo: "COMISSAO", titulo: "Nova comissão!",
      mensagem: c.origem === "AUTOMATICA"
        ? `Você ganhou ${brl(c.valor)} de comissão pela entrega${c.pedido ? ` ${c.pedido.codigo}` : ""} de ${c.comercioNome}.`
        : `Você recebeu ${brl(c.valor)} de comissão por ${c.quantidadeEntregas} entrega${c.quantidadeEntregas > 1 ? "s" : ""} de ${c.comercioNome}.`,
      comissao: comissaoParaApp(c),
    })));
  })
);

// POST /api/app/entregador/comissoes/avisos/:id/visto — o pop-up não aparece de novo
router.post(
  "/comissoes/avisos/:id/visto",
  asyncHandler(async (req, res) => {
    await prisma.comissaoManual.updateMany({ where: { id: req.params.id, entregadorId: req.entregador.id, vistoEm: null }, data: { vistoEm: new Date() } });
    res.json({ ok: true });
  })
);

// GET /api/app/entregador/saque/regras — regras vigentes para o app exibir ao entregador
router.get(
  "/saque/regras",
  asyncHandler(async (req, res) => {
    const regras = await obterRegras();
    const publico = r => ({
      limitePorSolicitacao: r.limitePorSolicitacao,
      maxSolicitacoesDia: r.maxSolicitacoesDia,
      diasPermitidos: r.diasPermitidos,
      datasEspecificas: r.datasEspecificas,
    });
    res.json({ normal: publico(regras.NORMAL), rapido: publico(regras.RAPIDO) });
  })
);

// GET /api/app/entregador/ganhos — entregas concluídas hoje / 7 dias / mês.
// `ganho` = comissão de cada entrega (mesma regra do Financeiro: tabela por faixas/percentual ou repasse fixo)
//         + comissões lançadas/automáticas. É o valor do cartão "GANHOS" do app.
router.get(
  "/ganhos",
  asyncHandler(async (req, res) => {
    const agora = new Date();
    const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
    const semana = new Date(hoje); semana.setDate(semana.getDate() - 6);
    const mes = new Date(hoje); mes.setDate(1);
    const inicio = semana < mes ? semana : mes;

    const [entregas, comissoes] = await Promise.all([
      entregasDoPeriodo({ desde: inicio, ate: agora, entregadorId: req.entregador.id }),
      prisma.comissaoManual.findMany({ where: { entregadorId: req.entregador.id, referencia: { gte: inicio } }, select: { valor: true, referencia: true } }),
    ]);
    const comComissao = entregas.map(p => ({ p, valor: comissaoDoPedido(p).valor }));
    const r2 = v => Number((v || 0).toFixed(2));

    const somar = desde => {
      const minhas = comComissao.filter(x => x.p.entregueEm >= desde);
      const com = comissoes.filter(c => c.referencia >= desde).reduce((s, c) => s + c.valor, 0);
      const porEntrega = minhas.reduce((s, x) => s + x.valor, 0);
      return {
        entregas: minhas.length,
        valorEntregas: r2(minhas.reduce((s, x) => s + (x.p.valor || 0), 0)),
        distanciaKm: Number(minhas.reduce((s, x) => s + (x.p.distanciaKm || 0), 0).toFixed(1)),
        porEntregas: r2(porEntrega),
        comissoes: r2(com),
        ganho: r2(porEntrega + com),
        repasseEstimado: req.entregador.taxaEntrega != null ? r2(req.entregador.taxaEntrega * minhas.length) : null,
      };
    };

    res.json({ hoje: somar(hoje), ultimos7Dias: somar(semana), mes: somar(mes) });
  })
);

// ---------- Mensagens com a equipe (aparecem no painel em Mensagens) ----------

async function conversaDo(entregador) {
  const existente = await prisma.conversa.findUnique({ where: { entregadorId: entregador.id } });
  if (existente) return existente;
  return prisma.conversa.create({ data: { nome: entregador.nomeCompleto, tipo: "ENTREGADOR", entregadorId: entregador.id } });
}

// GET /api/app/entregador/mensagens — histórico (de: ELES = entregador, NOS = equipe)
router.get(
  "/mensagens",
  asyncHandler(async (req, res) => {
    const c = await conversaDo(req.entregador);
    const mensagens = await prisma.mensagem.findMany({ where: { conversaId: c.id }, orderBy: { createdAt: "asc" }, take: 200 });
    res.json(mensagens.map(m => ({ id: m.id, texto: m.texto, minha: m.de === "ELES", createdAt: m.createdAt })));
  })
);

// POST /api/app/entregador/mensagens { texto }
router.post(
  "/mensagens",
  asyncHandler(async (req, res) => {
    const texto = String(req.body?.texto || "").trim();
    if (!texto) throw erroHttp(400, "Escreva a mensagem.");
    if (texto.length > 2000) throw erroHttp(400, "Mensagem muito longa.");
    const c = await conversaDo(req.entregador);
    const m = await prisma.mensagem.create({ data: { conversaId: c.id, de: "ELES", texto } });
    await prisma.conversa.update({ where: { id: c.id }, data: { naoLida: true, nome: req.entregador.nomeCompleto } });
    await prisma.notificacao.create({ data: { tipo: "mensagem", texto: `Nova mensagem de ${req.entregador.nomeCompleto}: “${texto.slice(0, 80)}”` } });
    res.status(201).json({ id: m.id, texto: m.texto, minha: true, createdAt: m.createdAt });
  })
);

module.exports = router;
