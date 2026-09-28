-- AlterTable
ALTER TABLE "AcertoEntregador" ADD COLUMN     "comissoesAutomaticas" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ComissaoManual" ADD COLUMN     "acertoId" TEXT,
ADD COLUMN     "origem" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "pedidoId" TEXT;

-- AlterTable
ALTER TABLE "Entregador" ADD COLUMN     "comissaoAutoAtiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "comissaoAutoValor" DOUBLE PRECISION;

-- CreateIndex
CREATE UNIQUE INDEX "ComissaoManual_pedidoId_key" ON "ComissaoManual"("pedidoId");

-- AddForeignKey
ALTER TABLE "ComissaoManual" ADD CONSTRAINT "ComissaoManual_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComissaoManual" ADD CONSTRAINT "ComissaoManual_acertoId_fkey" FOREIGN KEY ("acertoId") REFERENCES "AcertoEntregador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
