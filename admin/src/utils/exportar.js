// Downloads em Excel (.xlsx) e PDF com a logo do sistema no topo.
// As bibliotecas só são carregadas quando alguém clica para baixar (não pesam na abertura do painel).
//
// Especificação usada pelos dois formatos:
//   { arquivo, titulo, subtitulo, resumo: [[rotulo, valor]], colunas: [{ titulo, valor: linha => any, tipo, largura }],
//     linhas, totais: { [indiceColuna]: valor } }
//   tipo: "texto" (padrão) | "numero" | "moeda" | "data" | "km"

const AZUL_ESCURO = "0F1B2D";
const AZUL = "1F6FD1";
const CINZA_LINHA = "F4F6F9";

let logoCache = null;
// Logo do painel reduzida (arquivos leves): PNG transparente para o Excel e JPEG já sobre o azul-escuro
// da faixa para o PDF (o PNG original deixaria o PDF com quase 1 MB). Guarda a proporção para não distorcer.
async function logo() {
  if (logoCache) return logoCache;
  const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error("Logo não encontrada.")); i.src = "/logo-route-delivery.png"; });
  const altura = 160;
  const largura = Math.round(altura * (img.naturalWidth / img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, largura, altura);
  const png = canvas.toDataURL("image/png");
  ctx.globalCompositeOperation = "destination-over"; // pinta o fundo atrás da logo
  ctx.fillStyle = `#${AZUL_ESCURO}`;
  ctx.fillRect(0, 0, largura, altura);
  const jpeg = canvas.toDataURL("image/jpeg", 0.88);
  logoCache = { pngBase64: png.split(",")[1], jpeg, proporcao: largura / altura };
  return logoCache;
}

const moedaBR = v => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const dataHoraBR = d => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

