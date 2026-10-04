-- AlterTable
ALTER TABLE "Comercio" ADD COLUMN     "motivoRecusa" TEXT,
ADD COLUMN     "situacaoCadastro" TEXT NOT NULL DEFAULT 'ATIVO';
