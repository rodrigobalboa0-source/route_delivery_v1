-- CreateEnum
CREATE TYPE "CargoConta" AS ENUM ('ADMINISTRADOR', 'FINANCEIRO', 'SUPORTE', 'OPERACOES');

-- CreateEnum
CREATE TYPE "PermissaoConta" AS ENUM ('TOTAL', 'FINANCEIRO', 'OPERACIONAL', 'LEITURA');

-- CreateEnum
CREATE TYPE "Veiculo" AS ENUM ('MOTO', 'BIKE', 'CARRO');

-- CreateEnum
CREATE TYPE "TipoPrecificacaoModal" AS ENUM ('PADRAO', 'ZONA', 'BAIRRO', 'DISTANCIA', 'ZERAR');

-- CreateEnum
CREATE TYPE "TipoDocumentoComercio" AS ENUM ('CPF', 'CNPJ');

-- CreateEnum
CREATE TYPE "CadastroVia" AS ENUM ('SISTEMA_DO_COMERCIANTE', 'APP_DO_COMERCIANTE', 'PAINEL_ADMIN', 'IMPORTACAO');

-- CreateEnum
CREATE TYPE "TipoEntregaEntregador" AS ENUM ('PROPRIO', 'TERCEIRIZADO', 'PARCEIRO');

