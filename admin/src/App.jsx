import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import { Carregando } from "./components/ui";
import Login from "./pages/Login";
import EsqueciSenha from "./pages/EsqueciSenha";
import RedefinirSenha from "./pages/RedefinirSenha";
import Operacao from "./pages/Operacao";
import Relatorios from "./pages/Relatorios";
import Embarcadores from "./pages/relatorios/Embarcadores";
import EntregadoresAnalitico from "./pages/relatorios/EntregadoresAnalitico";
import Roteirizacao from "./pages/relatorios/Roteirizacao";
import AnaliticoOperacao from "./pages/relatorios/AnaliticoOperacao";
import Entregas from "./pages/relatorios/Entregas";
import NotasFiscais from "./pages/relatorios/NotasFiscais";
import Recorrencia from "./pages/relatorios/Recorrencia";
import Trajeto from "./pages/relatorios/Trajeto";
import EntregadoresPeriodo from "./pages/relatorios/EntregadoresPeriodo";
import Diagnostico from "./pages/relatorios/Diagnostico";
import AlteracoesStatus from "./pages/relatorios/AlteracoesStatus";
import Vagas from "./pages/relatorios/Vagas";
import Entregadores from "./pages/Entregadores";
import Comercios from "./pages/Comercios";
import FormComercio from "./pages/FormComercio";
import { PaginaCadastro } from "./pages/Cadastros";
import ContasGerenciais from "./pages/ContasGerenciais";
import Mensagens from "./pages/Mensagens";
import Acerto from "./pages/financeiro/Acerto";
import DashboardFinanceiro from "./pages/financeiro/Dashboard";
import ContasPagar from "./pages/financeiro/ContasPagar";
import ContasReceber from "./pages/financeiro/ContasReceber";
import Credito from "./pages/financeiro/Credito";
import Saques from "./pages/financeiro/Saques";
import Faturamento from "./pages/financeiro/Faturamento";
import GerarNota from "./pages/financeiro/GerarNota";
import GerarRecibo from "./pages/financeiro/GerarRecibo";
import Comissao from "./pages/financeiro/Comissao";
import { ImprimirNota, ImprimirRecibo } from "./pages/financeiro/Imprimir";
import NovaEntrega from "./pages/NovaEntrega";
import Configuracoes from "./pages/Configuracoes";
import Integracoes from "./pages/Integracoes";
import IntegracaoDetalhe from "./pages/IntegracaoDetalhe";
import Promocoes from "./pages/Promocoes";
import Ajuda from "./pages/Ajuda";

// Redireciona mantendo a query string (ex.: ?abrir=<pedido>).
function Redirecionar({ para }) {
  const { search } = useLocation();
  return <Navigate to={para + search} replace />;
}

// Cadastros simples (tabela ou formulário único), cada um com sua rota /cadastros/<chave>.
// Franquias e hubs não estão no submenu, mas continuam acessíveis pela rota.
const CADASTROS_SIMPLES = [
  "grupos-operacionais", "modais", "precificacao-padrao", "tabela-preco-km", "tabela-comissoes", "preco-espera",
  "preco-dinamico-demanda", "preco-dinamico-entregador", "servicos-opcionais", "promocoes", "franquias", "hubs",
];

export default function App() {
  const { conta, carregando } = useAuth();

  if (carregando) return <div className="tela-cheia"><Carregando texto="Verificando sessão…" /></div>;

  if (!conta) {
    return (
      <Routes>
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Documentos para impressão: aba própria, sem o menu lateral */}
      <Route path="imprimir/recibo/:id" element={<ImprimirRecibo />} />
      <Route path="imprimir/nota/:faturaId" element={<ImprimirNota />} />

      <Route element={<Layout />}>
        <Route index element={<Navigate to="/operacao" replace />} />

        <Route path="operacao" element={<Operacao />} />
        <Route path="operacao/pedidos" element={<Redirecionar para="/operacao" />} />

        <Route path="relatorios">
          <Route index element={<Navigate to="visao-geral" replace />} />
          <Route path="visao-geral" element={<Relatorios />} />
          <Route path="embarcadores" element={<Embarcadores />} />
          <Route path="entregadores" element={<EntregadoresAnalitico />} />
          <Route path="roteirizacao" element={<Roteirizacao />} />
          <Route path="operacao" element={<AnaliticoOperacao />} />
          <Route path="entregas" element={<Entregas />} />
          <Route path="notas-fiscais" element={<NotasFiscais />} />
          <Route path="recorrencia" element={<Recorrencia />} />
          <Route path="trajeto" element={<Trajeto />} />
          <Route path="entregadores-periodo" element={<EntregadoresPeriodo />} />
          <Route path="diagnostico" element={<Diagnostico />} />
          <Route path="alteracoes-status" element={<AlteracoesStatus />} />
          <Route path="vagas" element={<Vagas />} />
        </Route>

        <Route path="cadastros">
          <Route index element={<Navigate to="comercios" replace />} />
          <Route path="comercios" element={<Comercios />} />
          <Route path="comercios/novo" element={<FormComercio key="novo" />} />
          <Route path="comercios/:id" element={<FormComercio />} />
          <Route path="contas-gerenciais" element={<ContasGerenciais />} />
          <Route path="entregadores" element={<Entregadores />} />
          {CADASTROS_SIMPLES.map(chave => (
            <Route key={chave} path={chave} element={<PaginaCadastro key={chave} chave={chave} />} />
          ))}
          {/* Endereços da versão anterior */}
          <Route path="comerciantes" element={<Navigate to="/cadastros/comercios" replace />} />
          <Route path="contas" element={<Navigate to="/cadastros/contas-gerenciais" replace />} />
          <Route path="precos" element={<Navigate to="/cadastros/precificacao-padrao" replace />} />
          <Route path="estrutura" element={<Navigate to="/cadastros/grupos-operacionais" replace />} />
        </Route>

        <Route path="mensagens" element={<Mensagens />} />
        <Route path="financeiro">
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardFinanceiro />} />
          <Route path="acerto" element={<Acerto />} />
          <Route path="contas-pagar" element={<ContasPagar />} />
          <Route path="contas-receber" element={<ContasReceber />} />
          <Route path="credito" element={<Credito />} />
          <Route path="saques" element={<Saques />} />
          <Route path="faturamento" element={<Faturamento />} />
          <Route path="gerar-nota" element={<GerarNota />} />
          <Route path="gerar-recibo" element={<GerarRecibo />} />
          <Route path="comissao" element={<Comissao />} />
        </Route>
        <Route path="nova-entrega" element={<NovaEntrega />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="integracoes" element={<Integracoes />} />
        <Route path="integracoes/:slug" element={<IntegracaoDetalhe />} />
        <Route path="promocoes" element={<Promocoes />} />
        <Route path="ajuda" element={<Ajuda />} />

        {/* Endereços antigos continuam funcionando */}
        <Route path="pedidos" element={<Redirecionar para="/operacao" />} />
        <Route path="entregadores" element={<Navigate to="/cadastros/entregadores" replace />} />
        <Route path="comercios" element={<Navigate to="/cadastros/comercios" replace />} />
        <Route path="contas" element={<Navigate to="/cadastros/contas-gerenciais" replace />} />

        <Route path="*" element={<Navigate to="/operacao" replace />} />
      </Route>
    </Routes>
  );
}
