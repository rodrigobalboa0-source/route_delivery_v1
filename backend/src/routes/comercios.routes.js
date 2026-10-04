const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { omitir, normalizar } = require("../utils/sanitizar");
const { geocodificarEndereco } = require("../utils/geo");
const { erroDocumento, soDigitos } = require("../utils/documento");

const router = express.Router();

const INCLUDE_PADRAO = {
  enderecos: true,
  precificacoesModal: true,
  usuariosAdicionais: { select: { id: true, email: true } },
  tabelaComissao: true,
};

const CAMPOS_PROTEGIDOS = ["id", "createdAt", "enderecos", "precificacoesModal", "usuariosAdicionais", "tabelaComissao",
  "pedidos", "faturas", "entregadoresPermitidos", "_count", "estatisticas", "acesso",
  // Permissões da loja: só pela tela Configurações › Permissões da loja (rotas /permissoes abaixo).
  "lojaPodeFinalizar", "lojaPodeEditarComercio", "lojaPodeEditarEntregador", "lojaPodeBloquearEntregador", "exigirCodigoTelefone",
  // Roteirização automática: só pela tela Configurações › Roteirização automática.
  "roteirizacaoAutomatica", "roteirizacaoEscopo"];
const TIPOS_CAMPOS = { datas: ["dataInicio", "dataNascimento"] };
const VEICULOS = ["MOTO", "BIKE", "CARRO"];

// Funções que o ADM libera por loja no sistema do comerciante.
const PERMISSOES_LOJA = ["lojaPodeFinalizar", "lojaPodeEditarComercio", "lojaPodeEditarEntregador", "lojaPodeBloquearEntregador", "exigirCodigoTelefone"];

function erro400(mensagem) {
  const err = new Error(mensagem);
  err.status = 400;
  return err;
}

// Campos simples do comércio; valida o documento e guarda só os dígitos.
function dadosDoBody(body) {
  const dados = normalizar(omitir(body, CAMPOS_PROTEGIDOS), TIPOS_CAMPOS);
  if (dados.documento !== undefined && dados.documento !== null) {
    const tipo = dados.tipoDocumento || "CNPJ";
    const problema = erroDocumento(tipo, dados.documento);
    if (problema) throw erro400(problema);
    dados.documento = soDigitos(dados.documento);
  }
  if (dados.modalidadeCobranca !== undefined && !["FATURAMENTO", "CREDITO"].includes(dados.modalidadeCobranca)) {
    throw erro400("Modalidade de cobrança inválida: escolha Faturamento ou Crédito.");
  }
  return dados;
}

function precificacaoDoBody(p) {
  if (!VEICULOS.includes(p.veiculo)) throw erro400(`Veículo inválido: ${p.veiculo}`);
  const n = normalizar({ precoPorPonto: p.precoPorPonto }, { numeros: ["precoPorPonto"] });
  return {
    veiculo: p.veiculo,
    precoPorPonto: n.precoPorPonto ?? null,
    tipoPrecificacao: p.tipoPrecificacao || "PADRAO",
    tabelaPrecoKmId: p.tabelaPrecoKmId || null,
  };
}

const CAMPOS_ENDERECO = ["rua", "numero", "complemento", "bairro", "cidade", "cep", "referencia", "lat", "lng", "principal"];

// Só os campos do modelo (o formulário pode mandar campos de controle da tela).
function normalizarEndereco(e) {
  const escolhidos = Object.fromEntries(CAMPOS_ENDERECO.filter(c => e[c] !== undefined).map(c => [c, e[c]]));
  const endereco = normalizar(escolhidos, { numeros: ["lat", "lng"] });
  if (endereco.cep) endereco.cep = soDigitos(endereco.cep);
  if (endereco.principal === undefined) endereco.principal = true;
  return endereco;
}

