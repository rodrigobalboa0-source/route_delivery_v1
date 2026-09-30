-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN     "emailProvedor" TEXT,
ADD COLUMN     "emailRemetente" TEXT,
ADD COLUMN     "raioConfirmacaoMetros" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "rankingAtivo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rankingMinimoEntregas" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "rankingPremios" JSONB NOT NULL DEFAULT '[0,0,0,0,0,0,0,0,0,0]',
ADD COLUMN     "resendChave" TEXT,
ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPorta" INTEGER,
ADD COLUMN     "smtpSenha" TEXT,
ADD COLUMN     "smtpUsuario" TEXT;

-- AlterTable
ALTER TABLE "Entregador" ADD COLUMN     "aparelhoEm" TIMESTAMP(3),
ADD COLUMN     "aparelhoId" TEXT,
ADD COLUMN     "aparelhoNome" TEXT;

-- CreateTable
CREATE TABLE "RankingSemana" (
    "id" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "resultado" JSONB NOT NULL,
    "premiosTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingSemana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntregadorCodigoSenha" (
    "id" TEXT NOT NULL,
    "entregadorId" TEXT NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntregadorCodigoSenha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RankingSemana_inicio_key" ON "RankingSemana"("inicio");

-- CreateIndex
CREATE INDEX "EntregadorCodigoSenha_entregadorId_createdAt_idx" ON "EntregadorCodigoSenha"("entregadorId", "createdAt");

-- AddForeignKey
ALTER TABLE "EntregadorCodigoSenha" ADD CONSTRAINT "EntregadorCodigoSenha_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
