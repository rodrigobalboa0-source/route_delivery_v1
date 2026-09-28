-- CreateEnum
CREATE TYPE "TipoSaque" AS ENUM ('NORMAL', 'RAPIDO');

-- AlterTable
ALTER TABLE "ComercioEndereco" ADD COLUMN     "referencia" TEXT;

-- CreateTable
CREATE TABLE "RegraSaque" (
    "id" TEXT NOT NULL,
    "tipo" "TipoSaque" NOT NULL,
    "limitePorSolicitacao" DOUBLE PRECISION,
    "maxSolicitacoesDia" INTEGER NOT NULL DEFAULT 1,
    "diasPermitidos" INTEGER[],
    "datasEspecificas" TEXT[],
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegraSaque_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegraSaque_tipo_key" ON "RegraSaque"("tipo");
