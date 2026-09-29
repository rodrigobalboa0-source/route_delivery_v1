// Tarefa que continua depois de a resposta ser enviada (webhook de saída, localizar endereços...).
// Num servidor comum ela simplesmente roda. No Vercel a função "desliga" ao responder, então a
// tarefa é registrada com waitUntil para o Vercel esperar ela terminar.
let waitUntil = null;
if (process.env.VERCEL) {
  try {
    ({ waitUntil } = require("@vercel/functions"));
  } catch {
    waitUntil = null;
  }
}

function emSegundoPlano(tarefa, rotulo = "segundo plano") {
  const p = Promise.resolve()
    .then(tarefa)
    .catch(err => console.error(`[${rotulo}]`, err.message));
  if (waitUntil) waitUntil(p);
  return p;
}

module.exports = { emSegundoPlano };
