const express = require("express");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { asyncHandler } = require("../middleware/errorHandler");
const { omitir, semSenha, normalizar } = require("../utils/sanitizar");
const { autorDe, registrarStatusEntregador } = require("../services/historico.service");
const { COM_ENTREGADOR } = require("../utils/statusPedido");

const router = express.Router();

// Campos que o painel não grava pelo formulário comum (têm rotas próprias ou vêm do app).
const CAMPOS_PROTEGIDOS = ["id", "senhaHash", "senha", "online", "lat", "lng", "localizacaoEm", "createdAt",
  "pedidos", "comerciosPermitidos", "temAcessoApp", "_count"];
const TIPOS_CAMPOS = { datas: ["dataNascimento"], numeros: ["taxaEntrega", "comissaoAutoValor"], inteiros: ["prioridadeBusca"] };

function dadosDoBody(body) {
  const d = normalizar(omitir(body, CAMPOS_PROTEGIDOS), TIPOS_CAMPOS);
  // Comissão automática por entrega: ligada exige um valor fixo maior que zero.
  if (d.comissaoAutoAtiva !== undefined) d.comissaoAutoAtiva = d.comissaoAutoAtiva === true || d.comissaoAutoAtiva === "true";
  if (d.comissaoAutoValor != null && (!Number.isFinite(d.comissaoAutoValor) || d.comissaoAutoValor < 0 || d.comissaoAutoValor > 1000)) {
    const err = new Error("Valor da comissão automática inválido (entre R$ 0,01 e R$ 1.000,00).");
    err.status = 400;
    throw err;
  }
  if (d.comissaoAutoAtiva && !(d.comissaoAutoValor > 0)) {
    const err = new Error("Informe o valor da comissão automática por entrega.");
    err.status = 400;
    throw err;
  }
  return d;
}

// GET /api/entregadores?status=ATIVO&busca=..&online=true
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, busca, online } = req.query;
    const where = {};
    if (status) where.status = status;
    if (online === "true") where.online = true;
    if (busca) {
      where.OR = [
        { nomeCompleto: { contains: busca, mode: "insensitive" } },
        { cpf: { contains: busca } },
        { telefone: { contains: busca } },
        { email: { contains: busca, mode: "insensitive" } },
      ];
    }
    const entregadores = await prisma.entregador.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { pedidos: true } } },
    });
    // Lista sem as fotos dos documentos (pesadas) — elas vêm no detalhe (aba Documentos).
    res.json(semSenha(entregadores).map(({ fotoCnhUrl, comprovanteResidenciaUrl, documentoVeiculoUrl, ...e }) => ({
      ...e, documentos: [fotoCnhUrl, comprovanteResidenciaUrl, documentoVeiculoUrl].filter(Boolean).length,
    })));
  })
);

// GET /api/entregadores/contagem — usado pelos cards "Em análise / Ativos / Inativos / Online"
router.get(
  "/contagem",
  asyncHandler(async (req, res) => {
    const [emAnalise, ativos, inativos, online, bloqueados] = await Promise.all([
      prisma.entregador.count({ where: { status: "EM_ANALISE" } }),
      prisma.entregador.count({ where: { status: "ATIVO" } }),
      prisma.entregador.count({ where: { status: "INATIVO" } }),
      prisma.entregador.count({ where: { online: true } }),
      prisma.entregador.count({ where: { bloqueado: true } }),
    ]);
    // ?cidade= (Operação por cidade): online só dos entregadores daquela cidade.
    const cidade = String(req.query.cidade || "").trim();
    const onlineCidade = cidade
      ? (await filtrarPorCidade(await prisma.entregador.findMany({ where: { online: true }, select: { lat: true, lng: true, cidade: true } }), cidade)).length
      : online;
    res.json({ emAnalise, ativos, inativos, online: onlineCidade, bloqueados });
  })
);

