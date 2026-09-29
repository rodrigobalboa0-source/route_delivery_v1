-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN     "retornoPercentual" DOUBLE PRECISION NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "acrescimoRetorno" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PedidoRecusa" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "entregadorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PedidoRecusa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteComercio" (
    "id" TEXT NOT NULL,
    "comercioId" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "complemento" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "totalPedidos" INTEGER NOT NULL DEFAULT 0,
    "ultimoPedidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteComercio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PedidoRecusa_entregadorId_idx" ON "PedidoRecusa"("entregadorId");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoRecusa_pedidoId_entregadorId_key" ON "PedidoRecusa"("pedidoId", "entregadorId");

-- CreateIndex
CREATE INDEX "ClienteComercio_comercioId_ultimoPedidoEm_idx" ON "ClienteComercio"("comercioId", "ultimoPedidoEm");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteComercio_comercioId_telefone_key" ON "ClienteComercio"("comercioId", "telefone");

-- AddForeignKey
ALTER TABLE "PedidoRecusa" ADD CONSTRAINT "PedidoRecusa_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoRecusa" ADD CONSTRAINT "PedidoRecusa_entregadorId_fkey" FOREIGN KEY ("entregadorId") REFERENCES "Entregador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteComercio" ADD CONSTRAINT "ClienteComercio_comercioId_fkey" FOREIGN KEY ("comercioId") REFERENCES "Comercio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Clientes ja atendidos: aproveita os pedidos existentes (o mais recente por comercio + telefone)
INSERT INTO "ClienteComercio" ("id", "comercioId", "telefone", "nome", "endereco", "complemento", "lat", "lng", "totalPedidos", "ultimoPedidoEm", "createdAt", "updatedAt")
SELECT 'cli_' || md5(t."comercioId" || t.fone), t."comercioId", t.fone, t."clienteNome", t."endereco", t."complemento", t."latDestino", t."lngDestino", t.qtd, t."createdAt", now(), now()
FROM (
  SELECT DISTINCT ON (p."comercioId", regexp_replace(p."clienteTelefone", '\D', '', 'g'))
    p."comercioId", regexp_replace(p."clienteTelefone", '\D', '', 'g') AS fone, p."clienteNome", p."endereco", p."complemento",
    p."latDestino", p."lngDestino", p."createdAt",
    count(*) OVER (PARTITION BY p."comercioId", regexp_replace(p."clienteTelefone", '\D', '', 'g'))::int AS qtd
  FROM "Pedido" p
  WHERE p."clienteTelefone" IS NOT NULL AND length(regexp_replace(p."clienteTelefone", '\D', '', 'g')) >= 8
  ORDER BY p."comercioId", regexp_replace(p."clienteTelefone", '\D', '', 'g'), p."createdAt" DESC
) t
ON CONFLICT DO NOTHING;