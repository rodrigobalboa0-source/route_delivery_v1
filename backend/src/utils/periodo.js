// Período de datas vindo da tela: ?desde=AAAA-MM-DD&ate=AAAA-MM-DD
// Datas no horário local do servidor; "ate" inclui o dia inteiro.

function erro400(mensagem) {
  const err = new Error(mensagem);
  err.status = 400;
  return err;
}

function dataLocal(texto, fimDoDia = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || "")) return null;
  const d = new Date(`${texto}T${fimDoDia ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Padrão: últimos `diasPadrao` dias até hoje. Máximo de 366 dias.
function periodo(q, diasPadrao = 30) {
  let ate = dataLocal(q.ate, true);
  if (!ate) { ate = new Date(); ate.setHours(23, 59, 59, 999); }
  let desde = dataLocal(q.desde);
  if (!desde) { desde = new Date(ate); desde.setDate(desde.getDate() - (diasPadrao - 1)); desde.setHours(0, 0, 0, 0); }
  if (desde > ate) throw erro400("A data inicial é depois da data final.");
  if ((ate - desde) / 86400000 > 366) throw erro400("O período máximo é de 1 ano.");
  return { desde, ate };
}

// Período obrigatório (acerto, faturamento): as duas datas precisam vir.
function periodoObrigatorio(q) {
  if (!dataLocal(q.desde) || !dataLocal(q.ate)) throw erro400("Informe a data de início e a de fim.");
  return periodo(q);
}

// Um dia específico (?data=AAAA-MM-DD, padrão hoje).
function dia(q) {
  const inicio = dataLocal(q.data) || (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const fim = new Date(inicio);
  fim.setHours(23, 59, 59, 999);
  return { inicio, fim };
}

const dataBR = d => new Date(d).toLocaleDateString("pt-BR");

module.exports = { erro400, dataLocal, periodo, periodoObrigatorio, dia, dataBR };