// Operação por cidade: entregador "da cidade" = está a até 30 km de alguma loja dela
// (ou, sem posição, tem a cidade no cadastro).
const RAIO_CIDADE_KM = 30;
async function filtrarPorCidade(entregadores, cidade) {
  if (!cidade) return entregadores;
  const lojas = await prisma.comercioEndereco.findMany({
    where: { cidade: { contains: cidade, mode: "insensitive" }, lat: { not: null } }, select: { lat: true, lng: true },
  });
  const { distanciaLinhaRetaKm } = require("../utils/geo");
  const perto = e => e.lat != null && lojas.some(l => distanciaLinhaRetaKm({ lat: e.lat, lng: e.lng }, l) <= RAIO_CIDADE_KM);
  const doCadastro = e => e.lat == null && String(e.cidade || "").toLowerCase().includes(cidade.toLowerCase());
  return entregadores.filter(e => perto(e) || doCadastro(e));
}

// GET /api/entregadores/online?cidade= — posições para o mapa do painel
router.get(
  "/online",
  asyncHandler(async (req, res) => {
    const entregadores = await prisma.entregador.findMany({
      where: { online: true, lat: { not: null }, lng: { not: null } },
      select: {
        id: true, nomeCompleto: true, fotoUrl: true, veiculoTipo: true, lat: true, lng: true, localizacaoEm: true, cidade: true,
        pedidos: { where: { status: { in: COM_ENTREGADOR } }, select: { id: true, codigo: true } },
      },
    });
    res.json(await filtrarPorCidade(entregadores, String(req.query.cidade || "").trim()));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const entregador = await prisma.entregador.findUnique({
      where: { id: req.params.id },
      include: {
        comerciosPermitidos: { select: { comercioId: true } },
        bloqueiosLoja: { orderBy: { createdAt: "desc" }, include: { comercio: { select: { id: true, nomeFantasia: true } } } },
      },
    });
    if (!entregador) return res.status(404).json({ erro: "Entregador não encontrado." });

    const [totalPedidos, entregues, emAndamento] = await Promise.all([
      prisma.pedido.count({ where: { entregadorId: entregador.id } }),
      prisma.pedido.aggregate({ where: { entregadorId: entregador.id, status: "ENTREGUE" }, _count: { _all: true }, _sum: { valor: true } }),
      prisma.pedido.count({ where: { entregadorId: entregador.id, status: { in: COM_ENTREGADOR } } }),
    ]);

    res.json({
      ...semSenha(entregador),
      comerciosPermitidos: entregador.comerciosPermitidos.map(c => c.comercioId),
      bloqueiosLoja: entregador.bloqueiosLoja.map(b => ({ comercioId: b.comercio.id, loja: b.comercio.nomeFantasia, motivo: b.motivo, autorNome: b.autorNome, createdAt: b.createdAt })),
      estatisticas: {
        totalPedidos,
        entregues: entregues._count._all,
        valorEntregue: entregues._sum.valor || 0,
        emAndamento,
      },
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.body.nomeCompleto) {
      return res.status(400).json({ erro: 'Informe o "nomeCompleto" do entregador.' });
    }
    if (!req.body.tipoEntrega) {
      return res.status(400).json({ erro: 'Informe o "tipoEntrega" do entregador.' });
    }
    const data = dadosDoBody(req.body);
    if (req.body.senha) data.senhaHash = await bcrypt.hash(req.body.senha, 10);
    const entregador = await prisma.entregador.create({ data });
    await registrarStatusEntregador({ entregadorId: entregador.id, tipo: "CADASTRO", para: entregador.status, autor: autorDe(req) });
    res.status(201).json(semSenha(entregador));
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    // Status e bloqueio mudam só pelas rotas próprias (que registram o histórico).
    const entregador = await prisma.entregador.update({
      where: { id: req.params.id },
      data: omitir(dadosDoBody(req.body), ["status", "bloqueado"]),
    });
    res.json(semSenha(entregador));
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.entregador.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// PATCH /api/entregadores/:id/status  { status: "ATIVO" | "INATIVO" | "EM_ANALISE" } — aprovar / reprovar
router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!["EM_ANALISE", "ATIVO", "INATIVO"].includes(status)) {
      return res.status(400).json({ erro: "Status inválido." });
    }
    const atual = await prisma.entregador.findUnique({ where: { id: req.params.id } });
    if (!atual) return res.status(404).json({ erro: "Entregador não encontrado." });
    const data = { status };
    if (status !== "ATIVO") data.online = false;
    const entregador = await prisma.entregador.update({ where: { id: req.params.id }, data });
    await registrarStatusEntregador({ entregadorId: entregador.id, tipo: "STATUS", de: atual.status, para: status, autor: autorDe(req) });
    res.json(semSenha(entregador));
  })
);

