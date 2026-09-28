-- CreateEnum
CREATE TYPE "OrigemPedido" AS ENUM ('PAINEL_ADMIN', 'SISTEMA_COMERCIANTE', 'APP_COMERCIANTE', 'INTEGRACAO');

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "origem" "OrigemPedido";

-- Preenche a origem dos pedidos já existentes a partir do registro de criação na linha do tempo.
UPDATE "Pedido" p SET "origem" = 'SISTEMA_COMERCIANTE'
WHERE p."origem" IS NULL AND EXISTS (
  SELECT 1 FROM "PedidoLog" l WHERE l."pedidoId" = p."id" AND l."texto" LIKE '%(sistema do comerciante)%'
);
UPDATE "Pedido" p SET "origem" = 'PAINEL_ADMIN'
WHERE p."origem" IS NULL AND EXISTS (
  SELECT 1 FROM "PedidoLog" l WHERE l."pedidoId" = p."id"
    AND (l."texto" LIKE '%(painel ADM)%' OR l."texto" LIKE 'Pedido clonado a partir de%')
);
