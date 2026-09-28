-- CreateEnum
CREATE TYPE "TipoAplicacaoPreco" AS ENUM ('MULTIPLICADOR', 'VALOR_FIXO');

-- ---------- Preço dinâmico: nível/multiplicador/bônus -> nome + tipo de aplicação + valor ----------
-- Converte regras existentes em vez de descartá-las.

ALTER TABLE "PrecoDinamicoDemanda"
  ADD COLUMN "nome" TEXT,
  ADD COLUMN "tipoAplicacao" "TipoAplicacaoPreco" NOT NULL DEFAULT 'MULTIPLICADOR',
  ADD COLUMN "valor" DOUBLE PRECISION,
  ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;

UPDATE "PrecoDinamicoDemanda" SET
  "nome" = 'Demanda ' || CASE "nivel" WHEN 'BAIXA' THEN 'baixa' WHEN 'NORMAL' THEN 'normal' WHEN 'ALTA' THEN 'alta' ELSE 'muito alta' END
           || COALESCE(' (' || NULLIF("horario", '') || ')', ''),
  "valor" = "multiplicador";

ALTER TABLE "PrecoDinamicoDemanda"
  ALTER COLUMN "nome" SET NOT NULL,
  ALTER COLUMN "valor" SET NOT NULL,
  DROP COLUMN "nivel",
  DROP COLUMN "multiplicador",
  DROP COLUMN "horario";

ALTER TABLE "PrecoDinamicoEntregador"
  ADD COLUMN "nome" TEXT,
  ADD COLUMN "tipoAplicacao" "TipoAplicacaoPreco" NOT NULL DEFAULT 'VALOR_FIXO',
  ADD COLUMN "valor" DOUBLE PRECISION;

UPDATE "PrecoDinamicoEntregador" SET
  "nome" = 'Bônus demanda ' || CASE "nivel" WHEN 'BAIXA' THEN 'baixa' WHEN 'NORMAL' THEN 'normal' WHEN 'ALTA' THEN 'alta' ELSE 'muito alta' END,
  "valor" = "bonus";

ALTER TABLE "PrecoDinamicoEntregador"
  ALTER COLUMN "nome" SET NOT NULL,
  ALTER COLUMN "valor" SET NOT NULL,
  DROP COLUMN "nivel",
  DROP COLUMN "bonus";

-- DropEnum
DROP TYPE "NivelDemanda";

-- CreateTable
CREATE TABLE "PromocaoEntregador" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "premio" TEXT,
    "fotoUrl" TEXT,
    "veiculos" "Veiculo"[],
    "inicio" TIMESTAMP(3),
    "fim" TIMESTAMP(3),
    "ativa" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromocaoEntregador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromocaoEvento" (
    "id" TEXT NOT NULL,
    "promocaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "autorNome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromocaoEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromocaoAvisoVisto" (
    "id" TEXT NOT NULL,
    "entregadorId" TEXT NOT NULL,
    "avisoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromocaoAvisoVisto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromocaoEvento_createdAt_idx" ON "PromocaoEvento"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromocaoAvisoVisto_entregadorId_avisoId_key" ON "PromocaoAvisoVisto"("entregadorId", "avisoId");

-- AddForeignKey
ALTER TABLE "PromocaoEvento" ADD CONSTRAINT "PromocaoEvento_promocaoId_fkey" FOREIGN KEY ("promocaoId") REFERENCES "PromocaoEntregador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromocaoAvisoVisto" ADD CONSTRAINT "PromocaoAvisoVisto_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