// Sem coordenadas o comércio não consegue calcular rota/valor das entregas,
// então tentamos geocodificar o endereço (melhor esforço — não bloqueia o cadastro).
async function completarCoordenadas(endereco) {
  if (endereco.lat != null && endereco.lng != null) return endereco;
  const texto = [endereco.rua, endereco.numero, endereco.bairro, endereco.cidade].filter(Boolean).join(", ");
  if (!texto) return endereco;
  try {
    const coords = await geocodificarEndereco(texto);
    // Só a posição (o geocodificador também informa a fonte: Google ou OpenStreetMap).
    return coords ? { ...endereco, lat: coords.lat, lng: coords.lng } : endereco;
  } catch {
    return endereco;
  }
}

async function validarSenha(senha) {
  if (!senha || String(senha).length < 6) {
    const err = new Error("A senha de acesso precisa ter pelo menos 6 caracteres.");
    err.status = 400;
    throw err;
  }
  return bcrypt.hash(senha, 10);
}

// GET /api/comercios?busca=..&bloqueado=true
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { busca, bloqueado, situacao } = req.query;
    const where = {};
    if (bloqueado === "true") where.bloqueado = true;
    if (bloqueado === "false") Object.assign(where, { bloqueado: false, situacaoCadastro: "ATIVO" });
    if (["ATIVO", "EM_ANALISE", "RECUSADO"].includes(situacao)) where.situacaoCadastro = situacao;
    if (busca) {
      where.OR = [
        { nomeFantasia: { contains: busca, mode: "insensitive" } },
        { razaoSocial: { contains: busca, mode: "insensitive" } },
        { documento: { contains: busca } },
      ];
    }
    const comercios = await prisma.comercio.findMany({
      where,
      include: { ...INCLUDE_PADRAO, _count: { select: { pedidos: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(comercios);
  })
);

// GET /api/comercios/contagem
// GET /api/comercios/permissoes — todas as lojas com as permissões (Configurações › Permissões da loja)
router.get(
  "/permissoes",
  asyncHandler(async (req, res) => {
    res.json(await prisma.comercio.findMany({
      orderBy: { nomeFantasia: "asc" },
      select: { id: true, nomeFantasia: true, bloqueado: true, ...Object.fromEntries(PERMISSOES_LOJA.map(k => [k, true])) },
    }));
  })
);

// ---------- Roteirização automática por comércio ----------
const SELECT_ROTEIRIZACAO = { id: true, nomeFantasia: true, bloqueado: true, roteirizacaoAutomatica: true, roteirizacaoEscopo: true };
const ESCOPOS = ["LOJA", "TODOS"];

// GET /api/comercios/roteirizacao — todas as lojas com liga/desliga e escopo
router.get(
  "/roteirizacao",
  asyncHandler(async (req, res) => {
    res.json(await prisma.comercio.findMany({ orderBy: { nomeFantasia: "asc" }, select: SELECT_ROTEIRIZACAO }));
  })
);

// PUT /api/comercios/roteirizacao/todas { roteirizacaoAutomatica? , roteirizacaoEscopo? } — aplica a todas as lojas
router.put(
  "/roteirizacao/todas",
  asyncHandler(async (req, res) => {
    const data = dadosRoteirizacao(req.body);
    const { count } = await prisma.comercio.updateMany({ data });
    res.json({ ok: true, lojas: count });
  })
);

// PUT /api/comercios/:id/roteirizacao { roteirizacaoAutomatica?, roteirizacaoEscopo? }
router.put(
  "/:id/roteirizacao",
  asyncHandler(async (req, res) => {
    res.json(await prisma.comercio.update({ where: { id: req.params.id }, data: dadosRoteirizacao(req.body), select: SELECT_ROTEIRIZACAO }));
  })
);

function dadosRoteirizacao(b = {}) {
  const data = {};
  if (b.roteirizacaoAutomatica !== undefined) data.roteirizacaoAutomatica = !!b.roteirizacaoAutomatica;
  if (b.roteirizacaoEscopo !== undefined) {
    if (!ESCOPOS.includes(b.roteirizacaoEscopo)) throw Object.assign(new Error("Escolha 'Só desta loja' ou 'Todos os comércios'."), { status: 400 });
    data.roteirizacaoEscopo = b.roteirizacaoEscopo;
  }
  if (!Object.keys(data).length) throw Object.assign(new Error("Nada para alterar."), { status: 400 });
  return data;
}

// PUT /api/comercios/permissoes/todas { campo, valor } — liga/desliga uma função para todas as lojas
router.put(
  "/permissoes/todas",
  asyncHandler(async (req, res) => {
    const { campo, valor } = req.body || {};
    if (!PERMISSOES_LOJA.includes(campo)) return res.status(400).json({ erro: "Permissão inválida." });
    const { count } = await prisma.comercio.updateMany({ data: { [campo]: !!valor } });
    res.json({ ok: true, lojas: count });
  })
);

// PUT /api/comercios/:id/permissoes { lojaPodeFinalizar?, ..., exigirCodigoTelefone? } — permissões de uma loja
router.put(
  "/:id/permissoes",
  asyncHandler(async (req, res) => {
    const data = {};
    for (const k of PERMISSOES_LOJA) if (req.body?.[k] !== undefined) data[k] = !!req.body[k];
    if (!Object.keys(data).length) return res.status(400).json({ erro: "Nada para alterar." });
    const c = await prisma.comercio.update({
      where: { id: req.params.id }, data,
      select: { id: true, nomeFantasia: true, bloqueado: true, ...Object.fromEntries(PERMISSOES_LOJA.map(k => [k, true])) },
    });
    res.json(c);
  })
);

router.get(
  "/contagem",
  asyncHandler(async (req, res) => {
    const [total, bloqueados, emAnalise, ativos] = await Promise.all([
      prisma.comercio.count(),
      prisma.comercio.count({ where: { bloqueado: true } }),
      prisma.comercio.count({ where: { situacaoCadastro: "EM_ANALISE" } }),
      prisma.comercio.count({ where: { bloqueado: false, situacaoCadastro: "ATIVO" } }),
    ]);
    res.json({ total, ativos, bloqueados, emAnalise });
  })
);

// GET /api/comercios/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const comercio = await prisma.comercio.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_PADRAO,
    });
    if (!comercio) return res.status(404).json({ erro: "Comércio não encontrado." });

    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const [totalPedidos, doMes, emAberto] = await Promise.all([
      prisma.pedido.count({ where: { comercioId: comercio.id } }),
      prisma.pedido.aggregate({
        where: { comercioId: comercio.id, status: "ENTREGUE", createdAt: { gte: inicioMes } },
        _count: { _all: true }, _sum: { valor: true },
      }),
      prisma.fatura.aggregate({ where: { comercioId: comercio.id, paga: false }, _sum: { valor: true } }),
    ]);

    res.json({
      ...comercio,
      estatisticas: {
        totalPedidos,
        entreguesNoMes: doMes._count._all,
        valorNoMes: doMes._sum.valor || 0,
        faturasEmAberto: emAberto._sum.valor || 0,
      },
    });
  })
);

