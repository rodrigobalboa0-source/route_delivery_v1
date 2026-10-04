-- CreateTable
CREATE TABLE "ContaBancariaEntregador" (
    "id" TEXT NOT NULL,
    "entregadorId" TEXT NOT NULL,
    "titular" TEXT NOT NULL,
    "documento" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "agencia" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "tipoConta" TEXT NOT NULL DEFAULT 'CORRENTE',
    "pixTipo" TEXT,
    "pixChave" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContaBancariaEntregador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaqueEntregador" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "entregadorId" TEXT NOT NULL,
    "tipo" "TipoSaque" NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "conta" JSONB NOT NULL,
    "motivo" TEXT,
    "formaPagamento" TEXT,
    "observacao" TEXT,
    "analisadoPor" TEXT,
    "pagoEm" TIMESTAMP(3),
    "recusadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaqueEntregador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaBancariaEntregador_entregadorId_key" ON "ContaBancariaEntregador"("entregadorId");

-- CreateIndex
CREATE UNIQUE INDEX "SaqueEntregador_numero_key" ON "SaqueEntregador"("numero");

-- CreateIndex
CREATE INDEX "SaqueEntregador_entregadorId_createdAt_idx" ON "SaqueEntregador"("entregadorId", "createdAt");

-- CreateIndex
CREATE INDEX "SaqueEntregador_status_createdAt_idx" ON "SaqueEntregador"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ContaBancariaEntregador" ADD CONSTRAINT "ContaBancariaEntregador_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaqueEntregador" ADD CONSTRAINT "SaqueEntregador_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
