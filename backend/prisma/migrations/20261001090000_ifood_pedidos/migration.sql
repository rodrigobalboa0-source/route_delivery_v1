-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "codigoExterno" TEXT,
ADD COLUMN     "exigeCodigoEntrega" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "IntegracaoEventoRecebido" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegracaoEventoRecebido_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegracaoEventoRecebido_createdAt_idx" ON "IntegracaoEventoRecebido"("createdAt");
