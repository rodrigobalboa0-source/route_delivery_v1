// Aplicação Express (rotas da API + painel). Usada de dois jeitos:
//   - server.js: servidor comum (seu computador, Render, VPS) — chama app.listen;
//   - api/index.js (raiz do projeto): função do Vercel — exporta este app.
require("./config/ambiente");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { garantirPrimeiroAdmin } = require("./services/primeiroAdmin.service");
const { versaoPainel } = require("./services/tempoReal.service");

const { errorHandler } = require("./middleware/errorHandler");
const { requireAuth, requireTipo, requirePermissaoEscrita, TIPOS } = require("./middleware/auth");

const authRoutes = require("./routes/auth.routes");
const pedidosRoutes = require("./routes/pedidos.routes");
const novaEntregaRoutes = require("./routes/novaEntrega.routes");
const comerciosRoutes = require("./routes/comercios.routes");
const entregadoresRoutes = require("./routes/entregadores.routes");
const mensagensRoutes = require("./routes/mensagens.routes");
const financeiroRoutes = require("./routes/financeiro.routes");
const relatoriosRoutes = require("./routes/relatorios.routes");
const notificacoesRoutes = require("./routes/notificacoes.routes");
const configuracoesRoutes = require("./routes/configuracoes.routes");
const cadastroRoutes = require("./routes/cadastro.routes");
const appEntregadorRoutes = require("./routes/app/entregador.routes");
const appComercianteRoutes = require("./routes/app/comerciante.routes");
const integracoesRoutes = require("./routes/integracoes.routes");
const integracoesWebhookRoutes = require("./routes/integracoesWebhook.routes");
const promocoesEntregadorRoutes = require("./routes/promocoesEntregador.routes");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET não definido — configure nas variáveis de ambiente (.env ou painel da hospedagem).");
}

const app = express();
// Atrás do proxy da hospedagem (Render, Vercel...): req.protocol vira "https" e o IP real do cliente é usado.
app.set("trust proxy", 1);

// CORS_ORIGIN aceita várias origens separadas por vírgula (painel ADM, sistema do comerciante...).
const origens = (process.env.CORS_ORIGIN || "*").split(",").map(o => o.trim());
app.use(cors({ origin: origens.includes("*") ? "*" : origens }));
app.use(express.json({ limit: "5mb" })); // limite maior por causa da importação de CSV

app.get(["/health", "/api/health"], (req, res) => res.json({ status: "ok" }));

// Primeiro acesso num banco novo: cria o administrador de ADMIN_EMAIL/ADMIN_SENHA (uma vez por
// processo/função, antes da primeira requisição). Ver services/primeiroAdmin.service.js.
let preparo = null;
app.use((req, res, next) => {
  preparo ||= garantirPrimeiroAdmin().catch(err => {
    console.error("Não foi possível criar o primeiro administrador:", err.message);
    preparo = null; // tenta de novo na próxima requisição
  });
  preparo.then(() => next(), next);
});

// ---- APIs dos apps (cada uma com seu próprio login e controle de acesso) ----
app.use("/api/app/entregador", appEntregadorRoutes);
app.use("/api/app/comerciante", appComercianteRoutes);

// ---- Webhook de entrada das integrações (público; autenticado pelo token na URL) ----
app.use("/api/integracoes/webhook", integracoesWebhookRoutes);

// ---- Painel ADM ----
// Login é público; todo o resto exige token de conta gerencial e respeita a permissão da conta.
app.use("/api/auth", authRoutes);
app.use("/api", requireAuth, requireTipo(TIPOS.ADMIN), requirePermissaoEscrita);

// "Algo mudou?" — o painel consulta a cada ~2 s e só recarrega o que mudou (ver services/tempoReal.service.js).
app.get("/api/tempo-real", (req, res, next) => {
  versaoPainel().then(v => res.set("Cache-Control", "no-store").json(v)).catch(next);
});

app.use("/api/pedidos", pedidosRoutes);
app.use("/api/nova-entrega", novaEntregaRoutes);
app.use("/api/comercios", comerciosRoutes);
app.use("/api/entregadores", entregadoresRoutes);
app.use("/api/mensagens", mensagensRoutes);
app.use("/api/financeiro", financeiroRoutes);
app.use("/api/relatorios", relatoriosRoutes);
app.use("/api/notificacoes", notificacoesRoutes);
app.use("/api/configuracoes", configuracoesRoutes);
app.use("/api/cadastro", cadastroRoutes);
app.use("/api/integracoes", integracoesRoutes);
app.use("/api/promocoes-entregador", promocoesEntregadorRoutes);

app.use("/api", (req, res) => res.status(404).json({ erro: "Rota não encontrada." }));

// ---- Painel ADM (build do Vite em ../admin/dist) servido pelo mesmo endereço, quando existir ----
// Servidor comum: painel e API num único serviço, sem CORS. (No Vercel o painel é servido pela CDN.)
const PAINEL = path.join(__dirname, "..", "..", "admin", "dist");
if (fs.existsSync(path.join(PAINEL, "index.html"))) {
  app.use(express.static(PAINEL, { index: false, maxAge: "1h" }));
  // Rotas do painel (/operacao, /financeiro/...) devolvem o index.html; o React decide a tela.
  app.get("*", (req, res) => res.sendFile(path.join(PAINEL, "index.html")));
}

app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
app.use(errorHandler);

module.exports = app;
