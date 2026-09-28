-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "idExterno" TEXT,
ADD COLUMN     "integracaoSlug" TEXT;

-- CreateTable
CREATE TABLE "Integracao" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "credenciais" TEXT,
    "config" JSONB,
    "webhookToken" TEXT NOT NULL,
    "webhookSaidaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoLoja" (
    "id" TEXT NOT NULL,
    "integracaoId" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "idExterno" TEXT NOT NULL,

    CONSTRAINT "IntegracaoLoja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegracaoEvento" (
    "id" TEXT NOT NULL,
    "integracaoId" TEXT NOT NULL,
    "direcao" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "mensagem" TEXT,
    "payload" JSONB,
    "pedidoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegracaoEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Integracao_slug_key" ON "Integracao"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Integracao_webhookToken_key" ON "Integracao"("webhookToken");

-- CreateIndex
CREATE UNIQUE INDEX "IntegracaoLoja_integracaoId_idExterno_key" ON "IntegracaoLoja"("integracaoId", "idExterno");

-- CreateIndex
CREATE INDEX "IntegracaoEvento_integracaoId_createdAt_idx" ON "IntegracaoEvento"("integracaoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_integracaoSlug_idExterno_key" ON "Pedido"("integracaoSlug", "idExterno");

-- AddForeignKey
ALTER TABLE "IntegracaoLoja" ADD CONSTRAINT "IntegracaoLoja_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoLoja" ADD CONSTRAINT "IntegracaoLoja_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegracaoEvento" ADD CONSTRAINT "IntegracaoEvento_integracaoId_fkey" FOREIGN KEY ("integracaoId") REFERENCES "Integracao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
