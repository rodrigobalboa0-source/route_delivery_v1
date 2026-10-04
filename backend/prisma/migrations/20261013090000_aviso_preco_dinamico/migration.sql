-- CreateTable
CREATE TABLE "PrecoDinamicoEvento" (
    "id" TEXT NOT NULL,
    "regraId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipoAplicacao" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "tipo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecoDinamicoEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrecoDinamicoEvento_createdAt_idx" ON "PrecoDinamicoEvento"("createdAt");
