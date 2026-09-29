// Aplica as migrações do banco durante a publicação (build do Vercel).
// Usa a conexão DIRETA (sem pooler), que é a exigida pelo "prisma migrate".
// Sem banco conectado ainda, só avisa — o site sobe e o banco é ligado depois (ver PUBLICAR-VERCEL.md).
const { execSync } = require("child_process");
const path = require("path");

const url =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL;

if (!url) {
  console.warn("\n⚠  Nenhum banco de dados conectado ainda — migrações não aplicadas.");
  console.warn("   No Vercel: Storage › Create Database › Neon › Connect, e depois Redeploy.\n");
  process.exit(0);
}

const schema = path.join(__dirname, "..", "prisma", "schema.prisma");
execSync(`npx prisma migrate deploy --schema "${schema}"`, {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
