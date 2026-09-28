import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";

export function TelaAcesso({ titulo, subtitulo, children }) {
  return (
    <div className="acesso">
      <div className="acesso-cartao">
        <div className="marca marca-acesso">
          <span className="marca-logo" aria-hidden="true">R</span>
          <div>
            <strong>Route Delivery</strong>
            <small>Painel administrativo</small>
          </div>
        </div>
        <h1>{titulo}</h1>
        {subtitulo && <p className="subtitulo">{subtitulo}</p>}
        {children}
      </div>
    </div>
  );
}

export default function Login() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <TelaAcesso titulo="Entrar" subtitulo="Gerencie entregadores, comerciantes e pedidos em um só lugar.">
      <form onSubmit={enviar} className="form-acesso">
        <label className="campo">
          <span className="campo-rotulo">E-mail</span>
          <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Senha</span>
          <input type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} required />
        </label>
        {erro && <div className="erro-caixa" role="alert">{erro}</div>}
        <button type="submit" className="btn btn-primario btn-bloco" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
        <Link to="/esqueci-senha" className="link centro">Esqueci minha senha</Link>
      </form>
    </TelaAcesso>
  );
}
