-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN     "empresaDocumento" TEXT,
ADD COLUMN     "empresaEmail" TEXT,
ADD COLUMN     "empresaEndereco" TEXT,
ADD COLUMN     "empresaNome" TEXT,
ADD COLUMN     "empresaTelefone" TEXT;

-- AlterTable
ALTER TABLE "Fatura" ADD COLUMN     "formaPagamento" TEXT,
ADD COLUMN     "numero" SERIAL NOT NULL,
ADD COLUMN     "observacao" TEXT,
ADD COLUMN     "periodoFim" TIMESTAMP(3),
ADD COLUMN     "periodoInicio" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "acertoId" TEXT,
ADD COLUMN     "comissaoEntregador" DOUBLE PRECISION,
ADD COLUMN     "faturaId" TEXT;

-- CreateTable
CREATE TABLE "AcertoEntregador" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "entregadorId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "entregas" INTEGER NOT NULL,
    "valorComissao" DOUBLE PRECISION NOT NULL,
    "ajustes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "descricaoAjustes" TEXT,
    "valorTotal" DOUBLE PRECISION NOT NULL,
    "pago" BOOLEAN NOT NULL DEFAULT false,
    "pagoEm" TIMESTAMP(3),
    "formaPagamento" TEXT,
    "observacao" TEXT,
    "autorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcertoEntregador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaPagar" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "descricao" TEXT NOT NULL,
    "favorecido" TEXT,
    "categoria" TEXT NOT NULL DEFAULT 'OUTROS',
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "paga" BOOLEAN NOT NULL DEFAULT false,
    "pagaEm" TIMESTAMP(3),
    "formaPagamento" TEXT,
    "observacao" TEXT,
    "acertoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditoMovimento" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT NOT NULL,
    "autorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditoMovimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recibo" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "pessoaNome" TEXT NOT NULL,
    "pessoaDocumento" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "referente" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "formaPagamento" TEXT,
    "origemTipo" TEXT,
    "origemId" TEXT,
    "autorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recibo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcertoEntregador_numero_key" ON "AcertoEntregador"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_numero_key" ON "ContaPagar"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_acertoId_key" ON "ContaPagar"("acertoId");

-- CreateIndex
CREATE INDEX "CreditoMovimento_comercioId_createdAt_idx" ON "CreditoMovimento"("comercioId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Recibo_numero_key" ON "Recibo"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_numero_key" ON "Fatura"("numero");

-- CreateIndex
CREATE INDEX "Pedido_entregadorId_entregueEm_idx" ON "Pedido"("entregadorId", "entregueEm");

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Fatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_acertoId_fkey" FOREIGN KEY ("acertoId") REFERENCES "AcertoEntregador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcertoEntregador" ADD CONSTRAINT "AcertoEntregador_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_acertoId_fkey" FOREIGN KEY ("acertoId") REFERENCES "AcertoEntregador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditoMovimento" ADD CONSTRAINT "CreditoMovimento_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