// DELETE /api/entregadores/:id/bloqueios-loja/:comercioId — desfaz o bloqueio feito por uma loja
router.delete(
  "/:id/bloqueios-loja/:comercioId",
  asyncHandler(async (req, res) => {
    await prisma.comercioEntregadorBloqueio.deleteMany({ where: { entregadorId: req.params.id, comercioId: req.params.comercioId } });
    res.status(204).send();
  })
);

// PATCH /api/entregadores/:id/senha  { senha } — define/reseta a senha de acesso ao app
router.patch(
  "/:id/senha",
  asyncHandler(async (req, res) => {
    const { senha } = req.body;
    if (!senha || String(senha).length < 6) {
      return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres." });
    }
    const atual = await prisma.entregador.findUnique({ where: { id: req.params.id } });
    if (!atual) return res.status(404).json({ erro: "Entregador não encontrado." });
    if (!atual.email) return res.status(400).json({ erro: "Cadastre um e-mail para o entregador antes de liberar o acesso ao app." });

    const entregador = await prisma.entregador.update({
      where: { id: req.params.id },
      data: { senhaHash: await bcrypt.hash(senha, 10) },
    });
    res.json(semSenha(entregador));
  })
);

// PUT /api/entregadores/:id/comercios-permitidos  { comercioIds: [...] }
// Usado quando permissaoColeta = SOMENTE_SELECIONADOS.
router.put(
  "/:id/comercios-permitidos",
  asyncHandler(async (req, res) => {
    const comercioIds = Array.isArray(req.body.comercioIds) ? req.body.comercioIds : [];
    const entregadorId = req.params.id;
    await prisma.$transaction([
      prisma.entregadorComercioPermitido.deleteMany({ where: { entregadorId } }),
      prisma.entregadorComercioPermitido.createMany({
        data: comercioIds.map(comercioId => ({ entregadorId, comercioId })),
        skipDuplicates: true,
      }),
    ]);
    res.json({ comercioIds });
  })
);

// PATCH /api/entregadores/:id/bloquear — "Bloquear Entregador" (também o deixa offline)
// PATCH /api/entregadores/:id/liberar-aparelho — desconecta o celular logado; o entregador pode entrar em outro aparelho
router.patch(
  "/:id/liberar-aparelho",
  asyncHandler(async (req, res) => {
    const atual = await prisma.entregador.findUnique({ where: { id: req.params.id } });
    if (!atual) return res.status(404).json({ erro: "Entregador não encontrado." });
    const entregador = await prisma.entregador.update({ where: { id: req.params.id }, data: { aparelhoId: null, aparelhoNome: null, pushToken: null, online: false } });
    await registrarStatusEntregador({ entregadorId: entregador.id, tipo: "APARELHO", de: atual.aparelhoNome || "aparelho", para: "LIBERADO", autor: autorDe(req) }).catch(() => {});
    res.json(semSenha(entregador));
  })
);

router.patch(
  "/:id/bloquear",
  asyncHandler(async (req, res) => {
    const atual = await prisma.entregador.findUnique({ where: { id: req.params.id } });
    if (!atual) return res.status(404).json({ erro: "Entregador não encontrado." });
    const entregador = await prisma.entregador.update({
      where: { id: req.params.id },
      data: { bloqueado: true, online: false },
    });
    await registrarStatusEntregador({ entregadorId: entregador.id, tipo: "BLOQUEIO", de: atual.bloqueado ? "BLOQUEADO" : "LIBERADO", para: "BLOQUEADO", autor: autorDe(req) });
    res.json(semSenha(entregador));
  })
);

