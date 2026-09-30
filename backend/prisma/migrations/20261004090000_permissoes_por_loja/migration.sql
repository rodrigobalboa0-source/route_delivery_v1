-- Permissions of the store system become per store (Comercio). Copy the old global values first.
ALTER TABLE "Comercio" ADD COLUMN     "exigirCodigoTelefone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lojaPodeBloquearEntregador" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lojaPodeEditarComercio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lojaPodeEditarEntregador" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lojaPodeFinalizar" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Comercio" SET
  "lojaPodeFinalizar" = c."lojaPodeFinalizar",
  "lojaPodeEditarComercio" = c."lojaPodeEditarComercio",
  "lojaPodeEditarEntregador" = c."lojaPodeEditarEntregador",
  "lojaPodeBloquearEntregador" = c."lojaPodeBloquearEntregador"
FROM (SELECT * FROM "Configuracao" LIMIT 1) c;

ALTER TABLE "Configuracao" DROP COLUMN "lojaPodeBloquearEntregador",
DROP COLUMN "lojaPodeEditarComercio",
DROP COLUMN "lojaPodeEditarEntregador",
DROP COLUMN "lojaPodeFinalizar";

ALTER TABLE "Pedido" ADD COLUMN     "codigoConfirmacao" TEXT;