// Normaliza a lista de endereços do formulário: ignora os sem rua, garante exatamente
// um principal e localiza os que estão sem coordenadas (um por vez — o Nominatim
// pede no máximo ~1 requisição por segundo).
async function prepararEnderecos(lista = []) {
  const validos = lista.filter(e => e && e.rua).map(e => ({ id: e.id, ...normalizarEndereco(e), principal: !!e.principal }));
  if (validos.length && !validos.some(e => e.principal)) validos[0].principal = true;
  let achouPrincipal = false;
  for (const e of validos) {
    if (e.principal && achouPrincipal) e.principal = false;
    if (e.principal) achouPrincipal = true;
  }
  const saida = [];
  for (const e of validos) saida.push(await completarCoordenadas(e));
  return saida;
}

// "acesso" do formulário = login do sistema do comerciante. Sem senha, nada muda.
async function operacoesDeAcesso(acesso, comercioId) {
  if (!acesso?.senha) return [];
  if (!acesso.email) throw erro400("Informe o e-mail para criar o acesso ao sistema do comerciante.");
  const senhaHash = await validarSenha(acesso.senha);
  const existente = await prisma.comercioUsuario.findUnique({ where: { email: acesso.email } });
  if (existente && existente.comercioId !== comercioId) {
    const err = new Error("Este e-mail já é login de outro comércio.");
    err.status = 409;
    throw err;
  }
  return existente
    ? [prisma.comercioUsuario.update({ where: { id: existente.id }, data: { senhaHash } })]
    : [prisma.comercioUsuario.create({ data: { comercioId, email: acesso.email, senhaHash } })];
}

