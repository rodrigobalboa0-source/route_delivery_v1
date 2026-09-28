-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "aceitoEm" TIMESTAMP(3),
ADD COLUMN     "canceladoEm" TIMESTAMP(3),
ADD COLUMN     "entregueEm" TIMESTAMP(3),
ADD COLUMN     "notaFiscalChave" TEXT,
ADD COLUMN     "notaFiscalNumero" TEXT,
ADD COLUMN     "notaFiscalValor" DOUBLE PRECISION,
ADD COLUMN     "prontoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EntregadorStatusHistorico" (
    "id" TEXT NOT NULL,
    "entregadorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT NOT NULL,
    "autorTipo" TEXT NOT NULL,
    "autorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntregadorStatusHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntregadorLocalizacao" (
    "id" TEXT NOT NULL,
    "entregadorId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntregadorLocalizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoStatusHistorico" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "de" "StatusPedido",
    "para" "StatusPedido" NOT NULL,
    "entregadorId" TEXT,
    "autorTipo" TEXT NOT NULL,
    "autorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoStatusHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntregadorStatusHistorico_entregadorId_createdAt_idx" ON "EntregadorStatusHistorico"("entregadorId", "createdAt");

-- CreateIndex
CREATE INDEX "EntregadorStatusHistorico_createdAt_idx" ON "EntregadorStatusHistorico"("createdAt");

-- CreateIndex
CREATE INDEX "EntregadorLocalizacao_entregadorId_createdAt_idx" ON "EntregadorLocalizacao"("entregadorId", "createdAt");

-- CreateIndex
CREATE INDEX "PedidoStatusHistorico_createdAt_idx" ON "PedidoStatusHistorico"("createdAt");

-- CreateIndex
CREATE INDEX "PedidoStatusHistorico_entregadorId_createdAt_idx" ON "PedidoStatusHistorico"("entregadorId", "createdAt");

-- CreateIndex
CREATE INDEX "PedidoStatusHistorico_pedidoId_createdAt_idx" ON "PedidoStatusHistorico"("pedidoId", "createdAt");

-- CreateIndex
CREATE INDEX "Pedido_createdAt_idx" ON "Pedido"("createdAt");

-- AddForeignKey
ALTER TABLE "EntregadorStatusHistorico" ADD CONSTRAINT "EntregadorStatusHistorico_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntregadorLocalizacao" ADD CONSTRAINT "EntregadorLocalizacao_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoStatusHistorico" ADD CONSTRAINT "PedidoStatusHistorico_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------- Preenchimento dos pedidos existentes ----------
-- Horários finais conhecidos: para pedidos já concluídos, a última atualização é o fim.
UPDATE "Pedido" SET "entregueEm" = "updatedAt" WHERE "status" = 'ENTREGUE' AND "entregueEm" IS NULL;
UPDATE "Pedido" SET "canceladoEm" = "updatedAt" WHERE "status" = 'CANCELADO' AND "canceladoEm" IS NULL;

-- Histórico reconstruído: criação e situação atual de cada pedido (etapas intermediárias não são conhecidas).
INSERT INTO "PedidoStatusHistorico" ("id", "pedidoId", "de", "para", "entregadorId", "autorTipo", "autorNome", "createdAt")
SELECT 'mig_c_' || "id", "id", NULL, 'PREPARANDO', NULL, 'SISTEMA', 'Reconstruído na migração', "createdAt" FROM "Pedido";

INSERT INTO "PedidoStatusHistorico" ("id", "pedidoId", "de", "para", "entregadorId", "autorTipo", "autorNome", "createdAt")
SELECT 'mig_f_' || "id", "id", NULL, "status", "entregadorId", 'SISTEMA', 'Reconstruído na migração', "updatedAt"
FROM "Pedido" WHERE "status" <> 'PREPARANDO';
