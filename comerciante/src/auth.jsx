import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, definirAoExpirar, obterToken, salvarToken } from "./api";

const AuthContext = createContext(null);

// Sessão da loja: o token fica no navegador; "/me" traz os dados do comércio.
export function AuthProvider({ children }) {
  const [loja, setLoja] = useState(null);
  const [email, setEmail] = useState(null);
  const [carregando, setCarregando] = useState(!!obterToken());
  const [aviso, setAviso] = useState(null); // motivo de ter saído (ex.: comércio bloqueado)

  const sair = useCallback(motivo => {
    salvarToken(null);
    setLoja(null);
    setAviso(typeof motivo === "string" ? motivo : null);
  }, []);

  const carregarLoja = useCallback(() => api.get("/me").then(setLoja), []);

  useEffect(() => {
    definirAoExpirar(sair);
    if (!obterToken()) return;
    try { setEmail(localStorage.getItem("rd_loja_email")); } catch { /* sem armazenamento */ }
    carregarLoja().catch(e => sair(e.status === 403 ? e.message : null)).finally(() => setCarregando(false));
  }, [sair, carregarLoja]);

  const entrar = useCallback(async (e, senha) => {
    const r = await api.post("/login", { email: e, senha });
    salvarToken(r.token);
    try { localStorage.setItem("rd_loja_email", r.usuario.email); } catch { /* sem armazenamento */ }
    setEmail(r.usuario.email);
    setAviso(null);
    await carregarLoja();
  }, [carregarLoja]);

  const valor = useMemo(() => ({ loja, email, carregando, aviso, entrar, sair, recarregarLoja: carregarLoja }), [loja, email, carregando, aviso, entrar, sair, carregarLoja]);
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
