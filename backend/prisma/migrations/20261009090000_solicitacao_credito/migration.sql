-- CreateTable
CREATE TABLE "CreditoSolicitacao" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "metodo" TEXT NOT NULL,
    "comprovante" TEXT NOT NULL,
    "observacao" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "motivo" TEXT,
    "analisadoPor" TEXT,
    "analisadoEm" TIMESTAMP(3),
    "movimentoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditoSolicitacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditoSolicitacao_status_createdAt_idx" ON "CreditoSolicitacao"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CreditoSolicitacao_comercioId_createdAt_idx" ON "CreditoSolicitacao"("comercioId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditoSolicitacao" ADD CONSTRAINT "CreditoSolicitacao_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
