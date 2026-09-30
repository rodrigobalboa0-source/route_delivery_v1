-- AlterTable
ALTER TABLE "TabelaComissao" ADD COLUMN     "tipoRetorno" TEXT NOT NULL DEFAULT 'REPASSE_LOJA',
ADD COLUMN     "valorRetorno" DOUBLE PRECISION;
