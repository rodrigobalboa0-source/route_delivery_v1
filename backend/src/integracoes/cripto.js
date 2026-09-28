// Criptografia das credenciais das integrações (AES-256-GCM).
// Chave: INTEGRACOES_CHAVE (64 caracteres hex = 32 bytes, ou qualquer texto forte com 32+ caracteres). Sem ela, deriva do
// JWT_SECRET — funciona, mas trocar o JWT_SECRET tornaria as credenciais ilegíveis.
const crypto = require("crypto");

let avisou = false;
function chave() {
  const hex = process.env.INTEGRACOES_CHAVE;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, "hex");
  // Outro formato forte (ex.: valor gerado pela hospedagem): deriva 32 bytes dele.
  if (hex && hex.length >= 32) return crypto.createHash("sha256").update(`integracoes:${hex}`).digest();
  if (!avisou) {
    console.warn("INTEGRACOES_CHAVE ausente ou inválida — derivando a chave das credenciais a partir do JWT_SECRET.");
    avisou = true;
  }
  return crypto.createHash("sha256").update(`integracoes:${process.env.JWT_SECRET}`).digest();
}

function cifrar(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), dados.toString("base64")].join(".");
}

function decifrar(texto) {
  if (!texto) return {};
  const [versao, iv, tag, dados] = texto.split(".");
  if (versao !== "v1") throw new Error("Formato de credencial desconhecido.");
  const d = crypto.createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(dados, "base64")), d.final()]).toString("utf8"));
}

const novoToken = () => crypto.randomBytes(24).toString("hex");
const assinar = (corpo, segredo) => `sha256=${crypto.createHmac("sha256", segredo).update(corpo).digest("hex")}`;

module.exports = { cifrar, decifrar, novoToken, assinar };
