-- AlterTable
ALTER TABLE "Comercio" ADD COLUMN     "roteirizacaoAutomatica" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roteirizacaoEscopo" TEXT NOT NULL DEFAULT 'LOJA';

-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN     "rotaDistanciaMaxKm" DOUBLE PRECISION NOT NULL DEFAULT 3,
ADD COLUMN     "rotaEsperaSegundos" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "rotaMaxPedidos" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "rotaRaioColetaKm" DOUBLE PRECISION NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "aguardandoRotaAte" TIMESTAMP(3),
ADD COLUMN     "ordemRota" INTEGER,
ADD COLUMN     "rotaId" TEXT;

-- CreateTable
CREATE TABLE "Rota" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "criadoPor" TEXT,
    "entregadorId" TEXT,
    "aceitaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rota_codigo_key" ON "Rota"("codigo");

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_rotaId_fkey" FOREIGN KEY ("rotaId") REFERENCES "Rota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
