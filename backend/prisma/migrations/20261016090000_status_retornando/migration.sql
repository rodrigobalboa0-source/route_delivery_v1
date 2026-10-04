-- AlterEnum
ALTER TYPE "StatusPedido" ADD VALUE 'RETORNANDO';

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "retornandoEm" TIMESTAMP(3);
