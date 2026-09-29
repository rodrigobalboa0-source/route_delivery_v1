-- AlterTable
ALTER TABLE "Conversa" ADD COLUMN     "entregadorId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Conversa_entregadorId_key" ON "Conversa"("entregadorId");

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
