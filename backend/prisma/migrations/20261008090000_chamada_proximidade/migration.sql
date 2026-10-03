-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN     "despachoPorVez" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "despachoProximidade" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "despachoTempoSegundos" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "despachoAberto" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "despachoOndaEm" TIMESTAMP(3),
ADD COLUMN     "despachoPara" TEXT[] DEFAULT ARRAY[]::TEXT[];
