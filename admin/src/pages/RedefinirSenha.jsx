import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { TelaAcesso } from "./Login";

export default function RedefinirSenha() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [ok, setOk] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    if (senha !== confirmacao) return setErro("As senhas não conferem.");
    setEnviando(true);
    try {
      const r = await api.post("/auth/redefinir-senha", { token, novaSenha: senha });
      setOk(r.mensagem);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <TelaAcesso titulo="Definir nova senha">
      {ok ? (
        <div className="form-acesso">
          <div className="sucesso-caixa">{ok}</div>
          <Link to="/" className="btn btn-primario btn-bloco">Ir para o login</Link>
        </div>
      ) : !token ? (
        <div className="form-acesso">
          <div className="erro-caixa">Link inválido. Solicite uma nova redefinição.</div>
          <Link to="/esqueci-senha" className="link centro">Solicitar novo link</Link>
        </div>
      ) : (
        <form onSubmit={enviar} className="form-acesso">
          <label className="campo">
            <span className="campo-rotulo">Nova senha</span>
            <input type="password" minLength={8} value={senha} onChange={e => setSenha(e.target.value)} required autoFocus />
            <span className="campo-dica">Mínimo de 8 caracteres.</span>
          </label>
          <label className="campo">
            <span className="campo-rotulo">Confirme a nova senha</span>
            <input type="password" minLength={8} value={confirmacao} onChange={e => setConfirmacao(e.target.value)} required />
          </label>
          {erro && <div className="erro-caixa" role="alert">{erro}</div>}
          <button type="submit" className="btn btn-primario btn-bloco" disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar nova senha"}
          </button>
        </form>
      )}
    </TelaAcesso>
  );
}
