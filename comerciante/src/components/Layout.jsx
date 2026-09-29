import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";

// Quando a loja abriu as mensagens pela última vez (para o aviso de "mensagem nova" no menu).
export const CHAVE_MSG_VISTAS = "rd_loja_msg_vistas";
export function marcarMensagensVistas() {
  try { localStorage.setItem(CHAVE_MSG_VISTAS, new Date().toISOString()); } catch { /* sem armazenamento */ }
  window.dispatchEvent(new Event("rd-msg-vistas"));
}
function mensagensVistasEm() {
  try { return localStorage.getItem(CHAVE_MSG_VISTAS) || ""; } catch { return ""; }
}

const MENU = [
  { para: "/inicio", rotulo: "Início", icone: "◧" },
  { para: "/nova-entrega", rotulo: "Nova entrega", icone: "+" },
  { para: "/pedidos", rotulo: "Pedidos", icone: "☰" },
  { para: "/financeiro", rotulo: "Financeiro", icone: "$" },
  { para: "/mensagens", rotulo: "Mensagens", icone: "✉", chave: "mensagens" },
  { para: "/conta", rotulo: "Minha conta", icone: "⚙" },
  { acao: "sair", rotulo: "Sair", icone: "⏻" },
];

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

export default function Layout() {
  const { loja, email, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();
  const navegar = useNavigate();
  const msgNova = useMensagemNova();

  useEffect(() => { setMenuAberto(false); }, [local.pathname]);

  return (
    <div className="app">
      <aside className={`menu ${menuAberto ? "aberto" : ""}`}>
        <div className="marca marca-imagem">
          <img src="/logo-route-delivery.png" alt="Route Delivery" className="marca-img" />
          <small>Sistema do comerciante</small>
        </div>
        <nav className="menu-lista">
          {MENU.map(i =>
            i.acao === "sair" ? (
              <button key="sair" type="button" className="menu-item menu-botao" onClick={() => sair()}>
                <span className="menu-icone" aria-hidden="true">{i.icone}</span>
                <span>{i.rotulo}</span>
              </button>
            ) : (
              <NavLink key={i.para} to={i.para} className={({ isActive }) => (isActive ? "menu-item ativo" : "menu-item")}>
                <span className="menu-icone" aria-hidden="true">{i.icone}</span>
                <span className="menu-rotulo">{i.rotulo}</span>
                {i.chave === "mensagens" && msgNova && <span className="menu-bolinha" aria-label="mensagem nova" />}
              </NavLink>
            )
          )}
        </nav>
      </aside>
      {menuAberto && <div className="menu-fundo" onClick={() => setMenuAberto(false)} />}

      <div className="principal">
        <header className="topo">
          <button type="button" className="icone-btn so-mobile" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">☰</button>
          <div className="topo-espaco" />
          {local.pathname !== "/nova-entrega" && (
            <button type="button" className="btn btn-primario" onClick={() => navegar("/nova-entrega")}>+ Nova entrega</button>
          )}
          <div className="usuario">
            <span className="avatar" aria-hidden="true">
              {loja?.fotoUrl ? <img src={loja.fotoUrl} alt="" /> : loja?.nomeFantasia?.[0] || "?"}
            </span>
            <div className="usuario-info">
              <strong>{loja?.nomeFantasia}</strong>
              <small>{email}</small>
            </div>
          </div>
        </header>
        <main className="conteudo">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
