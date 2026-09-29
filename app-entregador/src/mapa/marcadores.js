// HTML dos marcadores do mapa (usado no navegador e dentro do WebView no celular).
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function iniciais(nome = "") {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

// Foto (ou iniciais) do entregador com bolinha: verde online, cinza offline.
export function htmlAvatar({ fotoUrl, nome, online }) {
  const miolo = fotoUrl
    ? `<img src="${esc(fotoUrl)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`
    : `<span style="color:#fff;font:700 16px system-ui,sans-serif">${esc(iniciais(nome))}</span>`;
  return `<div style="position:relative;width:48px;height:48px;border-radius:50%;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.35);background:#2a78d6;display:grid;place-items:center">${miolo}<i style="position:absolute;right:-1px;bottom:-1px;width:13px;height:13px;border-radius:50%;border:2px solid #fff;background:${online ? "#22c55e" : "#8a93a1"}"></i></div>`;
}

export function htmlLoja() {
  return `<div style="width:30px;height:30px;border-radius:8px;background:#ea580c;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:grid;place-items:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6"/></svg></div>`;
}

export function htmlCliente() {
  return `<svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 37C7 26 2 20 2 13a13 13 0 0 1 26 0c0 7-5 13-13 24z" fill="#16a34a" stroke="#fff" stroke-width="3"/><circle cx="15" cy="13" r="5" fill="#fff"/></svg>`;
}

export const CENTRO_PADRAO = { lat: -23.5505, lng: -46.6333 }; // São Paulo
