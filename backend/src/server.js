// Servidor comum (seu computador, Render, VPS). No Vercel quem roda é api/index.js.
let app;
try {
  app = require("./app");
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Route Delivery API rodando em http://localhost:${PORT}`);
});