-- CreateEnum
CREATE TYPE "StatusEntregador" AS ENUM ('EM_ANALISE', 'ATIVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "PermissaoColeta" AS ENUM ('TODOS_CLIENTES', 'SOMENTE_SELECIONADOS');

-- CreateEnum
CREATE TYPE "StatusPedido" AS ENUM ('PREPARANDO', 'PENDENTE', 'EM_ROTA', 'ENTREGUE', 'ATRASADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoCalculoTabela" AS ENUM ('DESLOCAMENTO', 'FIXO');

-- CreateEnum
CREATE TYPE "TipoRetornoTabela" AS ENUM ('PORCENTAGEM', 'VALOR_FIXO');

-- CreateEnum
CREATE TYPE "NivelDemanda" AS ENUM ('BAIXA', 'NORMAL', 'ALTA', 'MUITO_ALTA');

-- CreateEnum
CREATE TYPE "TipoPromocao" AS ENUM ('DESCONTO_PERCENTUAL', 'CUPOM_FIXO', 'FRETE_GRATIS');

-- CreateEnum
CREATE TYPE "TipoConversa" AS ENUM ('CLIENTE', 'ENTREGADOR');

-- CreateEnum
CREATE TYPE "RemetenteMensagem" AS ENUM ('NOS', 'ELES');

-- CreateTable
CREATE TABLE "ContaGerencial" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" "CargoConta" NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "permissao" "PermissaoConta" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaGerencial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Franquia" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Franquia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hub" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Hub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comercio" (
    "id" TEXT NOT NULL,
    "fotoUrl" TEXT,
    "segmento" TEXT,
    "dataInicio" TIMESTAMP(3),
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT NOT NULL,
    "tabelaComissaoId" TEXT,
    "cadastroVia" "CadastroVia",
    "tipoDocumento" "TipoDocumentoComercio" NOT NULL DEFAULT 'CNPJ',
    "documento" TEXT,
    "franquia" TEXT,
    "hub" TEXT,
    "leadCadastradoPor" TEXT,
    "nomeCompleto" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "telefone" TEXT,
    "email" TEXT,
    "metodoPagamento" TEXT,
    "observacoes" TEXT,
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comercio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComercioEndereco" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "rua" TEXT NOT NULL,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "cep" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "principal" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ComercioEndereco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecificacaoModal" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "veiculo" "Veiculo" NOT NULL,
    "precoPorPonto" DOUBLE PRECISION,
    "tipoPrecificacao" "TipoPrecificacaoModal" NOT NULL DEFAULT 'PADRAO',
    "tabelaPrecoKmId" TEXT,

    CONSTRAINT "PrecificacaoModal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComercioUsuario" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,

    CONSTRAINT "ComercioUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entregador" (
    "id" TEXT NOT NULL,
    "fotoUrl" TEXT,
    "nomeCompleto" TEXT NOT NULL,
    "cpf" TEXT,
    "rg" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "telefone" TEXT,
    "email" TEXT,
    "senhaHash" TEXT,
    "cep" TEXT,
    "rua" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "veiculoTipo" "Veiculo" NOT NULL DEFAULT 'MOTO',
    "veiculoModelo" TEXT,
    "veiculoPlaca" TEXT,
    "veiculoAno" TEXT,
    "cnhValida" BOOLEAN NOT NULL DEFAULT true,
    "fotoCnhUrl" TEXT,
    "comprovanteResidenciaUrl" TEXT,
    "documentoVeiculoUrl" TEXT,
    "tipoEntrega" "TipoEntregaEntregador" NOT NULL,
    "status" "StatusEntregador" NOT NULL DEFAULT 'EM_ANALISE',
    "prioridadeBusca" INTEGER,
    "taxaEntrega" DOUBLE PRECISION,
    "permissaoColeta" "PermissaoColeta" NOT NULL DEFAULT 'TODOS_CLIENTES',
    "bloqueado" BOOLEAN NOT NULL DEFAULT false,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "localizacaoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entregador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntregadorComercioPermitido" (
    "id" TEXT NOT NULL,
    "entregadorId" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,

    CONSTRAINT "EntregadorComercioPermitido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoOperacional" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "regiao" TEXT,
    "responsavel" TEXT,
    "capacidade" INTEGER,

    CONSTRAINT "GrupoOperacional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Modal" (
    "id" TEXT NOT NULL,
    "nome" "Veiculo" NOT NULL,
    "capacidadeCargaKg" DOUBLE PRECISION,
    "taxaBase" DOUBLE PRECISION,

    CONSTRAINT "Modal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaPrecoKm" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipoCalculo" "TipoCalculoTabela" NOT NULL DEFAULT 'DESLOCAMENTO',
    "kmAdicional" DOUBLE PRECISION,
    "tipoRetorno" "TipoRetornoTabela" NOT NULL DEFAULT 'PORCENTAGEM',
    "retorno" DOUBLE PRECISION,
    "valorMinimo" DOUBLE PRECISION,
    "valorPorPonto" DOUBLE PRECISION,
    "valorMultiplo" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TabelaPrecoKm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TabelaComissao" (
    "id" TEXT NOT NULL,
    "categoria" "Veiculo" NOT NULL,
    "percentual" DOUBLE PRECISION NOT NULL,
    "valorMinimo" DOUBLE PRECISION,

    CONSTRAINT "TabelaComissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecificacaoPadrao" (
    "id" TEXT NOT NULL,
    "taxaBase" DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    "valorMinimo" DOUBLE PRECISION NOT NULL DEFAULT 12.0,
    "taxaPorKm" DOUBLE PRECISION NOT NULL DEFAULT 1.8,
    "taxaServico" DOUBLE PRECISION NOT NULL DEFAULT 8.0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrecificacaoPadrao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecoEspera" (
    "id" TEXT NOT NULL,
    "tolerancia" INTEGER NOT NULL DEFAULT 5,
    "valorMinuto" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "limiteMaximo" INTEGER NOT NULL DEFAULT 30,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrecoEspera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecoDinamicoDemanda" (
    "id" TEXT NOT NULL,
    "nivel" "NivelDemanda" NOT NULL,
    "multiplicador" DOUBLE PRECISION NOT NULL,
    "horario" TEXT,

    CONSTRAINT "PrecoDinamicoDemanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecoDinamicoEntregador" (
    "id" TEXT NOT NULL,
    "nivel" "NivelDemanda" NOT NULL,
    "bonus" DOUBLE PRECISION NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PrecoDinamicoEntregador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicoOpcional" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ServicoOpcional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promocao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPromocao" NOT NULL,
    "valor" TEXT,
    "validade" TIMESTAMP(3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Promocao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "clienteTelefone" TEXT,
    "endereco" TEXT NOT NULL,
    "latDestino" DOUBLE PRECISION,
    "lngDestino" DOUBLE PRECISION,
    "comercioId" TEXT NOT NULL,
    "entregadorId" TEXT,
    "status" "StatusPedido" NOT NULL DEFAULT 'PREPARANDO',
    "valor" DOUBLE PRECISION,
    "distanciaKm" DOUBLE PRECISION,
    "formaPagamento" TEXT,
    "prazoDesejado" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoLog" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fatura" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT,
    "descricao" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "paga" BOOLEAN NOT NULL DEFAULT false,
    "pagaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoConversa" NOT NULL,
    "naoLida" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "de" "RemetenteMensagem" NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacao" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracao" (
    "id" TEXT NOT NULL,
    "notificacoesPush" BOOLEAN NOT NULL DEFAULT true,
    "notificacoesEmail" BOOLEAN NOT NULL DEFAULT true,
    "notificacoesSms" BOOLEAN NOT NULL DEFAULT false,
    "atribuicaoAutomatica" BOOLEAN NOT NULL DEFAULT true,
    "raioMaximoKm" DOUBLE PRECISION NOT NULL DEFAULT 8,

    CONSTRAINT "Configuracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaGerencial_email_key" ON "ContaGerencial"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PrecificacaoModal_comercioId_veiculo_key" ON "PrecificacaoModal"("comercioId", "veiculo");

-- CreateIndex
CREATE UNIQUE INDEX "ComercioUsuario_email_key" ON "ComercioUsuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Entregador_email_key" ON "Entregador"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EntregadorComercioPermitido_entregadorId_comercioId_key" ON "EntregadorComercioPermitido"("entregadorId", "comercioId");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_codigo_key" ON "Pedido"("codigo");

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaGerencial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comercio" ADD CONSTRAINT "Comercio_tabelaComissaoId_fkey" FOREIGN KEY ("tabelaComissaoId") REFERENCES "TabelaComissao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComercioEndereco" ADD CONSTRAINT "ComercioEndereco_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecificacaoModal" ADD CONSTRAINT "PrecificacaoModal_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecificacaoModal" ADD CONSTRAINT "PrecificacaoModal_tabelaPrecoKmId_fkey" FOREIGN KEY ("tabelaPrecoKmId") REFERENCES "TabelaPrecoKm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComercioUsuario" ADD CONSTRAINT "ComercioUsuario_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregadorComercioPermitido" ADD CONSTRAINT "EntregadorComercioPermitido_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregadorComercioPermitido" ADD CONSTRAINT "EntregadorComercioPermitido_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoLog" ADD CONSTRAINT "PedidoLog_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
