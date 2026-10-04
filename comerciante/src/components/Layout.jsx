import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { AvisoNegociacoes } from "./NegociacaoIfood";

// Quando a loja abriu as mensagens pela última vez (para o aviso de "mensagem nova").
export const CHAVE_MSG_VISTAS = "rd_loja_msg_vistas";
export function marcarMensagensVistas() {
  try { localStorage.setItem(CHAVE_MSG_VISTAS, new Date().toISOString()); } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event("rd-msg-vistas"));
}
function mensagensVistasEm() {
  try { return localStorage.getItem(CHAVE_MSG_VISTAS) || ""; } catch { return ""; }
}

// Ícones em traço (herdam a cor do texto).
const ICONES = {
  painel: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  solicitar: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M12 12v6M9 15h6" /></>,
  relatorios: <><path d="M3 3v18h18" /><path d="M8 17v-5M13 17V8M18 17v-9" /></>,
  agenda: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  credito: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M16 12h5v4h-5a2 2 0 0 1 0-4zM3 9h14" /></>,
  mensagens: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  conta: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  sair: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  seta: <path d="m6 9 6 6 6-6" />,
};
export function Icone({ nome, className = "" }) {
  return <svg className={`icone ${className}`} viewBox="0 0 24 24" aria-hidden="true">{ICONES[nome]}</svg>;
}

// Menu do topo (ordem igual à referência enviada pelo cliente).
const MENU = [
  { para: "/painel", rotulo: "Painel de Controle", icone: "painel" },
  { para: "/solicitar", rotulo: "Solicitar Entrega", icone: "solicitar" },
  { rotulo: "Relatórios", icone: "relatorios", base: "/relatorios", filhos: [
    { para: "/relatorios/entregas", rotulo: "Entregas" },
  ] },
  { rotulo: "Agendamentos", icone: "agenda", base: "/agendamentos", filhos: [
    { para: "/agendamentos", rotulo: "Entregas agendadas" },
    { para: "/agendamentos/novo", rotulo: "Novo agendamento" },
  ] },
  { para: "/creditos", rotulo: "Créditos", icone: "credito" },
];

function useFora(ref, aberto, fechar) {
  useEffect(() => {
    if (!aberto) return;
    const h = e => { if (ref.current && !ref.current.contains(e.target)) fechar(); };
    const esc = e => { if (e.key === "Escape") fechar(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", esc); };
  }, [aberto, fechar, ref]);
}

function Suspenso({ item, ativo }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useFora(ref, aberto, () => setAberto(false));
  return (
    <div className="topo-grupo" ref={ref}>
      <button type="button" className={`topo-link ${ativo ? "ativo" : ""}`} aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
        <Icone nome={item.icone} /> {item.rotulo} <Icone nome="seta" className="icone-seta" />
      </button>
      {aberto && (
        <div className="topo-suspenso" onClick={() => setAberto(false)}>
          {item.filhos.map(f => <NavLink key={f.para} to={f.para} end className="topo-suspenso-item">{f.rotulo}</NavLink>)}
        </div>
      )}
    </div>
  );
}

// Há resposta da equipe que a loja ainda não viu?
function useMensagemNova() {
  const { dados } = useApi("/mensagens", { aoVivo: ["mensagens"] });
  const [vistas, setVistas] = useState(mensagensVistasEm);
  useEffect(() => {
    const h = () => setVistas(mensagensVistasEm());
    window.addEventListener("rd-msg-vistas", h);
    return () => window.removeEventListener("rd-msg-vistas", h);
  }, []);
  const ultimaDaEquipe = (dados || []).filter(m => !m.minha).at(-1);
  return !!ultimaDaEquipe && ultimaDaEquipe.createdAt > vistas;
}

function iniciais(nome = "") {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : p[0]?.[1] || "")).toUpperCase();
}

function MenuConta({ msgNova }) {
  const { loja, email, sair } = useAuth();
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  useFora(ref, aberto, () => setAberto(false));
  return (
    <div className="topo-grupo topo-conta" ref={ref}>
      <button type="button" className="topo-avatar" aria-label={`Conta de ${loja?.nomeFantasia}`} aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
        {loja?.fotoUrl ? <img src={loja.fotoUrl} alt="" /> : iniciais(loja?.nomeFantasia)}
        {msgNova && <span className="menu-bolinha" aria-label="mensagem nova" />}
      </button>
      {aberto && (
        <div className="topo-suspenso topo-suspenso-direita" onClick={() => setAberto(false)}>
          <div className="topo-suspenso-cabeca">
            <strong>{loja?.nomeFantasia}</strong>
            <small>{email}</small>
          </div>
          <NavLink to="/mensagens" className="topo-suspenso-item">
            <Icone nome="mensagens" /> Mensagens {msgNova && <span className="badge badge-critico">nova</span>}
          </NavLink>
          <NavLink to="/conta" className="topo-suspenso-item"><Icone nome="conta" /> Minha conta</NavLink>
          <button type="button" className="topo-suspenso-item" onClick={() => sair()}><Icone nome="sair" /> Sair</button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();
  const msgNova = useMensagemNova();

  useEffect(() => { setMenuAberto(false); }, [local.pathname]);

  return (
    <div className="loja-app">
      <header className="loja-topo">
        <div className="loja-marca">
          <img src="/logo-route-delivery.png" alt="Route Delivery" />
        </div>
        <button type="button" className="icone-btn loja-hamburguer" onClick={() => setMenuAberto(a => !a)} aria-label="Abrir menu" aria-expanded={menuAberto}>☰</button>
        <nav className={`loja-nav ${menuAberto ? "aberto" : ""}`}>
          {MENU.map(i =>
            i.filhos ? (
              <Suspenso key={i.rotulo} item={i} ativo={local.pathname.startsWith(i.base)} />
            ) : (
              <NavLink key={i.para} to={i.para} className={({ isActive }) => `topo-link ${isActive ? "ativo" : ""}`}>
                <Icone nome={i.icone} /> {i.rotulo}
              </NavLink>
            )
          )}
        </nav>
        <MenuConta msgNova={msgNova} />
      </header>
      <main className="loja-conteudo">
        <AvisoNegociacoes />
        <Outlet />
      </main>
    </div>
  );
}