function exigirNome(dados) {
  if (!dados.nomeFantasia && !dados.razaoSocial) throw erro400('Informe o "Nome Fantasia" ou a "Razão Social".');
}

// POST /api/comercios
// body: { ...camposDoComercio, enderecos: [...], precificacoesModal: [...],
//         usuariosAdicionais: [{email, senha}], acesso: { email, senha } }
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { precificacoesModal = [], usuariosAdicionais = [], acesso } = req.body;
    const dadosComercio = dadosDoBody(req.body);
    exigirNome(dadosComercio);

    const logins = [...usuariosAdicionais, ...(acesso?.senha ? [acesso] : [])].filter(u => u.email);
    const usuariosComHash = await Promise.all(logins.map(async u => ({ email: u.email, senhaHash: await validarSenha(u.senha) })));
    const enderecos = (await prepararEnderecos(req.body.enderecos)).map(({ id, ...e }) => e);

    const comercio = await prisma.comercio.create({
      data: {
        ...dadosComercio,
        nomeFantasia: dadosComercio.nomeFantasia || dadosComercio.razaoSocial,
        enderecos: { create: enderecos },
        precificacoesModal: { create: precificacoesModal.map(precificacaoDoBody) },
        usuariosAdicionais: { create: usuariosComHash },
      },
      include: INCLUDE_PADRAO,
    });

    res.status(201).json(comercio);
  })
);

// POST /api/comercios/geocodificar  { endereco } — posição inicial do mapa "Ajustar localização"
router.post(
  "/geocodificar",
  asyncHandler(async (req, res) => {
    if (!req.body.endereco) return res.status(400).json({ erro: 'Informe o "endereco".' });
    const coords = await geocodificarEndereco(req.body.endereco).catch(() => null);
    if (!coords) return res.status(404).json({ erro: "Endereço não encontrado no mapa. Posicione o ponto manualmente." });
    res.json(coords);
  })
);

// PUT /api/comercios/:id/cadastro-completo
// Salva o formulário inteiro do comércio numa transação: dados, endereços
// (os que não vierem são removidos), precificação por modal e acesso ao sistema.
router.put(
  "/:id/cadastro-completo",
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const atual = await prisma.comercio.findUnique({ where: { id }, include: { enderecos: true } });
    if (!atual) return res.status(404).json({ erro: "Comércio não encontrado." });

    const dados = dadosDoBody(req.body);
    exigirNome({ nomeFantasia: dados.nomeFantasia ?? atual.nomeFantasia, razaoSocial: dados.razaoSocial ?? atual.razaoSocial });
    if (!dados.nomeFantasia) dados.nomeFantasia = dados.razaoSocial || atual.nomeFantasia;

    const idsAtuais = new Set(atual.enderecos.map(e => e.id));
    const enderecos = await prepararEnderecos(req.body.enderecos);
    if (enderecos.some(e => e.id && !idsAtuais.has(e.id))) throw erro400("Endereço não pertence a este comércio.");
    const mantidos = enderecos.filter(e => e.id).map(e => e.id);

    const precos = (req.body.precificacoesModal || []).map(precificacaoDoBody);
    const acesso = await operacoesDeAcesso(req.body.acesso, id);

    await prisma.$transaction([
      prisma.comercio.update({ where: { id }, data: dados }),
      prisma.comercioEndereco.deleteMany({ where: { comercioId: id, id: { notIn: mantidos } } }),
      ...enderecos.map(({ id: enderecoId, ...e }) =>
        enderecoId
          ? prisma.comercioEndereco.update({ where: { id: enderecoId }, data: e })
          : prisma.comercioEndereco.create({ data: { ...e, comercioId: id } })
      ),
      ...precos.map(({ veiculo, ...p }) =>
        prisma.precificacaoModal.upsert({
          where: { comercioId_veiculo: { comercioId: id, veiculo } },
          update: p,
          create: { comercioId: id, veiculo, ...p },
        })
      ),
      ...acesso,
    ]);

    res.json(await prisma.comercio.findUnique({ where: { id }, include: INCLUDE_PADRAO }));
  })
);

