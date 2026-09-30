// Painel › Integrações — montado em /api/integracoes (só leitura para contas sem permissão Total).
const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { CATALOGO, PORSLUG, STATUS_TODOS } = require("../integracoes/catalogo");
const { cifrar, decifrar, novoToken } = require("../integracoes/cripto");
const { obterOuCriar, enviarWebhook, eventosDaIntegracao } = require("../services/integracoes.service");

const router = express.Router();

function erro400(mensagem) {
  const err = new Error(mensagem);
  err.status = 400;
  return err;
}

// URL pública da API (para montar o endereço do webhook de entrada).
// RENDER_EXTERNAL_URL (Render) e VERCEL_PROJECT_PRODUCTION_URL (Vercel, sem "https://") são preenchidas pela hospedagem.
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null;
const baseUrl = req => (process.env.API_URL_PUBLICA || process.env.RENDER_EXTERNAL_URL || vercel || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

// Nunca devolve valor de campo secreto — só se está preenchido.
function credenciaisParaPainel(cat, texto) {
  let cred = {};
  let ilegivel = false;
  try { cred = decifrar(texto); } catch { ilegivel = true; }
  return {
    ilegivel,
    campos: cat.campos.map(c => ({
      ...c,
      preenchido: !!cred[c.nome],
      valor: c.secreto ? null : cred[c.nome] || "",
    })),
  };
}

// GET /api/integracoes — catálogo com a situação de cada integração
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const desde24h = new Date(Date.now() - 86400000);
    const [salvas, eventos] = await Promise.all([
      prisma.integracao.findMany({ include: { _count: { select: { lojas: true } } } }),
      prisma.integracaoEvento.groupBy({ by: ["integracaoId", "sucesso"], where: { createdAt: { gte: desde24h } }, _count: { _all: true } }),
    ]);
    const porSlug = Object.fromEntries(salvas.map(s => [s.slug, s]));
    res.json(CATALOGO.map(cat => {
      const s = porSlug[cat.slug];
      const ev = s ? eventos.filter(e => e.integracaoId === s.id) : [];
      const configurada = !!s && (!!s.credenciais || !!s.webhookSaidaUrl || s._count.lojas > 0);
      return {
        slug: cat.slug, nome: cat.nome, categoria: cat.categoria, tipo: cat.tipo, descricao: cat.descricao,
        ativa: !!s?.ativa,
        configurada,
        lojas: s?._count.lojas || 0,
        eventos24h: ev.filter(e => e.sucesso).reduce((n, e) => n + e._count._all, 0),
        erros24h: ev.filter(e => !e.sucesso).reduce((n, e) => n + e._count._all, 0),
      };
    }));
  })
);

async function detalhe(req, integ) {
  const cat = PORSLUG[integ.slug];
  const [lojas, eventos, pedidos] = await Promise.all([
    prisma.integracaoLoja.findMany({ where: { integracaoId: integ.id }, include: { comercio: { select: { nomeFantasia: true } } }, orderBy: { idExterno: "asc" } }),
    prisma.integracaoEvento.findMany({ where: { integracaoId: integ.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.pedido.count({ where: { integracaoSlug: integ.slug } }),
  ]);
  return {
    slug: integ.slug, nome: cat.nome, categoria: cat.categoria, tipo: cat.tipo, descricao: cat.descricao,
    ativa: integ.ativa,
    credenciais: credenciaisParaPainel(cat, integ.credenciais),
    config: { liberarAutomaticamente: !!integ.config?.liberarAutomaticamente, eventos: eventosDaIntegracao(integ) },
    statusDisponiveis: STATUS_TODOS,
    webhookEntradaUrl: cat.tipo === "saida" ? null : `${baseUrl(req)}/api/integracoes/webhook/${integ.webhookToken}`,
    // Mesmo token: autentica a entrada e assina (HMAC) os webhooks de saída.
    segredoAssinatura: integ.webhookToken,
    webhookSaidaUrl: integ.webhookSaidaUrl,
    lojas: lojas.map(l => ({ id: l.id, comercioId: l.comercioId, comercio: l.comercio.nomeFantasia, idExterno: l.idExterno })),
    pedidosRecebidos: pedidos,
    eventos,
  };
}

// GET /api/integracoes/:slug
router.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    res.json(await detalhe(req, await obterOuCriar(req.params.slug)));
  })
);

