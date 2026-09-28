// Valor em reais por extenso (pt-BR), para recibos. Suporta até 999.999.999,99.
const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze",
  "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

// 0..999
function ate999(n) {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto < 20) {
    if (resto) partes.push(UNIDADES[resto]);
  } else {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
  }
  return partes.join(" e ");
}

function inteiroPorExtenso(n) {
  if (n === 0) return "zero";
  const milhoes = Math.floor(n / 1e6);
  const milhares = Math.floor((n % 1e6) / 1000);
  const resto = n % 1000;
  const grupos = [];
  if (milhoes) grupos.push(milhoes === 1 ? "um milhão" : `${ate999(milhoes)} milhões`);
  if (milhares) grupos.push(milhares === 1 ? "mil" : `${ate999(milhares)} mil`);
  if (resto) grupos.push(ate999(resto));
  // "e" antes do último grupo quando ele é < 100 ou centena redonda (ex.: "mil e duzentos", "dois mil e cinco")
  if (grupos.length > 1 && (resto < 100 || resto % 100 === 0) && resto) {
    const ultimo = grupos.pop();
    return `${grupos.join(", ")} e ${ultimo}`;
  }
  return grupos.join(", ");
}

export function valorPorExtenso(valor) {
  const centavosTotais = Math.round(Math.abs(Number(valor) || 0) * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  const partes = [];
  if (reais) {
    // "de reais" depois de milhão/milhões redondos: "um milhão de reais"
    const redondoMilhao = reais >= 1e6 && reais % 1e6 === 0;
    partes.push(`${inteiroPorExtenso(reais)}${redondoMilhao ? " de" : ""} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  if (!partes.length) return "zero real";
  return partes.join(" e ");
}
