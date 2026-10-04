import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Rastreio from "./pages/Rastreio";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import { Carregando } from "./components/ui";
import Login from "./pages/Login";
import Painel from "./pages/Painel";
import NovaEntrega from "./pages/NovaEntrega";
import Pedidos from "./pages/Pedidos";
import Agendamentos from "./pages/Agendamentos";
import Devolucoes from "./pages/Devolucoes";
import Financeiro from "./pages/Financeiro";
import Mensagens from "./pages/Mensagens";
import Conta from "./pages/Conta";

export default function App() {
  const { loja, carregando } = useAuth();
  const { pathname } = useLocation();

  // Rastreio público: o cliente abre sem login.
  if (pathname.startsWith("/rastreio/")) {
    return <Routes><Route path="/rastreio/:token" element={<Rastreio />} /></Routes>;
  }
  if (carregando) return <div className="tela-cheia"><Carregando texto="Verificando sessão…" /></div>;
  if (!loja) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/painel" replace />} />
        <Route path="painel" element={<Painel />} />
        <Route path="solicitar" element={<NovaEntrega key="solicitar" />} />
        <Route path="relatorios">
          <Route index element={<Navigate to="entregas" replace />} />
          <Route path="entregas" element={<Pedidos />} />
          <Route path="financeiro" element={<Financeiro />} />
        </Route>
        <Route path="agendamentos" element={<Agendamentos />} />
        <Route path="agendamentos/novo" element={<NovaEntrega key="agendar" agendar />} />
        <Route path="devolucoes" element={<Devolucoes />} />
        <Route path="mensagens" element={<Mensagens />} />
        <Route path="conta" element={<Conta />} />

        {/* Endereços da primeira versão */}
        <Route path="inicio" element={<Navigate to="/painel" replace />} />
        <Route path="nova-entrega" element={<Navigate to="/solicitar" replace />} />
        <Route path="pedidos" element={<Navigate to="/relatorios/entregas" replace />} />
        <Route path="financeiro" element={<Navigate to="/relatorios/financeiro" replace />} />
        <Route path="*" element={<Navigate to="/painel" replace />} />
      </Route>
    </Routes>
  );
}
