const express = require("express");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { omitir } = require("../utils/sanitizar");
const { obterRegras, salvarRegras } = require("../services/saque.service");
const { cifrar, decifrar } = require("../integracoes/cripto");
const { googleGeocodificar, googleDistanciaKm, esquecerChaveGoogle } = require("../utils/geo");
const { enviarEmail, htmlSimples } = require("../services/email.service");

const router = express.Router();

async function obterOuCriarConfiguracao() {
  const existente = await prisma.configuracao.findFirst();
  if (existente) return existente;
  return prisma.configuracao.create({ data: {} });
}

// A chave do Google Maps nunca sai da API — só se está configurada e os 4 últimos caracteres.
function chaveGoogleDe(config) {
  try {
    return config.googleMapsChave ? decifrar(config.googleMapsChave).chave || null : null;
  } catch {
    return null;
  }
}
function publica(config) {
  const chave = chaveGoogleDe(config);
  return {
    ...omitir(config, ["googleMapsChave", "smtpSenha", "resendChave"]),
    googleMaps: {
      configurada: !!chave,
      final: chave ? chave.slice(-4) : null,
      viaVariavel: !chave && !!process.env.GOOGLE_MAPS_API_KEY,
    },
    // Senhas de e-mail nunca saem da API: só se estão salvas.
    email: { smtpSenhaSalva: !!config.smtpSenha, resendChaveSalva: !!config.resendChave },
  };
}

const SEGREDOS = ["id", "googleMapsChave", "googleMaps", "email", "smtpSenha", "resendChave", "emailProvedor", "emailRemetente", "smtpHost", "smtpPorta", "smtpUsuario"];

// Valida os campos gerais que têm regra (retorno, raio, ranking).
function validarGerais(b) {
  const erro = m => { const e = new Error(m); e.status = 400; throw e; };
  if (b.retornoPercentual !== undefined) {
    const pct = Number(b.retornoPercentual);
    if (!Number.isFinite(pct) || pct < 0 || pct > 300) erro("O acréscimo do retorno deve ficar entre 0% e 300%.");
    b.retornoPercentual = pct;
  }
  if (b.raioConfirmacaoMetros !== undefined) {
    const m = Math.round(Number(b.raioConfirmacaoMetros));
    if (!Number.isFinite(m) || m < 30 || m > 5000) erro("O raio de confirmação deve ficar entre 30 e 5.000 metros.");
    b.raioConfirmacaoMetros = m;
  }
  if (b.rankingMinimoEntregas !== undefined) {
    const m = Math.round(Number(b.rankingMinimoEntregas));
    if (!Number.isFinite(m) || m < 0 || m > 10000) erro("Mínimo de entregas do ranking inválido.");
    b.rankingMinimoEntregas = m;
  }
  if (b.rankingPremios !== undefined) {
    const l = Array.isArray(b.rankingPremios) ? b.rankingPremios : [];
    const premios = Array.from({ length: 10 }, (_, i) => Math.round(Number(String(l[i] ?? 0).replace(",", ".")) * 100) / 100);
    if (premios.some(v => !Number.isFinite(v) || v < 0 || v > 100000)) erro("Os prêmios do ranking devem ser valores de R$ 0 a R$ 100.000.");
    b.rankingPremios = premios;
  }
  if (b.rankingAtivo !== undefined) b.rankingAtivo = !!b.rankingAtivo;
  // Roteirização automática (valores gerais).
  const faixa = (campo, min, max, inteiro, rotulo) => {
    if (b[campo] === undefined) return;
    const v = Number(String(b[campo]).replace(",", "."));
    if (!Number.isFinite(v) || v < min || v > max || (inteiro && !Number.isInteger(v))) erro(`${rotulo} deve ficar entre ${min} e ${max}.`);
    b[campo] = v;
  };
  faixa("rotaEsperaSegundos", 5, 120, true, "O tempo de espera da roteirização (segundos)");
  faixa("rotaMaxPedidos", 2, 10, true, "O máximo de entregas por rota");
  faixa("rotaDistanciaMaxKm", 0.3, 30, false, "A distância máxima entre as entregas (km)");
  faixa("rotaRaioColetaKm", 0.1, 20, false, "A distância máxima entre lojas (km)");
  // Chamada por proximidade.
  if (b.despachoProximidade !== undefined) b.despachoProximidade = !!b.despachoProximidade;
  faixa("despachoPorVez", 1, 20, true, "Entregadores chamados por vez");
  faixa("despachoTempoSegundos", 10, 300, true, "O tempo para aceitar antes de chamar os próximos (segundos)");
  return b;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const config = await obterOuCriarConfiguracao();
    res.json(publica(config));
  })
);

router.put(
  "/",
  asyncHandler(async (req, res) => {
    const config = await obterOuCriarConfiguracao();
    const atualizado = await prisma.configuracao.update({
      where: { id: config.id },
      data: validarGerais(omitir(req.body, SEGREDOS)),
    });
    res.json(publica(atualizado));
  })
);

// ---------- E-mail (recuperação de senha) ----------

