-- AlterTable
ALTER TABLE "ContaPagar" ADD COLUMN     "comissaoManualId" TEXT;

-- CreateTable
CREATE TABLE "ComissaoManual" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "beneficiarioTipo" TEXT NOT NULL,
    "entregadorId" TEXT,
    "contaGerencialId" TEXT,
    "beneficiarioNome" TEXT NOT NULL,
    "comercioId" TEXT,
    "comercioNome" TEXT NOT NULL,
    "quantidadeEntregas" INTEGER NOT NULL,
    "valorPorEntrega" DOUBLE PRECISION,
    "valor" DOUBLE PRECISION NOT NULL,
    "referencia" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT,
    "autorNome" TEXT,
    "vistoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComissaoManual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComissaoManual_numero_key" ON "ComissaoManual"("numero");

-- CreateIndex
CREATE INDEX "ComissaoManual_entregadorId_referencia_idx" ON "ComissaoManual"("entregadorId", "referencia");

-- CreateIndex
CREATE INDEX "ComissaoManual_referencia_idx" ON "ComissaoManual"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_comissaoManualId_key" ON "ContaPagar"("comissaoManualId");

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_comissaoManualId_fkey" FOREIGN KEY ("comissaoManualId") REFERENCES "ComissaoManual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoManual" ADD CONSTRAINT "ComissaoManual_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoManual" ADD CONSTRAINT "ComissaoManual_contaGerencialId_fkey" FOREIGN KEY ("contaGerencialId") REFERENCES "ContaGerencial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoManual" ADD CONSTRAINT "ComissaoManual_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
