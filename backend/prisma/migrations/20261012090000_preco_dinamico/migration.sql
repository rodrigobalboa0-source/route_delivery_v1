-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "acrescimoDinamico" DOUBLE PRECISION,
ADD COLUMN     "dinamicoEntregador" JSONB,
ADD COLUMN     "regrasDinamicas" TEXT;
