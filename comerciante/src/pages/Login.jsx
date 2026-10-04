import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { reduzirImagem } from "../utils/imagem";

const SEGMENTOS = ["Restaurante", "Lanchonete", "Pizzaria", "Hamburgueria", "Farmácia", "Mercado", "Padaria", "Pet shop", "Floricultura", "Loja de roupas", "Outro"];
const soDigitos = v => String(v || "").replace(/\D/g, "");
const mascaraTel = v => { const d = soDigitos(v).slice(0, 11); return d.length <= 10 ? d.replace(/(\d{2})(\d{0,4})(\d{0,4})/, (_, a, b, c) => [a && `(${a}`, a?.length === 2 && ") ", b, c && `-${c}`].filter(Boolean).join("")) : d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3"); };
const mascaraDoc = (tipo, v) => { const d = soDigitos(v); return tipo === "CPF" ? d.slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, "$1.$2.$3-$4").replace(/[.-]$/, "") : d.slice(0, 14).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, "$1.$2.$3/$4-$5").replace(/[./-]$/, ""); };

// "Cadastre sua Loja": a loja se cadastra sozinha; fica em análise até a equipe aprovar no ADM.
function CadastroLoja({ onVoltar }) {
  const [v, setV] = useState({ nomeFantasia: "", razaoSocial: "", segmento: "", tipoDocumento: "CNPJ", documento: "", nomeCompleto: "", telefone: "", email: "", senha: "", senha2: "", cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "" });
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(null);
  const [foto, setFoto] = useState(null);
  const set = k => e => setV(x => ({ ...x, [k]: e.target.value }));

  // Foto da loja (logo ou fachada): reduzida aqui mesmo, antes de enviar.
  async function escolherFoto(e) {
    const arq = e.target.files?.[0];
    e.target.value = "";
    if (!arq) return;
    setErro(null);
    try { setFoto(await reduzirImagem(arq, 400, 0.85)); } catch (err) { setErro(err.message); }
  }

  // CEP completo: preenche rua, bairro e cidade (ViaCEP).
  async function buscarCep(cep) {
    const d = soDigitos(cep);
    if (d.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`).then(x => x.json());
      if (!r.erro) setV(x => ({ ...x, rua: x.rua || r.logradouro || "", bairro: x.bairro || r.bairro || "", cidade: x.cidade || (r.localidade ? `${r.localidade}${r.uf ? ` - ${r.uf}` : ""}` : "") }));
    } catch { /* sem internet para o CEP: preenche à mão */ }
  }

  async function enviar(e) {
    e.preventDefault();
    setErro(null);
    if (v.senha !== v.senha2) { setErro("As senhas não conferem."); return; }
    setEnviando(true);
    try {
      const r = await api.post("/cadastro", {
        nomeFantasia: v.nomeFantasia, razaoSocial: v.razaoSocial, segmento: v.segmento, tipoDocumento: v.tipoDocumento, documento: v.documento,
        nomeCompleto: v.nomeCompleto, telefone: v.telefone, email: v.email, senha: v.senha, fotoUrl: foto,
        endereco: { cep: v.cep, rua: v.rua, numero: v.numero, complemento: v.complemento, bairro: v.bairro, cidade: v.cidade },
      });
      setFeito(r.mensagem);
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (feito) {
    return (
      <>
        <h1>Cadastro enviado! ✓</h1>
        <p className="subtitulo">{feito}</p>
        <button type="button" className="btn btn-primario btn-bloco" onClick={onVoltar}>Voltar para o login</button>
      </>
    );
  }

  return (
    <>
      <h1>Cadastre sua Loja</h1>
      <p className="subtitulo">Preencha os dados da loja. A equipe Route Delivery confere e libera o seu acesso.</p>
      <form onSubmit={enviar} className="form-acesso form-cadastro-loja">
        <h3>Dados da loja</h3>
        <div className="foto-loja-cadastro">
          <label className="foto-loja-previa" title="Escolher foto da loja">
            {foto ? <img src={foto} alt="Foto da loja" /> : <span aria-hidden="true">📷</span>}
            <input type="file" accept="image/*" onChange={escolherFoto} aria-label="Foto da loja" />
          </label>
          <div>
            <span className="campo-rotulo">Foto da loja</span>
            <p className="apagado">Logo ou fachada. Aparece para os entregadores nas corridas.</p>
            <div className="botoes">
              <label className="btn btn-secundario btn-sm">
                {foto ? "Trocar foto" : "Adicionar foto"}
                <input type="file" accept="image/*" onChange={escolherFoto} hidden />
              </label>
              {foto && <button type="button" className="btn btn-fantasma btn-sm" onClick={() => setFoto(null)}>Remover</button>}
            </div>
          </div>
        </div>
        <label className="campo"><span className="campo-rotulo">Nome da loja *</span><input value={v.nomeFantasia} onChange={set("nomeFantasia")} required autoFocus placeholder="Como os clientes conhecem" /></label>
        <label className="campo"><span className="campo-rotulo">Razão social</span><input value={v.razaoSocial} onChange={set("razaoSocial")} /></label>
        <label className="campo"><span className="campo-rotulo">Segmento</span>
          <select value={v.segmento} onChange={set("segmento")}><option value="">Escolha…</option>{SEGMENTOS.map(s => <option key={s}>{s}</option>)}</select>
        </label>
        <div className="linha-campos">
          <label className="campo" style={{ flex: "0 0 96px" }}><span className="campo-rotulo">Documento</span>
            <select value={v.tipoDocumento} onChange={e => setV(x => ({ ...x, tipoDocumento: e.target.value, documento: "" }))}><option>CNPJ</option><option>CPF</option></select>
          </label>
          <label className="campo" style={{ flex: 1 }}><span className="campo-rotulo">{v.tipoDocumento} *</span><input value={mascaraDoc(v.tipoDocumento, v.documento)} onChange={e => setV(x => ({ ...x, documento: soDigitos(e.target.value) }))} inputMode="numeric" required /></label>
        </div>
        <label className="campo"><span className="campo-rotulo">Nome do responsável *</span><input value={v.nomeCompleto} onChange={set("nomeCompleto")} required /></label>
        <label className="campo"><span className="campo-rotulo">Telefone / WhatsApp *</span><input value={mascaraTel(v.telefone)} onChange={e => setV(x => ({ ...x, telefone: soDigitos(e.target.value) }))} inputMode="tel" required placeholder="(11) 98765-4321" /></label>

        <h3>Endereço de coleta</h3>
        <div className="linha-campos">
          <label className="campo" style={{ flex: "0 0 130px" }}><span className="campo-rotulo">CEP</span><input value={v.cep} onChange={e => { set("cep")(e); buscarCep(e.target.value); }} inputMode="numeric" placeholder="00000-000" /></label>
          <label className="campo" style={{ flex: 1 }}><span className="campo-rotulo">Rua *</span><input value={v.rua} onChange={set("rua")} required /></label>
        </div>
        <div className="linha-campos">
          <label className="campo" style={{ flex: "0 0 110px" }}><span className="campo-rotulo">Número *</span><input value={v.numero} onChange={set("numero")} required /></label>
          <label className="campo" style={{ flex: 1 }}><span className="campo-rotulo">Complemento</span><input value={v.complemento} onChange={set("complemento")} /></label>
        </div>
        <div className="linha-campos">
          <label className="campo" style={{ flex: 1 }}><span className="campo-rotulo">Bairro *</span><input value={v.bairro} onChange={set("bairro")} required /></label>
          <label className="campo" style={{ flex: 1 }}><span className="campo-rotulo">Cidade *</span><input value={v.cidade} onChange={set("cidade")} required /></label>
        </div>

        <h3>Acesso ao sistema</h3>
        <label className="campo"><span className="campo-rotulo">E-mail *</span><input type="email" autoComplete="username" value={v.email} onChange={set("email")} required /></label>
        <div className="linha-campos">
          <label className="campo" style={{ flex: 1 }}><span className="campo-rotulo">Senha *</span><input type="password" autoComplete="new-password" minLength={6} value={v.senha} onChange={set("senha")} required placeholder="Mínimo 6 caracteres" /></label>
          <label className="campo" style={{ flex: 1 }}><span className="campo-rotulo">Repita a senha *</span><input type="password" autoComplete="new-password" value={v.senha2} onChange={set("senha2")} required /></label>
        </div>
        {erro && <div className="erro-caixa" role="alert">{erro}</div>}
        <button type="submit" className="btn btn-primario btn-bloco" disabled={enviando}>{enviando ? "Enviando…" : "Enviar cadastro"}</button>
        <button type="button" className="link centro" onClick={onVoltar}>Já tenho cadastro — entrar</button>
      </form>
    </>
  );
}

// Capa ilustrada: mapa de ruas estilizado, a loja, a rota e o motoboy a caminho do cliente.
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
        <g fill="#ffffff" fillOpacity="0.035">
          {Array.from({ length: 7 }).map((_, i) =>
            Array.from({ length: 7 }).map((__, j) => (
              <rect key={`${i}-${j}`} x={20 + i * 115 + (j % 2) * 18} y={20 + j * 115} width={88} height={88} rx={10} />
            ))
          )}
        </g>
        <g stroke="#ffffff" strokeOpacity="0.09" strokeWidth="14" fill="none" strokeLinecap="round">
          <path d="M-20 250 C 180 230, 330 300, 520 260 S 760 200, 840 230" />
          <path d="M-20 560 C 160 600, 360 520, 560 560 S 760 640, 840 600" />
          <path d="M230 -20 C 250 200, 190 420, 260 620 S 300 760, 290 840" />
          <path d="M600 -20 C 570 180, 640 380, 590 560 S 560 760, 580 840" />
        </g>
        <path className="capa-rota" d="M140 585 C 220 560, 250 480, 330 440 S 470 410, 520 330 S 600 230, 650 215"
          stroke="#4da3ff" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray="4 14" />
        <g transform="translate(140 585)">
          <circle r="26" fill="#ea580c" fillOpacity="0.18" />
          <rect x="-15" y="-15" width="30" height="30" rx="8" fill="#ea580c" stroke="#fff" strokeWidth="3" />
          <path d="M-7 -3h14M-7 -3l2-6h10l2 6M-6 -3v10h12v-10" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round" />
        </g>
        <g transform="translate(650 215)">
          <circle className="capa-pulso" r="34" fill="#22c55e" fillOpacity="0.2" />
          <path d="M0 16 C -14 2, -16 -4, -16 -10 A16 16 0 0 1 16 -10 C 16 -4, 14 2, 0 16 Z" fill="#22c55e" stroke="#fff" strokeWidth="3" />
          <circle cy="-10" r="5" fill="#fff" />
        </g>
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
        <img src="/logo-route-delivery.png" alt="Route Delivery" className="capa-logo" />
        <h2>Sua loja chamando entregador em segundos.</h2>
        <ul>
          <li>Lance a entrega e veja o valor na hora</li>
          <li>Acompanhe o motoboy no mapa até o cliente</li>
          <li>Faturas e histórico de entregas sempre à mão</li>
        </ul>
      </div>
    </div>
  );
}

export default function Login() {
  const { entrar, aviso } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);

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
    <div className="acesso">
      <CapaAcesso />
      <div className="acesso-cartao">
        <div className="marca marca-acesso">
          <span className="marca-selo" aria-hidden="true"><img src="/logo-leao.png" alt="" /></span>
          <div>
            <strong>Route Delivery</strong>
            <small>Sistema do comerciante</small>
          </div>
        </div>
        {cadastrando ? <CadastroLoja onVoltar={() => setCadastrando(false)} /> : <>
        <h1>Entrar na sua loja</h1>
        <p className="subtitulo">Use o e-mail e a senha da sua loja.</p>
        <form onSubmit={enviar} className="form-acesso">
          <label className="campo">
            <span className="campo-rotulo">E-mail</span>
            <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </label>
          <label className="campo">
            <span className="campo-rotulo">Senha</span>
            <input type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} required />
          </label>
          {(erro || aviso) && <div className="erro-caixa" role="alert">{erro || aviso}</div>}
          <button type="submit" className="btn btn-primario btn-bloco" disabled={enviando}>
            {enviando ? "Entrando…" : "Entrar"}
          </button>
          <p className="apagado centro" style={{ fontSize: 12, margin: 0 }}>Esqueceu a senha? Fale com a equipe Route Delivery.</p>
        </form>
        <div className="cadastre-loja">
          <span>Ainda não trabalha com a gente?</span>
          <button type="button" className="btn btn-laranja btn-bloco" onClick={() => setCadastrando(true)}>Cadastre sua Loja</button>
        </div>
        </>}
      </div>
    </div>
  );
}