// PATCH /api/entregadores/:id/desbloquear
router.patch(
  "/:id/desbloquear",
  asyncHandler(async (req, res) => {
    const atual = await prisma.entregador.findUnique({ where: { id: req.params.id } });
    if (!atual) return res.status(404).json({ erro: "Entregador não encontrado." });
    const entregador = await prisma.entregador.update({
      where: { id: req.params.id },
      data: { bloqueado: false },
    });
    await registrarStatusEntregador({ entregadorId: entregador.id, tipo: "BLOQUEIO", de: atual.bloqueado ? "BLOQUEADO" : "LIBERADO", para: "LIBERADO", autor: autorDe(req) });
    res.json(semSenha(entregador));
  })
);

// POST /api/entregadores/import
// body: { csv: "nome_completo,cpf,rg,...\nFulano,111...,222...,..." }
// Cabeçalho esperado (mesmo usado no formulário):
// nome_completo, cpf, rg, data_nascimento, telefone, email, cep, rua, numero,
// complemento, bairro, cidade, veiculo_tipo, veiculo_modelo, veiculo_placa,
// veiculo_ano, cnh_valida, tipo_entrega, taxa_entrega, status
router.post(
  "/import",
  asyncHandler(async (req, res) => {
    const { csv } = req.body;
    if (!csv || typeof csv !== "string") {
      return res.status(400).json({ erro: 'Envie o conteúdo do CSV no campo "csv".' });
    }

    const linhas = csv.trim().split(/\r?\n/).map(l => l.split(","));
    if (linhas.length < 2) {
      return res.status(400).json({ erro: "O CSV não contém registros para importar." });
    }

    const header = linhas[0].map(h => h.trim());
    const mapaStatus = { "em análise": "EM_ANALISE", "ativo": "ATIVO", "inativo": "INATIVO" };
    const mapaTipoEntrega = { "próprio": "PROPRIO", "terceirizado": "TERCEIRIZADO", "parceiro": "PARCEIRO" };
    const mapaVeiculo = { "moto": "MOTO", "bike": "BIKE", "carro": "CARRO" };

    const registros = linhas.slice(1)
      .filter(l => l.length > 1 && l.some(c => c.trim()))
      .map(linha => {
        const obj = {};
        header.forEach((h, i) => { obj[h] = (linha[i] || "").trim(); });
        return {
          nomeCompleto: obj.nome_completo || "—",
          cpf: obj.cpf || null,
          rg: obj.rg || null,
          dataNascimento: obj.data_nascimento ? new Date(obj.data_nascimento) : null,
          telefone: obj.telefone || null,
          email: obj.email || null,
          cep: obj.cep || null,
          rua: obj.rua || null,
          numero: obj.numero || null,
          complemento: obj.complemento || null,
          bairro: obj.bairro || null,
          cidade: obj.cidade || null,
          veiculoTipo: mapaVeiculo[(obj.veiculo_tipo || "").toLowerCase()] || "MOTO",
          veiculoModelo: obj.veiculo_modelo || null,
          veiculoPlaca: obj.veiculo_placa || null,
          veiculoAno: obj.veiculo_ano || null,
          cnhValida: (obj.cnh_valida || "").toLowerCase() !== "não" && (obj.cnh_valida || "").toLowerCase() !== "nao",
          tipoEntrega: mapaTipoEntrega[(obj.tipo_entrega || "").toLowerCase()] || "PROPRIO",
          taxaEntrega: obj.taxa_entrega ? parseFloat(obj.taxa_entrega.replace(",", ".")) : null,
          status: mapaStatus[(obj.status || "").toLowerCase()] || "EM_ANALISE",
        };
      });

    const criados = await prisma.$transaction(
      registros.map(dados => prisma.entregador.create({ data: dados }))
    );

    res.status(201).json({ importados: criados.length, entregadores: semSenha(criados) });
  })
);

module.exports = router;
