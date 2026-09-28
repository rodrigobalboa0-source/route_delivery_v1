import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, definirAoExpirar, obterToken, salvarToken } from "./api";

const AuthContext = createContext(null);

// Espelha as regras de escrita do backend (middleware/auth.js) só para
// esconder botões que a conta não pode usar — quem decide é sempre a API.
// Áreas fora destas listas (configurações, integrações, contas...) exigem permissão Total.
const ESCRITA_POR_PERMISSAO = {
  OPERACIONAL: ["pedidos", "entregadores", "comercios", "mensagens", "notificacoes", "promocoes", "comissoes-manuais"],
  FINANCEIRO: ["financeiro", "precificacao", "notificacoes", "comissoes-manuais"],
  LEITURA: [],
};

export function AuthProvider({ children }) {
  const [conta, setConta] = useState(null);
  const [carregando, setCarregando] = useState(!!obterToken());

  const sair = useCallback(() => {
    salvarToken(null);
    setConta(null);
  }, []);

  useEffect(() => {
    definirAoExpirar(sair);
    if (!obterToken()) return;
    api.get("/auth/me")
      .then(setConta)
      .catch(sair)
      .finally(() => setCarregando(false));
  }, [sair]);

  const entrar = useCallback(async (email, senha) => {
    const { token, conta: c } = await api.post("/auth/login", { email, senha });
    salvarToken(token);
    setConta(c);
  }, []);

  const podeEditar = useCallback(area => {
    if (!conta) return false;
    if (conta.permissao === "TOTAL") return true;
    return (ESCRITA_POR_PERMISSAO[conta.permissao] || []).includes(area);
  }, [conta]);

  const valor = useMemo(() => ({ conta, carregando, entrar, sair, podeEditar }), [conta, carregando, entrar, sair, podeEditar]);
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
