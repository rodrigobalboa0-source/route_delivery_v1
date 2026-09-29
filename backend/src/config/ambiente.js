// Ajustes de ambiente carregados antes de tudo (antes do Prisma Client ser criado).
require("dotenv").config();

// Bancos conectados pelo Vercel (Neon, Supabase, Prisma Postgres...) usam nomes variados.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || "";
}

// Conexão pelo "pooler" (PgBouncer, ex.: host com "-pooler" no Neon): o Prisma não pode
// usar prepared statements nesse modo — pgbouncer=true avisa isso a ele.
const url = process.env.DATABASE_URL;
if (url && /-pooler\.|pgbouncer|pooler\./i.test(url) && !/[?&]pgbouncer=/.test(url)) {
  process.env.DATABASE_URL = url + (url.includes("?") ? "&" : "?") + "pgbouncer=true";
}
