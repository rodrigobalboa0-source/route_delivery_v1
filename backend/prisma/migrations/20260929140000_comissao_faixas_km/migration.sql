-- AlterTable
ALTER TABLE "TabelaComissao" ADD COLUMN     "faixas" JSONB,
ADD COLUMN     "kmAdicional" DOUBLE PRECISION,
ADD COLUMN     "nome" TEXT,
ADD COLUMN     "tipoCalculo" TEXT NOT NULL DEFAULT 'PERCENTUAL',
ALTER COLUMN "percentual" DROP NOT NULL;
