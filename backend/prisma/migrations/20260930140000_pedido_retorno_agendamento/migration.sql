-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "agendadoPara" TIMESTAMP(3),
ADD COLUMN     "complemento" TEXT,
ADD COLUMN     "retorno" BOOLEAN NOT NULL DEFAULT false;

-- Agendados aguardando a hora de chamar o entregador
CREATE INDEX "Pedido_agendadoPara_idx" ON "Pedido"("agendadoPara") WHERE "agendadoPara" IS NOT NULL AND status = 'PREPARANDO';
