import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import { Carregando } from "./components/ui";
import Login from "./pages/Login";
import Inicio from "./pages/Inicio";
import NovaEntrega from "./pages/NovaEntrega";
import Pedidos from "./pages/Pedidos";
import Financeiro from "./pages/Financeiro";
import Mensagens from "./pages/Mensagens";
import Conta from "./pages/Conta";

export default function App() {
  const { loja, carregando } = useAuth();

  if (carregando) return <div className="tela-cheia"><Carregando texto="Verificando sessão…" /></div>;
  if (!loja) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/inicio" replace />} />
        <Route path="inicio" element={<Inicio />} />
        <Route path="nova-entrega" element={<NovaEntrega />} />
        <Route path="pedidos" element={<Pedidos />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="mensagens" element={<Mensagens />} />
        <Route path="conta" element={<Conta />} />
        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Route>
    </Routes>
  );
}
