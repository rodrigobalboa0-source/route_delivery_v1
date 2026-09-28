// Validação de CPF/CNPJ pelos dígitos verificadores.

function soDigitos(v = "") {
  return String(v).replace(/\D/g, "");
}

function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = n => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjValido(v) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = n => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((s, p, i) => s + Number(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

// Retorna mensagem de erro ou null. Documento vazio é aceito (campo opcional).
function erroDocumento(tipo, documento) {
  if (!documento) return null;
  if (tipo === "CPF") return cpfValido(documento) ? null : "CPF inválido.";
  return cnpjValido(documento) ? null : "CNPJ inválido.";
}

module.exports = { soDigitos, cpfValido, cnpjValido, erroDocumento };