function textoCelula(tipo, v) {
  if (v == null || v === "") return "—";
  if (tipo === "moeda") return moedaBR(v);
  if (tipo === "data") return dataHoraBR(v);
  if (tipo === "km") return `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} km`;
  if (tipo === "numero") return Number(v).toLocaleString("pt-BR");
  return String(v);
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const geradoEm = () => `Gerado em ${new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;

// ---------- Excel ----------
export async function exportarExcel(spec) {
  const [{ default: ExcelJS }, lg] = await Promise.all([import("exceljs"), logo()]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Route Delivery";
  const ws = wb.addWorksheet(spec.aba || "Relatório", { views: [{ showGridLines: false }] });
  const n = spec.colunas.length;
  ws.columns = spec.colunas.map(c => ({ width: c.largura || (c.tipo === "texto" || !c.tipo ? 26 : 16) }));

  // Faixa do topo (linhas 1–4) em azul-escuro com a logo à esquerda e o título à direita.
  const fundo = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${AZUL_ESCURO}` } };
  for (let r = 1; r <= 4; r++) {
    ws.getRow(r).height = r === 1 || r === 4 ? 10 : 26;
    for (let c = 1; c <= Math.max(n, 6); c++) ws.getCell(r, c).fill = fundo;
  }
  const imagem = wb.addImage({ base64: lg.pngBase64, extension: "png" });
  const alturaLogo = 58;
  ws.addImage(imagem, { tl: { col: 0.15, row: 0.4 }, ext: { width: alturaLogo * lg.proporcao, height: alturaLogo } });
  const colTitulo = Math.min(3, n);
  ws.mergeCells(2, colTitulo, 2, Math.max(n, colTitulo));
  ws.mergeCells(3, colTitulo, 3, Math.max(n, colTitulo));
  Object.assign(ws.getCell(2, colTitulo), { value: spec.titulo, font: { bold: true, size: 16, color: { argb: "FFFFFFFF" } }, alignment: { horizontal: "right", vertical: "middle" } });
  Object.assign(ws.getCell(3, colTitulo), { value: [spec.subtitulo, geradoEm()].filter(Boolean).join(" · "), font: { size: 10, color: { argb: "FFC4CEDC" } }, alignment: { horizontal: "right", vertical: "middle" } });

  // Resumo (totais do período).
  let linha = 6;
  for (const [rotulo, valor] of spec.resumo || []) {
    ws.getCell(linha, 1).value = rotulo;
    ws.getCell(linha, 1).font = { color: { argb: "FF4C5563" } };
    ws.mergeCells(linha, 2, linha, Math.max(2, Math.min(n, 4)));
    ws.getCell(linha, 2).value = valor;
    ws.getCell(linha, 2).font = { bold: true };
    linha++;
  }
  linha++;

  // Tabela.
  const cab = ws.getRow(linha);
  spec.colunas.forEach((c, i) => {
    const cel = cab.getCell(i + 1);
    cel.value = c.titulo;
    cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${AZUL}` } };
    cel.alignment = { vertical: "middle", horizontal: ["moeda", "numero", "km"].includes(c.tipo) ? "right" : "left", wrapText: true };
  });
  cab.height = 22;
  const primeira = linha + 1;
  ws.views = [{ state: "frozen", ySplit: linha, showGridLines: false }];
  spec.linhas.forEach((l, k) => {
    const row = ws.getRow(primeira + k);
    spec.colunas.forEach((c, i) => {
      const v = c.valor(l);
      const cel = row.getCell(i + 1);
      cel.value = v == null || v === "" ? null : c.tipo === "data" ? new Date(v) : v;
      if (c.tipo === "moeda") cel.numFmt = '"R$" #,##0.00';
      if (c.tipo === "km") cel.numFmt = '#,##0.00" km"';
      if (c.tipo === "data") cel.numFmt = "dd/mm/yyyy hh:mm";
      if (k % 2) cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${CINZA_LINHA}` } };
      cel.alignment = { vertical: "top", wrapText: !c.tipo || c.tipo === "texto" };
    });
  });
  if (spec.linhas.length) ws.autoFilter = { from: { row: linha, column: 1 }, to: { row: linha + spec.linhas.length, column: n } };

  // Linha de totais.
  if (spec.totais) {
    const row = ws.getRow(primeira + spec.linhas.length);
    row.getCell(1).value = "TOTAL";
    Object.entries(spec.totais).forEach(([i, v]) => {
      const c = spec.colunas[i];
      const cel = row.getCell(Number(i) + 1);
      cel.value = v;
      if (c.tipo === "moeda") cel.numFmt = '"R$" #,##0.00';
      if (c.tipo === "km") cel.numFmt = '#,##0.00" km"';
    });
    row.eachCell({ includeEmpty: true }, cel => {
      cel.font = { bold: true };
      cel.border = { top: { style: "medium", color: { argb: `FF${AZUL_ESCURO}` } } };
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  baixar(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${spec.arquivo}.xlsx`);
}

// ---------- PDF ----------
export async function exportarPdf(spec) {
  const [{ jsPDF }, { default: autoTable }, lg] = await Promise.all([import("jspdf"), import("jspdf-autotable"), logo()]);
  const doc = new jsPDF({ orientation: spec.colunas.length > 6 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();
  const alt = doc.internal.pageSize.getHeight();
  const margem = 12;

  // Faixa do topo com a logo (só na primeira página).
  doc.setFillColor(`#${AZUL_ESCURO}`);
  doc.rect(0, 0, larg, 30, "F");
  const alturaLogo = 20;
  doc.addImage(lg.jpeg, "JPEG", margem, 5, alturaLogo * lg.proporcao, alturaLogo);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(spec.titulo, larg - margem, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(196, 206, 220);
  doc.text([spec.subtitulo, geradoEm()].filter(Boolean).join(" · "), larg - margem, 21, { align: "right" });

  // Resumo em "cartões" lado a lado.
  let y = 38;
  const resumo = spec.resumo || [];
  if (resumo.length) {
    const porLinha = Math.min(resumo.length, 4);
    const w = (larg - margem * 2 - (porLinha - 1) * 4) / porLinha;
    resumo.forEach(([rotulo, valor], i) => {
      const x = margem + (i % porLinha) * (w + 4);
      const yy = y + Math.floor(i / porLinha) * 18;
      doc.setFillColor(244, 246, 249);
      doc.roundedRect(x, yy, w, 15, 2, 2, "F");
      doc.setTextColor(76, 85, 99);
      doc.setFontSize(8);
      doc.text(String(rotulo), x + 3, yy + 5);
      doc.setTextColor(20, 23, 28);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(String(valor), x + 3, yy + 11.5, { maxWidth: w - 6 });
      doc.setFont("helvetica", "normal");
    });
    y += Math.ceil(resumo.length / porLinha) * 18 + 2;
  }

  const direita = c => ["moeda", "numero", "km"].includes(c.tipo);
  const totais = spec.totais
    ? [spec.colunas.map((c, i) => (i === 0 ? "TOTAL" : spec.totais[i] != null ? textoCelula(c.tipo, spec.totais[i]) : ""))]
    : undefined;
  autoTable(doc, {
    startY: y,
    margin: { left: margem, right: margem, bottom: 14 },
    head: [spec.colunas.map(c => c.titulo)],
    body: spec.linhas.map(l => spec.colunas.map(c => textoCelula(c.tipo, c.valor(l)))),
    foot: totais,
    showFoot: "lastPage",
    styles: { fontSize: 8, cellPadding: 1.8, overflow: "linebreak", textColor: [20, 23, 28] },
    headStyles: { fillColor: [31, 111, 209], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [15, 27, 45], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [244, 246, 249] },
    columnStyles: Object.fromEntries(spec.colunas.map((c, i) => [i, { halign: direita(c) ? "right" : "left", ...(c.larguraPdf ? { cellWidth: c.larguraPdf } : {}) }])),
    didParseCell: d => { if ((d.section === "foot") && direita(spec.colunas[d.column.index])) d.cell.styles.halign = "right"; },
  });

  // Rodapé com numeração em todas as páginas.
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(123, 132, 148);
    doc.text(`Route Delivery · ${spec.titulo}`, margem, alt - 6);
    doc.text(`Página ${p} de ${paginas}`, larg - margem, alt - 6, { align: "right" });
  }
  baixar(doc.output("blob"), `${spec.arquivo}.pdf`);
}
