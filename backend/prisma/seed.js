require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const SENHA_DEMO = "demo1234";

function diasAtras(n, hora = 12) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hora, Math.floor(Math.random() * 60), 0, 0);
  return d;
}

async function main() {
  console.log("Populando banco de dados...");

  // ---- Conta administradora ----
  const emailAdmin = process.env.SEED_ADMIN_EMAIL || "admin@routedelivery.com";
  const senhaAdmin = process.env.SEED_ADMIN_SENHA || "trocar123";
  await prisma.contaGerencial.upsert({
    where: { email: emailAdmin },
    update: {},
    create: {
      nome: "Carla Menezes",
      cargo: "ADMINISTRADOR",
      email: emailAdmin,
      senhaHash: await bcrypt.hash(senhaAdmin, 10),
      permissao: "TOTAL",
    },
  });

  // ---- Precificação padrão e preço por espera (singletons) ----
  if (!(await prisma.precificacaoPadrao.findFirst())) {
    await prisma.precificacaoPadrao.create({
      data: { taxaBase: 6.0, valorMinimo: 12.0, taxaPorKm: 1.8, taxaServico: 8.0 },
    });
  }
  if (!(await prisma.precoEspera.findFirst())) {
    await prisma.precoEspera.create({ data: { tolerancia: 5, valorMinuto: 0.5, limiteMaximo: 30 } });
  }
  if (!(await prisma.configuracao.findFirst())) {
    await prisma.configuracao.create({ data: {} });
  }

  // Dados de demonstração só na primeira execução.
  if ((await prisma.comercio.count()) > 0) {
    console.log("Já existem comércios cadastrados — dados de demonstração não foram recriados.");
    console.log(`Login administrador: ${emailAdmin} / senha: ${senhaAdmin}`);
    return;
  }

  const senhaDemoHash = await bcrypt.hash(SENHA_DEMO, 10);

  // ---- Tabelas de preço por KM ----
  const tabelaMinima = await prisma.tabelaPrecoKm.create({
    data: {
      nome: "TABELA MINIMA $12",
      tipoCalculo: "FIXO",
      tipoRetorno: "VALOR_FIXO",
      retorno: 12.0,
      valorMinimo: 12.0,
      valorPorPonto: 2.0,
      valorMultiplo: 5.0,
    },
  });
  await prisma.tabelaPrecoKm.create({
    data: {
      nome: "TABELA PADRÃO CAMPINAS $10,50",
      tipoCalculo: "DESLOCAMENTO",
      kmAdicional: 1.2,
      tipoRetorno: "PORCENTAGEM",
      retorno: 18,
      valorMinimo: 10.5,
      valorPorPonto: 1.8,
      valorMultiplo: 4.0,
    },
  });

  // ---- Tabelas de comissão ----
  const comissaoMoto = await prisma.tabelaComissao.create({ data: { categoria: "MOTO", percentual: 15, valorMinimo: 2.0 } });
  await prisma.tabelaComissao.create({ data: { categoria: "BIKE", percentual: 12, valorMinimo: 1.5 } });

  // ---- Modais / franquias / hubs ----
  await prisma.modal.createMany({
    data: [
      { nome: "MOTO", capacidadeCargaKg: 25, taxaBase: 6 },
      { nome: "BIKE", capacidadeCargaKg: 10, taxaBase: 4.5 },
      { nome: "CARRO", capacidadeCargaKg: 200, taxaBase: 12 },
    ],
  });
  await prisma.franquia.create({ data: { nome: "Route São Paulo Centro" } });
  await prisma.hub.create({ data: { nome: "Hub Vila Mariana" } });

  // ---- Comércios (com endereço + coordenadas reais, para o cálculo de rota) ----
  const restaurante = await prisma.comercio.create({
    data: {
      nomeFantasia: "Restaurante Sabor Real",
      segmento: "Comida Variada",
      telefone: "(11) 98211-0043",
      email: "contato@saborreal.com.br",
      tipoDocumento: "CNPJ",
      documento: "12.345.678/0001-90",
      cadastroVia: "PAINEL_ADMIN",
      tabelaComissaoId: comissaoMoto.id,
      enderecos: {
        create: [{ rua: "Rua Vergueiro", numero: "500", bairro: "Vila Mariana", cidade: "São Paulo", lat: -23.589, lng: -46.642, principal: true }],
      },
      precificacoesModal: {
        create: [
          { veiculo: "MOTO", precoPorPonto: 6.0, tipoPrecificacao: "PADRAO", tabelaPrecoKmId: tabelaMinima.id },
          { veiculo: "BIKE", precoPorPonto: 4.5, tipoPrecificacao: "PADRAO" },
        ],
      },
      // Login do sistema do comerciante
      usuariosAdicionais: { create: [{ email: "loja@saborreal.com.br", senhaHash: senhaDemoHash }] },
    },
  });

  const farmacia = await prisma.comercio.create({
    data: {
      nomeFantasia: "Farmácia Bem Estar",
      segmento: "Farmácia",
      telefone: "(11) 97733-2210",
      tipoDocumento: "CNPJ",
      cadastroVia: "APP_DO_COMERCIANTE",
      enderecos: {
        create: [{ rua: "Rua Haddock Lobo", numero: "780", bairro: "Jardins", cidade: "São Paulo", lat: -23.567, lng: -46.67, principal: true }],
      },
      usuariosAdicionais: { create: [{ email: "farmacia@bemestar.com.br", senhaHash: senhaDemoHash }] },
    },
  });

  const padaria = await prisma.comercio.create({
    data: {
      nomeFantasia: "Padaria Boa Vista",
      segmento: "Doces",
      enderecos: {
        create: [{ rua: "Rua Augusta", numero: "2000", bairro: "Consolação", cidade: "São Paulo", lat: -23.5559, lng: -46.6551, principal: true }],
      },
    },
  });

  await prisma.comercio.create({
    data: {
      nomeFantasia: "Mercado Vila Nova",
      segmento: "Mercado",
      bloqueado: true,
      observacoes: "Bloqueado por inadimplência (exemplo).",
      enderecos: {
        create: [{ rua: "Rua do Ipiranga", numero: "300", bairro: "Ipiranga", cidade: "São Paulo", lat: -23.591, lng: -46.61, principal: true }],
      },
    },
  });

  // ---- Entregadores (com login no app) ----
  const diego = await prisma.entregador.create({
    data: {
      nomeCompleto: "Diego Alves",
      email: "diego@entregador.com",
      senhaHash: senhaDemoHash,
      telefone: "(11) 96654-8821",
      veiculoTipo: "MOTO",
      veiculoPlaca: "FTR-2B19",
      tipoEntrega: "PROPRIO",
      status: "ATIVO",
      prioridadeBusca: 8,
      taxaEntrega: 7.5,
      cnhValida: true,
      online: true,
      lat: -23.5805,
      lng: -46.6395,
      localizacaoEm: new Date(),
    },
  });
  const fabiana = await prisma.entregador.create({
    data: {
      nomeCompleto: "Fabiana Reis",
      email: "fabiana@entregador.com",
      senhaHash: senhaDemoHash,
      telefone: "(11) 95521-7743",
      veiculoTipo: "BIKE",
      tipoEntrega: "PARCEIRO",
      status: "ATIVO",
      prioridadeBusca: 6,
      taxaEntrega: 5,
      cnhValida: false,
      online: true,
      lat: -23.5631,
      lng: -46.6544,
      localizacaoEm: new Date(),
    },
  });
  await prisma.entregador.create({
    data: {
      nomeCompleto: "Paulo Cesar",
      email: "paulo@entregador.com",
      senhaHash: senhaDemoHash,
      veiculoTipo: "CARRO",
      tipoEntrega: "TERCEIRIZADO",
      status: "EM_ANALISE",
      cnhValida: true,
    },
  });

  // ---- Histórico de cadastro dos entregadores (relatório de alteração de status) ----
  const admin = { autorTipo: "ADMIN", autorNome: "Carla Menezes" };
  for (const e of [diego, fabiana]) {
    await prisma.entregadorStatusHistorico.createMany({
      data: [
        { entregadorId: e.id, tipo: "CADASTRO", para: "EM_ANALISE", autorTipo: "ENTREGADOR", autorNome: e.nomeCompleto, createdAt: diasAtras(20, 9) },
        { entregadorId: e.id, tipo: "STATUS", de: "EM_ANALISE", para: "ATIVO", ...admin, createdAt: diasAtras(19, 11) },
        { entregadorId: e.id, tipo: "ONLINE", de: "OFFLINE", para: "ONLINE", autorTipo: "ENTREGADOR", autorNome: e.nomeCompleto, createdAt: diasAtras(0, 9) },
      ],
    });
  }

  // ---- Pedidos (histórico dos últimos 14 dias + alguns em andamento) ----
  // Clientes com telefone fixo por pessoa, para o relatório de recorrência.
  const clientes = [
    ["Marcela Ito", "(11) 98111-2233"], ["Renato Souza", "(11) 97222-3344"], ["Aline Duarte", "(11) 96333-4455"],
    ["Bruno Lima", "(11) 95444-5566"], ["Camila Rocha", "(11) 94555-6677"], ["Tiago Nunes", "(11) 93666-7788"],
    ["Júlia Prado", "(11) 92777-8899"], ["Eduardo Faria", "(11) 91888-9900"],
  ];
  const ruas = [
    ["Rua Vergueiro, 1200 - Vila Mariana", -23.5818, -46.6396], ["Av. Paulista, 900 - Bela Vista", -23.5655, -46.6523],
    ["Rua Bela Cintra, 900 - Consolação", -23.5577, -46.6624], ["Rua Domingos de Morais, 2100 - Vila Mariana", -23.5951, -46.6364],
    ["Alameda Santos, 450 - Jardins", -23.5690, -46.6476], ["Rua Frei Caneca, 300 - Consolação", -23.5538, -46.6540],
  ];
  const comercios = [restaurante, farmacia, padaria];
  const entregadores = [diego, fabiana];
  const sorteio = lista => lista[Math.floor(Math.random() * lista.length)];
  const mais = (d, min) => new Date(d.getTime() + min * 60000);
  const entre = (a, b) => a + Math.random() * (b - a);

  let numero = 40000;
  for (let dia = 14; dia >= 1; dia--) {
    const quantidade = 3 + Math.floor(Math.random() * 6);
    for (let i = 0; i < quantidade; i++) {
      const criadoEm = diasAtras(dia, 10 + Math.floor(Math.random() * 11));
      const cancelado = Math.random() >= 0.88;
      const [clienteNome, clienteTelefone] = sorteio(clientes);
      const [endereco, latDestino, lngDestino] = sorteio(ruas);
      const entregador = cancelado ? null : sorteio(entregadores);
      const distanciaKm = Number((1 + Math.random() * 7).toFixed(2));
      // Etapas com tempos plausíveis: preparo 8–25 min, espera 1–12 min, entrega 10–35 min.
      const prontoEm = mais(criadoEm, entre(8, 25));
      const aceitoEm = cancelado ? null : mais(prontoEm, entre(1, 12));
      const entregueEm = cancelado ? null : mais(aceitoEm, entre(10, 35));
      const canceladoEm = cancelado ? mais(prontoEm, entre(3, 20)) : null;
      const temNota = Math.random() < 0.6;
      const origem = Math.random() < 0.7 ? "SISTEMA_COMERCIANTE" : "PAINEL_ADMIN";
      const comercio = sorteio(comercios);
      const autorComercio = { autorTipo: origem === "PAINEL_ADMIN" ? "ADMIN" : "COMERCIANTE", autorNome: origem === "PAINEL_ADMIN" ? "Carla Menezes" : comercio.nomeFantasia };

      await prisma.pedido.create({
        data: {
          codigo: `PD-${numero}`,
          clienteNome, clienteTelefone, endereco, latDestino, lngDestino,
          comercioId: comercio.id,
          entregadorId: entregador?.id ?? null,
          status: cancelado ? "CANCELADO" : "ENTREGUE",
          origem,
          valor: Number(Math.max(6 + 1.8 * distanciaKm, 12).toFixed(2)),
          distanciaKm,
          notaFiscalNumero: temNota ? String(10000 + numero) : null,
          notaFiscalValor: temNota ? Number(entre(30, 250).toFixed(2)) : null,
          prontoEm, aceitoEm, entregueEm, canceladoEm,
          createdAt: criadoEm,
          updatedAt: entregueEm || canceladoEm,
          historicoStatus: {
            create: [
              { de: null, para: "PREPARANDO", ...autorComercio, createdAt: criadoEm },
              { de: "PREPARANDO", para: "PENDENTE", ...autorComercio, createdAt: prontoEm },
              ...(cancelado
                ? [{ de: "PENDENTE", para: "CANCELADO", ...autorComercio, createdAt: canceladoEm }]
                : [
                    { de: "PENDENTE", para: "EM_ROTA", entregadorId: entregador.id, autorTipo: "ENTREGADOR", autorNome: entregador.nomeCompleto, createdAt: aceitoEm },
                    { de: "EM_ROTA", para: "ENTREGUE", entregadorId: entregador.id, autorTipo: "ENTREGADOR", autorNome: entregador.nomeCompleto, createdAt: entregueEm },
                  ]),
            ],
          },
        },
      });
      numero++;
    }
  }

  // ---- Rastro de GPS de hoje (relatório de trajeto) ----
  const trilhas = {
    [diego.id]: [[-23.5890, -46.6420], [-23.5870, -46.6410], [-23.5850, -46.6402], [-23.5832, -46.6398], [-23.5818, -46.6396], [-23.5805, -46.6395]],
    [fabiana.id]: [[-23.5700, -46.6460], [-23.5680, -46.6490], [-23.5660, -46.6515], [-23.5645, -46.6530], [-23.5631, -46.6544]],
  };
  for (const [entregadorId, pontos] of Object.entries(trilhas)) {
    await prisma.entregadorLocalizacao.createMany({
      data: pontos.map(([lat, lng], i) => ({ entregadorId, lat, lng, createdAt: new Date(Date.now() - (pontos.length - i) * 4 * 60000) })),
    });
  }

  await prisma.pedido.create({
    data: {
      codigo: "PD-4471",
      clienteNome: "Marcela Ito",
      endereco: "Rua Vergueiro, 1200 - Vila Mariana",
      comercioId: restaurante.id,
      entregadorId: diego.id,
      status: "EM_ROTA",
      origem: "SISTEMA_COMERCIANTE",
      valor: 14.9,
      distanciaKm: 3.2,
      latDestino: -23.5818,
      lngDestino: -46.6396,
      prontoEm: new Date(Date.now() - 20 * 60000),
      aceitoEm: new Date(Date.now() - 15 * 60000),
      logs: { create: [{ texto: "Pedido criado e enviado para despacho." }, { texto: "Diego Alves aceitou a corrida." }] },
      historicoStatus: {
        create: [
          { de: null, para: "PREPARANDO", autorTipo: "COMERCIANTE", autorNome: restaurante.nomeFantasia, createdAt: new Date(Date.now() - 35 * 60000) },
          { de: "PREPARANDO", para: "PENDENTE", autorTipo: "COMERCIANTE", autorNome: restaurante.nomeFantasia, createdAt: new Date(Date.now() - 20 * 60000) },
          { de: "PENDENTE", para: "EM_ROTA", entregadorId: diego.id, autorTipo: "ENTREGADOR", autorNome: diego.nomeCompleto, createdAt: new Date(Date.now() - 15 * 60000) },
        ],
      },
    },
  });
  await prisma.pedido.create({
    data: {
      codigo: "PD-4472",
      clienteNome: "Aline Duarte",
      endereco: "Rua Bela Cintra, 900 - Consolação",
      comercioId: restaurante.id,
      status: "PREPARANDO",
      origem: "SISTEMA_COMERCIANTE",
      valor: 13.5,
      logs: { create: [{ texto: "Pedido criado e enviado para preparo." }] },
      historicoStatus: { create: [{ de: null, para: "PREPARANDO", autorTipo: "COMERCIANTE", autorNome: restaurante.nomeFantasia }] },
    },
  });
  await prisma.pedido.create({
    data: {
      codigo: "PD-4473",
      clienteNome: "Bruno Lima",
      endereco: "Alameda Santos, 450 - Jardins",
      comercioId: farmacia.id,
      status: "PENDENTE",
      origem: "SISTEMA_COMERCIANTE",
      valor: 12.0,
      distanciaKm: 1.4,
      prontoEm: new Date(Date.now() - 25 * 60 * 1000),
      updatedAt: new Date(Date.now() - 25 * 60 * 1000),
      logs: { create: [{ texto: "Pedido criado." }, { texto: "Comércio marcou o pedido como pronto — liberado para entregadores." }] },
      historicoStatus: {
        create: [
          { de: null, para: "PREPARANDO", autorTipo: "COMERCIANTE", autorNome: farmacia.nomeFantasia, createdAt: new Date(Date.now() - 40 * 60000) },
          { de: "PREPARANDO", para: "PENDENTE", autorTipo: "COMERCIANTE", autorNome: farmacia.nomeFantasia, createdAt: new Date(Date.now() - 25 * 60000) },
        ],
      },
    },
  });

  // ---- Faturas ----
  await prisma.fatura.createMany({
    data: [
      { comercioId: restaurante.id, descricao: "Entregas — quinzena anterior", vencimento: diasAtras(-5), valor: 842.3 },
      { comercioId: farmacia.id, descricao: "Entregas — quinzena anterior", vencimento: diasAtras(3), valor: 516.0 },
      { comercioId: padaria.id, descricao: "Entregas — mês anterior", vencimento: diasAtras(20), valor: 310.4, paga: true, pagaEm: diasAtras(22) },
    ],
  });

  // ---- Conversas / mensagens ----
  await prisma.conversa.create({
    data: {
      nome: "Marcela Ito",
      tipo: "CLIENTE",
      naoLida: true,
      mensagens: { create: [{ de: "ELES", texto: "O pedido já saiu para entrega?" }] },
    },
  });
  await prisma.conversa.create({
    data: {
      nome: "Diego Alves (entregador)",
      tipo: "ENTREGADOR",
      naoLida: true,
      mensagens: { create: [{ de: "ELES", texto: "Cheguei no endereço, ninguém atende." }] },
    },
  });

  // ---- Notificações de exemplo ----
  await prisma.notificacao.createMany({
    data: [
      { tipo: "cadastro", texto: "Novo entregador aguardando aprovação: Paulo Cesar." },
      { tipo: "financeiro", texto: "Fatura da Farmácia Bem Estar está vencida." },
    ],
  });

  console.log("Banco de dados populado com sucesso.");
  console.log(`Painel ADM:       ${emailAdmin} / ${senhaAdmin}`);
  console.log(`Comerciante:      loja@saborreal.com.br / ${SENHA_DEMO}`);
  console.log(`App entregador:   diego@entregador.com / ${SENHA_DEMO}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
