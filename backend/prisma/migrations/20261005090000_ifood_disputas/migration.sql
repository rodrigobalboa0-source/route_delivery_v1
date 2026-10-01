-- CreateTable
CREATE TABLE "IfoodDisputa" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "pedidoId" TEXT,
    "acao" TEXT,
    "tipo" TEXT,
    "mensagem" TEXT,
    "alternativas" JSONB,
    "dados" JSONB,
    "expiraEm" TIMESTAMP(3),
    "acaoNoPrazo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "resposta" TEXT,
    "respondidoPor" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IfoodDisputa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IfoodDisputa_disputeId_key" ON "IfoodDisputa"("disputeId");

-- CreateIndex
CREATE INDEX "IfoodDisputa_status_expiraEm_idx" ON "IfoodDisputa"("status", "expiraEm");

-- CreateIndex
CREATE INDEX "IfoodDisputa_pedidoId_idx" ON "IfoodDisputa"("pedidoId");

-- AddForeignKey
ALTER TABLE "IfoodDisputa" ADD CONSTRAINT "IfoodDisputa_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
