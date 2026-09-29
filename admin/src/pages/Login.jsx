import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";

// Capa ilustrada das telas de acesso: mapa de ruas estilizado, rota com pinos e o motoboy a caminho.
function CapaAcesso() {
  return (
    <div className="acesso-capa" aria-hidden="true">
      <svg className="capa-mapa" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="capa-fundo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#0b1628" />
            <stop offset="0.55" stopColor="#10284a" />
            <stop offset="1" stopColor="#123a6b" />
          </linearGradient>
          <radialGradient id="capa-brilho" cx="0.72" cy="0.3" r="0.6">
            <stop offset="0" stopColor="#2a78d6" stopOpacity="0.45" />
            <stop offset="1" stopColor="#2a78d6" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="800" height="800" fill="url(#capa-fundo)" />
        <rect width="800" height="800" fill="url(#capa-brilho)" />
        {/* quarteirões */}
        <g fill="#ffffff" fillOpacity="0.035">
          {Array.from({ length: 7 }).map((_, i) =>
            Array.from({ length: 7 }).map((__, j) => (
              <rect key={`${i}-${j}`} x={20 + i * 115 + (j % 2) * 18} y={20 + j * 115} width={88} height={88} rx={10} />
            ))
          )}
        </g>
        {/* ruas principais */}
        <g stroke="#ffffff" strokeOpacity="0.09" strokeWidth="14" fill="none" strokeLinecap="round">
          <path d="M-20 250 C 180 230, 330 300, 520 260 S 760 200, 840 230" />
          <path d="M-20 560 C 160 600, 360 520, 560 560 S 760 640, 840 600" />
          <path d="M230 -20 C 250 200, 190 420, 260 620 S 300 760, 290 840" />
          <path d="M600 -20 C 570 180, 640 380, 590 560 S 560 760, 580 840" />
        </g>
        {/* rota da entrega */}
        <path className="capa-rota" d="M140 585 C 220 560, 250 480, 330 440 S 470 410, 520 330 S 600 230, 650 215"
          stroke="#4da3ff" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray="4 14" />
        {/* coleta (loja) */}
        <g transform="translate(140 585)">
          <circle r="26" fill="#ea580c" fillOpacity="0.18" />
          <rect x="-15" y="-15" width="30" height="30" rx="8" fill="#ea580c" stroke="#fff" strokeWidth="3" />
          <path d="M-7 -3h14M-7 -3l2-6h10l2 6M-6 -3v10h12v-10" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round" />
        </g>
        {/* entrega (cliente) */}
        <g transform="translate(650 215)">
          <circle className="capa-pulso" r="34" fill="#22c55e" fillOpacity="0.2" />
          <path d="M0 16 C -14 2, -16 -4, -16 -10 A16 16 0 0 1 16 -10 C 16 -4, 14 2, 0 16 Z" fill="#22c55e" stroke="#fff" strokeWidth="3" />
          <circle cy="-10" r="5" fill="#fff" />
        </g>
        {/* motoboy a caminho */}
        <g transform="translate(424 398)">
          <circle r="30" fill="#2a78d6" stroke="#fff" strokeWidth="4" />
          <g stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(-14 -10)">
            <circle cx="5" cy="17" r="4.5" />
            <circle cx="23" cy="17" r="4.5" />
            <path d="M5 17h8l5-8h5M13 17l-3-7h-5M18 9l-2-5h-3" />
          </g>
        </g>
      </svg>
      <div className="capa-texto">
        <span className="capa-selo">Route Delivery</span>
        <h2>Do pedido à porta do cliente, tudo sob controle.</h2>
        <ul>
          <li>Pedidos e entregadores em tempo real no mapa</li>
          <li>Financeiro, acertos e comissões em um só lugar</li>
          <li>Integrações com iFood, 99 Food e outras plataformas</li>
        </ul>
      </div>
    </div>
  );
}

export function TelaAcesso({ titulo, subtitulo, children }) {
  return (
    <div className="acesso">
      <CapaAcesso />
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
