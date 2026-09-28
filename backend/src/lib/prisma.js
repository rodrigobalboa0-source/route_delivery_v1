const { PrismaClient } = require("@prisma/client");

// Evita múltiplas instâncias do Prisma Client em ambiente de desenvolvimento
// (com nodemon reiniciando o processo, por exemplo).
const globalRef = globalThis;

const prisma = globalRef.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalRef.__prisma = prisma;
}

module.exports = prisma;
