-- AlterTable
ALTER TABLE "Conversa" ADD COLUMN     "comercioId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Conversa_comercioId_key" ON "Conversa"("comercioId");

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