// PUT /api/comercios/:id
// Atualiza os campos simples do comércio. Endereços/precificação por modal/usuários
// têm sub-rotas próprias abaixo para não sobrescrever tudo sem querer.
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const comercio = await prisma.comercio.update({
      where: { id: req.params.id },
      data: dadosDoBody(req.body),
      include: INCLUDE_PADRAO,
    });
    res.json(comercio);
  })
);

// DELETE /api/comercios/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.comercio.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// PATCH /api/comercios/:id/bloquear | /desbloquear — suspende o acesso ao sistema do comerciante
router.patch(
  "/:id/bloquear",
  asyncHandler(async (req, res) => {
    res.json(await prisma.comercio.update({ where: { id: req.params.id }, data: { bloqueado: true }, include: INCLUDE_PADRAO }));
  })
);
// PATCH /api/comercios/:id/cadastro { situacao: ATIVO|RECUSADO, motivo? } — aprova ou recusa a loja que se cadastrou sozinha
router.patch(
  "/:id/cadastro",
  asyncHandler(async (req, res) => {
    const situacao = req.body?.situacao;
    if (!["ATIVO", "RECUSADO"].includes(situacao)) return res.status(400).json({ erro: "Escolha aprovar ou recusar." });
    const motivo = String(req.body?.motivo || "").trim().slice(0, 300) || null;
    if (situacao === "RECUSADO" && !motivo) return res.status(400).json({ erro: "Informe o motivo da recusa (a loja vê ao tentar entrar)." });
    const c = await prisma.comercio.update({ where: { id: req.params.id }, data: { situacaoCadastro: situacao, motivoRecusa: situacao === "RECUSADO" ? motivo : null }, include: INCLUDE_PADRAO });
    // Avisa a loja por e-mail (se o envio de e-mail estiver configurado).
    if (c.email) {
      const { enviarEmail, htmlSimples } = require("../services/email.service");
      const titulo = situacao === "ATIVO" ? "Sua loja foi aprovada! ✓" : "Cadastro da loja não aprovado";
      const texto = situacao === "ATIVO"
        ? `Olá! O cadastro de ${c.nomeFantasia} na Route Delivery foi aprovado. Já dá para entrar no sistema do comerciante com o seu e-mail e senha.`
        : `O cadastro de ${c.nomeFantasia} na Route Delivery não foi aprovado. Motivo: ${motivo}`;
      require("../utils/segundoPlano").emSegundoPlano(() => enviarEmail({ para: c.email, assunto: titulo, texto, html: htmlSimples({ titulo, paragrafos: [texto] }) }), "E-mail cadastro loja");
    }
    res.json(c);
  })
);

router.patch(
  "/:id/desbloquear",
  asyncHandler(async (req, res) => {
    res.json(await prisma.comercio.update({ where: { id: req.params.id }, data: { bloqueado: false }, include: INCLUDE_PADRAO }));
  })
);

// ---- Sub-recursos ----

