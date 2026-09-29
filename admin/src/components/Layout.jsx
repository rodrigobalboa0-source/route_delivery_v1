import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import { useApi } from "../hooks/useApi";
import { CARGOS, tempoRelativo } from "../utils/format";

// Ícones em traço do submenu (herdam a cor do texto).
const ICONES = {
  usuarios: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  carteira: <><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" /><path d="M21 9h-5a3 3 0 0 0 0 6h5z" /></>,
  caminhao: <><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7" /><circle cx="6" cy="17.5" r="1.8" /><circle cx="17" cy="17.5" r="1.8" /></>,
  camadas: <><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 12 10 5 10-5" /><path d="m2 17 10 5 10-5" /></>,
  etiqueta: <><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  grafico: <><path d="M3 3v18h18" /><path d="M8 17v-5M13 17V8M18 17v-9" /></>,
  predio: <><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18" /><path d="M8 8h3M8 12h3M8 16h3" /></>,
  rota: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" /></>,
  atividade: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  lista: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  documento: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  repetir: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
  pino: <><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  calendario: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  diagnostico: <><path d="M9 11l2 2 4-4" /><path d="M12 22c5.5-2 8-6 8-11V5l-8-3-8 3v6c0 5 2.5 9 8 11z" /></>,
  setas: <><path d="M7 4 3 8l4 4M3 8h13M17 12l4 4-4 4M21 16H8" /></>,
  relogio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  saida: <><path d="M12 19V5M5 12l7 7 7-7" /><path d="M4 21h16" /></>,
  entrada: <><path d="M12 5v14M5 12l7-7 7 7" /><path d="M4 3h16" /></>,
  moeda: <><circle cx="12" cy="12" r="9" /><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2" /></>,
  fatura: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
  recibo: <><path d="M5 3h14v18H5z" /><path d="m9 12 2 2 4-4M9 7h6" /></>,
  percentual: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
};

function IconeTraco({ nome }) {
  return <svg className="menu-svg" viewBox="0 0 24 24" aria-hidden="true">{ICONES[nome]}</svg>;
}

// Submenu de Cadastros — ordem definida pelo cliente, não reordenar.
const SUBMENU_CADASTROS = [
  { para: "/cadastros/comercios", rotulo: "Comércio", icone: "usuarios" },
  { para: "/cadastros/contas-gerenciais", rotulo: "Contas gerenciais", icone: "carteira" },
  { para: "/cadastros/entregadores", rotulo: "Entregadores", icone: "caminhao" },
  { para: "/cadastros/grupos-operacionais", rotulo: "Grupos operacionais", icone: "camadas" },
  { para: "/cadastros/modais", rotulo: "Modais", icone: "caminhao" },
  { para: "/cadastros/precificacao-padrao", rotulo: "Precificação padrão", icone: "carteira" },
  { para: "/cadastros/tabela-preco-km", rotulo: "Tabela de preço por KM", icone: "carteira" },
  { para: "/cadastros/tabela-comissoes", rotulo: "Tabela de comissões", icone: "carteira" },
  { para: "/cadastros/preco-espera", rotulo: "Preço por espera", icone: "carteira" },
  { para: "/cadastros/preco-dinamico-demanda", rotulo: "Preço dinâmico (demanda)", icone: "carteira" },
  { para: "/cadastros/preco-dinamico-entregador", rotulo: "Preço dinâmico entregador", icone: "carteira" },
  { para: "/cadastros/servicos-opcionais", rotulo: "Serviços opcionais", icone: "camadas" },
  { para: "/cadastros/promocoes", rotulo: "Promoção", icone: "etiqueta" },
];

// Submenu de Relatórios — ordem definida pelo cliente, não reordenar.
const SUBMENU_RELATORIOS = [
  { para: "/relatorios/visao-geral", rotulo: "Relatórios de Entregas", icone: "grafico" },
  { para: "/relatorios/embarcadores", rotulo: "Analítico de Embarcadores", icone: "predio" },
  { para: "/relatorios/entregadores", rotulo: "Analítico de Entregadores", icone: "caminhao" },
  { para: "/relatorios/roteirizacao", rotulo: "Roteirização", icone: "rota" },
  { para: "/relatorios/operacao", rotulo: "Analítico da Operação", icone: "atividade" },
  { para: "/relatorios/entregas", rotulo: "Entregas", icone: "lista" },
  { para: "/relatorios/notas-fiscais", rotulo: "Notas Fiscais", icone: "documento" },
  { para: "/relatorios/recorrencia", rotulo: "Recorrência de Entregas", icone: "repetir" },
  { para: "/relatorios/trajeto", rotulo: "Trajeto dos Entregadores", icone: "pino" },
  { para: "/relatorios/entregadores-periodo", rotulo: "Entregadores por período", icone: "calendario" },
  { para: "/relatorios/diagnostico", rotulo: "Diagnóstico de Entregadores", icone: "diagnostico" },
  { para: "/relatorios/alteracoes-status", rotulo: "Alteração de Status por Entregador", icone: "setas" },
  { para: "/relatorios/vagas", rotulo: "Histórico de Vagas", icone: "relogio" },
];

// Submenu do Financeiro — ordem definida pelo cliente, não reordenar.
const SUBMENU_FINANCEIRO = [
  { para: "/financeiro/acerto", rotulo: "Acerto de Entregadores", icone: "caminhao" },
  { para: "/financeiro/contas-pagar", rotulo: "Contas a Pagar", icone: "saida" },
  { para: "/financeiro/contas-receber", rotulo: "Contas a Receber", icone: "entrada" },
  { para: "/financeiro/credito", rotulo: "Crédito", icone: "carteira" },
  { para: "/financeiro/faturamento", rotulo: "Faturamento", icone: "fatura" },
  { para: "/financeiro/gerar-nota", rotulo: "Gerar Nota", icone: "documento" },
  { para: "/financeiro/gerar-recibo", rotulo: "Gerar Recibo", icone: "recibo" },
  { para: "/financeiro/comissao", rotulo: "Comissão", icone: "percentual" },
];