// PUT /api/integracoes/:slug  { ativa?, credenciais?: { campo: valor }, config?, webhookSaidaUrl? }
// Credenciais: valor vazio/ausente mantém o atual; null apaga.
router.put(
  "/:slug",
  asyncHandler(async (req, res) => {
    const integ = await obterOuCriar(req.params.slug);
    const cat = PORSLUG[integ.slug];
    const data = {};

    if (req.body.credenciais) {
      let atuais = {};
      try { atuais = decifrar(integ.credenciais); } catch { atuais = {}; }
      for (const campo of cat.campos) {
        const v = req.body.credenciais[campo.nome];
        if (v === null) delete atuais[campo.nome];
        else if (typeof v === "string" && v.trim()) atuais[campo.nome] = v.trim();
      }
      data.credenciais = Object.keys(atuais).length ? cifrar(atuais) : null;
    }

    if (req.body.webhookSaidaUrl !== undefined) {
      const url = String(req.body.webhookSaidaUrl || "").trim();
      if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw erro400("A URL de saída precisa começar com http:// ou https://.");
      data.webhookSaidaUrl = url || null;
    }

    if (req.body.config) {
      const eventos = Array.isArray(req.body.config.eventos) ? req.body.config.eventos.filter(e => STATUS_TODOS.includes(e)) : undefined;
      data.config = {
        ...(integ.config || {}),
        liberarAutomaticamente: !!req.body.config.liberarAutomaticamente,
        ...(eventos ? { eventos } : {}),
      };
    }

    if (req.body.ativa !== undefined) {
      const ativa = !!req.body.ativa;
      const saidaFinal = data.webhookSaidaUrl !== undefined ? data.webhookSaidaUrl : integ.webhookSaidaUrl;
      if (ativa && cat.tipo === "saida" && !saidaFinal) throw erro400(`Informe a URL de saída antes de ativar ${cat.nome}.`);
      data.ativa = ativa;
    }

    const atualizada = await prisma.integracao.update({ where: { id: integ.id }, data });
    res.json(await detalhe(req, atualizada));
  })
);

// PUT /api/integracoes/:slug/lojas  { lojas: [{ comercioId, idExterno }] } — substitui o vínculo
router.put(
  "/:slug/lojas",
  asyncHandler(async (req, res) => {
    const integ = await obterOuCriar(req.params.slug);
    const lojas = (Array.isArray(req.body.lojas) ? req.body.lojas : [])
      .map(l => ({ comercioId: l.comercioId, idExterno: String(l.idExterno || "").trim() }))
      .filter(l => l.comercioId || l.idExterno);
    if (lojas.some(l => !l.comercioId || !l.idExterno)) throw erro400("Cada loja precisa de um comércio e do id da loja na plataforma.");
    const ids = lojas.map(l => l.idExterno);
    if (new Set(ids).size !== ids.length) throw erro400("O mesmo id de loja aparece mais de uma vez.");
    await prisma.$transaction([
      prisma.integracaoLoja.deleteMany({ where: { integracaoId: integ.id } }),
      prisma.integracaoLoja.createMany({ data: lojas.map(l => ({ ...l, integracaoId: integ.id })) }),
    ]);
    res.json(await detalhe(req, integ));
  })
);

// POST /api/integracoes/:slug/regenerar-token — invalida a URL de entrada antiga
router.post(
  "/:slug/regenerar-token",
  asyncHandler(async (req, res) => {
    const integ = await obterOuCriar(req.params.slug);
    const atualizada = await prisma.integracao.update({ where: { id: integ.id }, data: { webhookToken: novoToken() } });
    res.json(await detalhe(req, atualizada));
  })
);

// POST /api/integracoes/:slug/testar — envia um evento de teste para a URL de saída
router.post(
  "/:slug/testar",
  asyncHandler(async (req, res) => {
    const integ = await obterOuCriar(req.params.slug);
    if (!integ.webhookSaidaUrl) throw erro400("Configure a URL de saída antes de testar.");
    const resultado = await enviarWebhook(integ, "teste", { mensagem: "Evento de teste enviado pelo painel Route Delivery." });
    res.json(resultado);
  })
);

// POST /api/integracoes/ifood/conexao — entra na API do iFood com as credenciais salvas
// e devolve as lojas que o aplicativo enxerga (com o Merchant ID), marcando as já vinculadas.
router.post(
  "/ifood/conexao",
  asyncHandler(async (req, res) => {
    const { listarLojas } = require("../integracoes/ifood");
    const integ = await obterOuCriar("ifood");
    let lojas;
    try {
      lojas = await listarLojas();
    } catch (err) {
      await prisma.integracaoEvento.create({ data: { integracaoId: integ.id, direcao: "SAIDA", tipo: "conexao.teste", sucesso: false, mensagem: err.message } }).catch(() => {});
      throw err;
    }
    const vinculadas = await prisma.integracaoLoja.findMany({ where: { integracaoId: integ.id }, include: { comercio: { select: { nomeFantasia: true } } } });
    const porId = new Map(vinculadas.map(v => [v.idExterno, v]));
    await prisma.integracaoEvento.create({
      data: { integracaoId: integ.id, direcao: "SAIDA", tipo: "conexao.teste", sucesso: true, mensagem: `Conectado ao iFood: ${lojas.length} loja(s) visível(is).` },
    }).catch(() => {});
    res.json({
      ok: true,
      lojas: lojas.map(l => ({ ...l, comercioId: porId.get(l.id)?.comercioId || null, comercioNome: porId.get(l.id)?.comercio?.nomeFantasia || null })),
    });
  })
);

module.exports = router;
