import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { TelaAcesso } from "./Login";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [resposta, setResposta] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      setResposta(await api.post("/auth/esqueci-senha", { email }));
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <TelaAcesso titulo="Recuperar senha" subtitulo="Enviaremos um link de redefinição para o seu e-mail.">
      {resposta ? (
        <div className="form-acesso">
          <div className="sucesso-caixa">{resposta.mensagem}</div>
          {resposta.devLink && (
            <div className="aviso-caixa">
              <strong>Ambiente de desenvolvimento:</strong> nenhum e-mail foi enviado. Use o link abaixo para testar.
              <Link to={`/redefinir-senha?token=${resposta.devToken}`} className="link">Abrir link de redefinição</Link>
            </div>
          )}
          <Link to="/" className="link centro">Voltar ao login</Link>
        </div>
      ) : (
        <form onSubmit={enviar} className="form-acesso">
          <label className="campo">
            <span className="campo-rotulo">E-mail</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </label>
          {erro && <div className="erro-caixa" role="alert">{erro}</div>}
          <button type="submit" className="btn btn-primario btn-bloco" disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar link"}
          </button>
          <Link to="/" className="link centro">Voltar ao login</Link>
        </form>
      )}
    </TelaAcesso>
  );
}