// Ordem do menu definida pelo cliente — não reordenar.
// "sair" é uma ação (encerra a sessão), não uma rota.
const MENU = [
  { para: "/operacao", rotulo: "Operação", icone: "◧" },
  { para: "/relatorios", rotulo: "Relatórios", icone: "▦", filhos: SUBMENU_RELATORIOS },
  { para: "/cadastros", rotulo: "Cadastros", icone: "☰", filhos: SUBMENU_CADASTROS },
  { para: "/mensagens", rotulo: "Mensagens", icone: "✉" },
  { para: "/financeiro", rotulo: "Financeiro", icone: "$", filhos: SUBMENU_FINANCEIRO },
  { para: "/nova-entrega", rotulo: "Nova Entrega", icone: "+" },
  { para: "/configuracoes", rotulo: "Configurações", icone: "⚙" },
  { para: "/integracoes", rotulo: "Integrações", icone: "⇄" },
  { para: "/promocoes", rotulo: "Promoção", icone: "★" },
  { acao: "sair", rotulo: "Sair", icone: "⏻" },
  { para: "/ajuda", rotulo: "Ajuda", icone: "?" },
];

function Notificacoes() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const { dados, recarregar } = useApi("/notificacoes", { intervaloMs: 60000, aoVivo: ["notificacoes"] });
  const naoLidas = (dados || []).filter(n => !n.lida).length;

  useEffect(() => {
    if (!aberto) return;
    const fora = e => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  async function marcarTodas() {
    await api.patch("/notificacoes/lidas").catch(() => {});
    recarregar({ silencioso: true });
  }

  return (
    <div className="notificacoes" ref={ref}>
      <button type="button" className="icone-btn" onClick={() => setAberto(a => !a)} aria-label={`Notificações (${naoLidas} não lidas)`}>
        <span aria-hidden="true">🔔</span>
        {naoLidas > 0 && <span className="bolinha">{naoLidas}</span>}
      </button>
      {aberto && (
        <div className="popover">
          <div className="popover-topo">
            <strong>Notificações</strong>
            {naoLidas > 0 && <button type="button" className="link" onClick={marcarTodas}>Marcar todas como lidas</button>}
          </div>
          <ul className="lista-notificacoes">
            {(dados || []).length === 0 && <li className="apagado">Nenhuma notificação.</li>}
            {(dados || []).slice(0, 15).map(n => (
              <li key={n.id} className={n.lida ? "lida" : ""}>
                <span>{n.texto}</span>
                <small>{tempoRelativo(n.createdAt)}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { conta, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();

  // Grupos expandidos (ex.: Cadastros). Abre sozinho quando a rota atual está dentro do grupo.
  const [gruposAbertos, setGruposAbertos] = useState(() => new Set(MENU.filter(i => i.filhos && local.pathname.startsWith(i.para)).map(i => i.para)));

  useEffect(() => {
    setMenuAberto(false);
    const grupo = MENU.find(i => i.filhos && local.pathname.startsWith(i.para + "/"));
    if (grupo) setGruposAbertos(g => (g.has(grupo.para) ? g : new Set([...g, grupo.para])));
  }, [local.pathname]);

  function alternarGrupo(para) {
    setGruposAbertos(g => {
      const n = new Set(g);
      if (n.has(para)) n.delete(para); else n.add(para);
      return n;
    });
  }

  return (
    <div className="app">
      <aside className={`menu ${menuAberto ? "aberto" : ""}`}>
        <div className="marca marca-imagem">
          <img src="/logo-route-delivery.png" alt="Route Delivery" className="marca-img" />
          <small>Painel administrativo</small>
        </div>
        <nav className="menu-lista">
          {MENU.map(i =>
            i.acao === "sair" ? (
              <button key="sair" type="button" className="menu-item menu-botao" onClick={sair}>
                <span className="menu-icone" aria-hidden="true">{i.icone}</span>
                <span>{i.rotulo}</span>
              </button>
            ) : i.filhos ? (
              <div key={i.para} className="menu-grupo">
                <button
                  type="button"
                  className={`menu-item menu-botao ${local.pathname.startsWith(i.para + "/") ? "ativo" : ""}`}
                  aria-expanded={gruposAbertos.has(i.para)}
                  onClick={() => alternarGrupo(i.para)}
                >
                  <span className="menu-icone" aria-hidden="true">{i.icone}</span>
                  <span className="menu-rotulo">{i.rotulo}</span>
                  <span className={`menu-seta ${gruposAbertos.has(i.para) ? "aberta" : ""}`} aria-hidden="true">›</span>
                </button>
                {gruposAbertos.has(i.para) && (
                  <div className="submenu">
                    {i.filhos.map(f => (
                      <NavLink key={f.para} to={f.para} title={f.rotulo} className={({ isActive }) => (isActive ? "submenu-item ativo" : "submenu-item")}>
                        <IconeTraco nome={f.icone} />
                        <span>{f.rotulo}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink key={i.para} to={i.para} className={({ isActive }) => (isActive ? "menu-item ativo" : "menu-item")}>
                <span className="menu-icone" aria-hidden="true">{i.icone}</span>
                <span>{i.rotulo}</span>
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
          <Notificacoes />
          <div className="usuario">
            <span className="avatar" aria-hidden="true">{conta?.nome?.[0] || "?"}</span>
            <div className="usuario-info">
              <strong>{conta?.nome}</strong>
              <small>{CARGOS[conta?.cargo] || conta?.cargo}</small>
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
