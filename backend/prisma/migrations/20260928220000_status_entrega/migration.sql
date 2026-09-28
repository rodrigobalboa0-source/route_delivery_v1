-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StatusPedido" ADD VALUE 'ATRIBUIDO';
ALTER TYPE "StatusPedido" ADD VALUE 'NA_LOJA';
ALTER TYPE "StatusPedido" ADD VALUE 'NO_CLIENTE';

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "naLojaEm" TIMESTAMP(3),
ADD COLUMN     "noClienteEm" TIMESTAMP(3),
ADD COLUMN     "saiuEm" TIMESTAMP(3);
