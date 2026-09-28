// Primeiro acesso em um banco novo (ex.: ao publicar): se ainda não existe nenhuma conta
// gerencial e ADMIN_EMAIL + ADMIN_SENHA estão definidos, cria o administrador com permissão Total.
// Depois que existir qualquer conta, não faz nada (as variáveis podem até ser apagadas).
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");

async function garantirPrimeiroAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const senha = String(process.env.ADMIN_SENHA || "");
  if (!email || !senha) return;
  if ((await prisma.contaGerencial.count()) > 0) return;
  if (senha.length < 8) {
    console.error("ADMIN_SENHA precisa ter pelo menos 8 caracteres — primeiro administrador não criado.");
    return;
  }
  await prisma.contaGerencial.create({
    data: {
      nome: String(process.env.ADMIN_NOME || "Administrador").trim(),
      cargo: "ADMINISTRADOR",
      email,
      senhaHash: await bcrypt.hash(senha, 10),
      permissao: "TOTAL",
    },
  });
  console.log(`Primeiro administrador criado: ${email}`);
}

module.exports = { garantirPrimeiroAdmin };
