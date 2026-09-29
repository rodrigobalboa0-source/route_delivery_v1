// Depois do "expo export --platform web": o Expo coloca as fontes dos ícones em dist/assets/node_modules/...
// e o Vercel descarta pastas chamadas "node_modules" no envio (os ícones viravam quadradinhos).
// Aqui a pasta é renomeada para dist/assets/nm e as referências nos arquivos .js/.html são atualizadas.
// Uso: npm run web:build   (gera e prepara a pasta dist para publicar)
const fs = require("fs");
const path = require("path");

const dist = path.join(__dirname, "..", "dist");
const de = path.join(dist, "assets", "node_modules");
const para = path.join(dist, "assets", "nm");

if (!fs.existsSync(de)) {
  console.log("Nada a fazer: dist/assets/node_modules não existe.");
  process.exit(0);
}
fs.rmSync(para, { recursive: true, force: true });
fs.renameSync(de, para);

let alterados = 0;
(function percorrer(pasta) {
  for (const nome of fs.readdirSync(pasta)) {
    const caminho = path.join(pasta, nome);
    if (fs.statSync(caminho).isDirectory()) { if (nome !== ".vercel") percorrer(caminho); continue; }
    if (!/\.(js|html|json)$/.test(nome)) continue;
    const texto = fs.readFileSync(caminho, "utf8");
    if (!texto.includes("/assets/node_modules/")) continue;
    fs.writeFileSync(caminho, texto.split("/assets/node_modules/").join("/assets/nm/"));
    alterados++;
  }
})(dist);
console.log(`Fontes movidas para dist/assets/nm (${alterados} arquivo(s) atualizados).`);
