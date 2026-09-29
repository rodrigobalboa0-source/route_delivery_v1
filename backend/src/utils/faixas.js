// Faixas de km ("até 3 km = R$ 7,00"), usadas na Tabela de preço por KM (valor cobrado)
// e na Tabela de comissões (ganho do entregador). Uma regra só para as duas.
//   - Cada faixa vale da faixa anterior até o km informado.
//   - Acima da última faixa: valor da última + kmAdicional × km excedente.
//   - Nunca abaixo do mínimo.

const erro400 = msg => Object.assign(new Error(msg), { status: 400 });

// Faixas válidas em ordem crescente de km (ignora linhas incompletas).
function normalizarFaixas(faixas) {
  if (!Array.isArray(faixas)) return [];
  return faixas
    .map(f => ({ ateKm: Number(f?.ateKm), valor: Number(f?.valor) }))
    .filter(f => Number.isFinite(f.ateKm) && f.ateKm > 0 && Number.isFinite(f.valor) && f.valor >= 0)
    .sort((a, b) => a.ateKm - b.ateKm);
}

// { valor, faixa: {ateKm,valor} | null, excedenteKm } ou null se não há faixas.
function valorPorFaixas(distanciaKm, faixas, kmAdicional = 0, minimo = 0) {
  const fs = normalizarFaixas(faixas);
  if (!fs.length || !Number.isFinite(distanciaKm)) return null;
  const km = Math.round(distanciaKm * 100) / 100;
  const faixa = fs.find(f => km <= f.ateKm) || null;
  const ultima = fs[fs.length - 1];
  const excedenteKm = faixa ? 0 : Math.round((km - ultima.ateKm) * 100) / 100;
  const bruto = faixa ? faixa.valor : ultima.valor + excedenteKm * (kmAdicional || 0);
  return { valor: Math.round(Math.max(bruto, minimo || 0) * 100) / 100, faixa, ultima, excedenteKm };
}

// Valida o que veio do formulário (texto com vírgula, fora de ordem...) e devolve a lista limpa.
function validarFaixas(lista) {
  if (!Array.isArray(lista)) throw erro400("Faixas inválidas.");
  if (lista.length > 50) throw erro400("Máximo de 50 faixas.");
  const faixas = lista.map((f, i) => {
    const ateKm = Number(String(f?.ateKm ?? "").replace(",", "."));
    const valor = Number(String(f?.valor ?? "").replace(",", "."));
    if (!Number.isFinite(ateKm) || ateKm <= 0 || ateKm > 1000) throw erro400(`Faixa ${i + 1}: informe até quantos km (maior que zero).`);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100000) throw erro400(`Faixa ${i + 1}: informe o valor (R$).`);
    return { ateKm: Math.round(ateKm * 100) / 100, valor: Math.round(valor * 100) / 100 };
  }).sort((a, b) => a.ateKm - b.ateKm);
  faixas.forEach((f, i) => { if (i && f.ateKm === faixas[i - 1].ateKm) throw erro400(`Duas faixas com o mesmo limite (${f.ateKm} km).`); });
  return faixas;
}

module.exports = { normalizarFaixas, valorPorFaixas, validarFaixas };