// POST /api/comercios/:id/enderecos
router.post(
  "/:id/enderecos",
  asyncHandler(async (req, res) => {
    const dados = await completarCoordenadas(normalizarEndereco(req.body));
    if (!dados.rua) return res.status(400).json({ erro: 'Informe a "rua".' });
    if (dados.principal) {
      await prisma.comercioEndereco.updateMany({ where: { comercioId: req.params.id }, data: { principal: false } });
    }
    const endereco = await prisma.comercioEndereco.create({ data: { ...dados, comercioId: req.params.id } });
    res.status(201).json(endereco);
  })
);

// PUT /api/comercios/:id/enderecos/:enderecoId
router.put(
  "/:id/enderecos/:enderecoId",
  asyncHandler(async (req, res) => {
    const dados = await completarCoordenadas(normalizarEndereco(req.body));
    if (dados.principal) {
      await prisma.comercioEndereco.updateMany({ where: { comercioId: req.params.id }, data: { principal: false } });
    }
    const endereco = await prisma.comercioEndereco.update({ where: { id: req.params.enderecoId }, data: dados });
    res.json(endereco);
  })
);

// DELETE /api/comercios/:id/enderecos/:enderecoId
router.delete(
  "/:id/enderecos/:enderecoId",
  asyncHandler(async (req, res) => {
    await prisma.comercioEndereco.delete({ where: { id: req.params.enderecoId } });
    res.status(204).send();
  })
);

// PUT /api/comercios/:id/precificacao-modal/:veiculo  (MOTO | BIKE | CARRO)
router.put(
  "/:id/precificacao-modal/:veiculo",
  asyncHandler(async (req, res) => {
    const { precoPorPonto, tipoPrecificacao, tabelaPrecoKmId } = normalizar(req.body, { numeros: ["precoPorPonto"] });
    const registro = await prisma.precificacaoModal.upsert({
      where: { comercioId_veiculo: { comercioId: req.params.id, veiculo: req.params.veiculo } },
      update: { precoPorPonto, tipoPrecificacao, tabelaPrecoKmId },
      create: {
        comercioId: req.params.id,
        veiculo: req.params.veiculo,
        precoPorPonto,
        tipoPrecificacao,
        tabelaPrecoKmId,
      },
    });
    res.json(registro);
  })
);

// DELETE /api/comercios/:id/precificacao-modal/:veiculo
router.delete(
  "/:id/precificacao-modal/:veiculo",
  asyncHandler(async (req, res) => {
    await prisma.precificacaoModal.delete({
      where: { comercioId_veiculo: { comercioId: req.params.id, veiculo: req.params.veiculo } },
    });
    res.status(204).send();
  })
);

// POST /api/comercios/:id/usuarios  { email, senha } — cria login do sistema do comerciante
router.post(
  "/:id/usuarios",
  asyncHandler(async (req, res) => {
    const { email, senha } = req.body;
    if (!email) return res.status(400).json({ erro: 'Informe o "email" do usuário.' });
    const usuario = await prisma.comercioUsuario.create({
      data: { comercioId: req.params.id, email, senhaHash: await validarSenha(senha) },
    });
    res.status(201).json({ id: usuario.id, email: usuario.email });
  })
);

// PATCH /api/comercios/:id/usuarios/:usuarioId/senha  { senha }
router.patch(
  "/:id/usuarios/:usuarioId/senha",
  asyncHandler(async (req, res) => {
    const usuario = await prisma.comercioUsuario.update({
      where: { id: req.params.usuarioId },
      data: { senhaHash: await validarSenha(req.body.senha) },
    });
    res.json({ id: usuario.id, email: usuario.email });
  })
);

// DELETE /api/comercios/:id/usuarios/:usuarioId
router.delete(
  "/:id/usuarios/:usuarioId",
  asyncHandler(async (req, res) => {
    await prisma.comercioUsuario.delete({ where: { id: req.params.usuarioId } });
    res.status(204).send();
  })
);

module.exports = router;
