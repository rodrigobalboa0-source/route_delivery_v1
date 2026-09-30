-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN     "lojaPodeBloquearEntregador" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lojaPodeEditarComercio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lojaPodeEditarEntregador" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lojaPodeFinalizar" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ComercioEntregadorBloqueio" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "entregadorId" TEXT NOT NULL,
    "motivo" TEXT,
    "autorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComercioEntregadorBloqueio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComercioEntregadorBloqueio_entregadorId_idx" ON "ComercioEntregadorBloqueio"("entregadorId");

-- CreateIndex
CREATE UNIQUE INDEX "ComercioEntregadorBloqueio_comercioId_entregadorId_key" ON "ComercioEntregadorBloqueio"("comercioId", "entregadorId");

-- AddForeignKey
ALTER TABLE "ComercioEntregadorBloqueio" ADD CONSTRAINT "ComercioEntregadorBloqueio_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComercioEntregadorBloqueio" ADD CONSTRAINT "ComercioEntregadorBloqueio_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