// PUT /api/configuracoes/email { emailProvedor, emailRemetente, smtpHost, smtpPorta, smtpUsuario, smtpSenha?, resendChave? }
// Senha/chave em branco = mantém a salva.
router.put(
  "/email",
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const provedor = b.emailProvedor || null;
    if (provedor && !["SMTP", "RESEND"].includes(provedor)) return res.status(400).json({ erro: "Escolha SMTP ou Resend." });
    const remetente = String(b.emailRemetente || "").trim() || null;
    if (remetente && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(remetente)) return res.status(400).json({ erro: "E-mail do remetente inválido." });
    const porta = b.smtpPorta === "" || b.smtpPorta == null ? null : Number(b.smtpPorta);
    if (porta != null && (!Number.isInteger(porta) || porta < 1 || porta > 65535)) return res.status(400).json({ erro: "Porta SMTP inválida." });
    const data = {
      emailProvedor: provedor, emailRemetente: remetente,
      smtpHost: String(b.smtpHost || "").trim() || null, smtpPorta: porta, smtpUsuario: String(b.smtpUsuario || "").trim() || null,
    };
    if (b.smtpSenha) data.smtpSenha = cifrar({ valor: String(b.smtpSenha).replace(/\s/g, "") }); // senha de app do Gmail vem com espaços
    if (b.resendChave) data.resendChave = cifrar({ valor: String(b.resendChave).trim() });
    const config = await obterOuCriarConfiguracao();
    res.json(publica(await prisma.configuracao.update({ where: { id: config.id }, data })));
  })
);

// POST /api/configuracoes/email/testar { para } — envia um e-mail de teste
router.post(
  "/email/testar",
  asyncHandler(async (req, res) => {
    const para = String(req.body?.para || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return res.status(400).json({ erro: "Informe um e-mail válido para o teste." });
    try {
      await enviarEmail({
        para, assunto: "Teste de e-mail — Route Delivery",
        texto: "Se você recebeu esta mensagem, o envio de e-mail do sistema está funcionando.",
        html: htmlSimples({ titulo: "Teste de e-mail ✓", paragrafos: ["Se você recebeu esta mensagem, o envio de e-mail do sistema está funcionando."] }),
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ erro: err.message });
    }
  })
);

// ---------- Google Maps (só para localizar endereços e medir o km da rota) ----------

// PUT /api/configuracoes/google-maps { chave } — salva criptografada
router.put(
  "/google-maps",
  asyncHandler(async (req, res) => {
    const chave = String(req.body?.chave || "").trim();
    if (!/^[A-Za-z0-9_-]{30,60}$/.test(chave)) {
      return res.status(400).json({ erro: "Chave inválida. Ela começa com “AIza” e tem cerca de 39 caracteres." });
    }
    const config = await obterOuCriarConfiguracao();
    const atualizado = await prisma.configuracao.update({ where: { id: config.id }, data: { googleMapsChave: cifrar({ chave }) } });
    esquecerChaveGoogle();
    res.json(publica(atualizado));
  })
);

router.delete(
  "/google-maps",
  asyncHandler(async (req, res) => {
    const config = await obterOuCriarConfiguracao();
    const atualizado = await prisma.configuracao.update({ where: { id: config.id }, data: { googleMapsChave: null } });
    esquecerChaveGoogle();
    res.json(publica(atualizado));
  })
);

// POST /api/configuracoes/google-maps/testar { origem, destino } — mede a rota entre dois endereços
// usando SÓ o Google (sem reserva), para conferir se a chave e as APIs estão liberadas.
router.post(
  "/google-maps/testar",
  asyncHandler(async (req, res) => {
    const config = await obterOuCriarConfiguracao();
    const chave = chaveGoogleDe(config) || process.env.GOOGLE_MAPS_API_KEY;
    if (!chave) return res.status(400).json({ erro: "Salve a chave do Google Maps antes de testar." });
    const origem = String(req.body?.origem || "").trim();
    const destino = String(req.body?.destino || "").trim();
    if (!origem || !destino) return res.status(400).json({ erro: "Informe os dois endereços." });
    try {
      const [a, b] = await Promise.all([googleGeocodificar(origem, chave), googleGeocodificar(destino, chave)]);
      if (!a || !b) return res.status(400).json({ erro: `O Google não encontrou o endereço ${!a ? "de origem" : "de destino"}.` });
      const km = await googleDistanciaKm(a, b, chave);
      if (km == null) return res.status(400).json({ erro: "O Google não encontrou uma rota entre os dois endereços." });
      res.json({ ok: true, distanciaKm: Number(km.toFixed(2)), origem: a, destino: b });
    } catch (err) {
      res.status(400).json({ erro: `O Google recusou: ${err.message}` });
    }
  })
);

// GET /api/configuracoes/saque — regras de saque normal e rápido
router.get(
  "/saque",
  asyncHandler(async (req, res) => {
    res.json(await obterRegras());
  })
);

// PUT /api/configuracoes/saque  { NORMAL: {...}, RAPIDO: {...} }
router.put(
  "/saque",
  asyncHandler(async (req, res) => {
    res.json(await salvarRegras(req.body));
  })
);

module.exports = router;
