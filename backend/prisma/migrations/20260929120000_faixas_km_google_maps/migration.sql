-- AlterEnum
ALTER TYPE "TipoCalculoTabela" ADD VALUE 'FAIXAS';

-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN     "googleMapsChave" TEXT;

-- AlterTable
ALTER TABLE "TabelaPrecoKm" ADD COLUMN     "faixas" JSONB;
