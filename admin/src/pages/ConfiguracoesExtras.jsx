// Configurações › Ranking semanal e E-mail (recuperação de senha).
import { useState } from "react";
import { api } from "../api";
import { useApi } from "../hooks/useApi";
import { Badge, Botao, Campo, Carregando, ErroCaixa, useAcao } from "../components/ui";
import { data, moeda } from "../utils/format";

const POSICOES = Array.from({ length: 10 }, (_, i) => i + 1);

// ---------- Ranking semanal ----------

export function RankingSemanal({ dados, setDados, pode }) {
  const ranking = useApi("/ranking", { aoVivo: ["pedidos"] });
  const [v, setV] = useState(null);
  const { executar, ocupado } = useAcao();
  const atual = v || (dados && {
    rankingAtivo: dados.rankingAtivo,
    rankingMinimoEntregas: dados.rankingMinimoEntregas,
    rankingPremios: POSICOES.map((_, i) => (Array.isArray(dados.rankingPremios) ? dados.rankingPremios[i] : 0) ?? 0),
  });
  const total = atual ? atual.rankingPremios.reduce((s, x) => s + (Number(String(x).replace(",", ".")) || 0), 0) : 0;
  const setPremio = (i, valor) => setV({ ...atual, rankingPremios: atual.rankingPremios.map((x, j) => (j === i ? valor : x)) });

  async function salvar(e) {
    e.preventDefault();
    const r = await executar(() => api.put("/configuracoes", {
      rankingAtivo: atual.rankingAtivo,
      rankingMinimoEntregas: Number(atual.rankingMinimoEntregas) || 0,
      rankingPremios: atual.rankingPremios.map(x => String(x).replace(",", ".")),
    }), "Ranking semanal salvo.");
    if (r) { setDados(r); setV(null); ranking.recarregar({ silencioso: true }); }
  }

  const r = ranking.dados;
  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>Ranking semanal dos entregadores</h2>
        {atual && <Badge tom={atual.rankingAtivo ? "ok" : "apagado"}>{atual.rankingAtivo ? "● Ativo" : "Desativado"}</Badge>}
      </div>
      <p className="apagado" style={{ marginTop: 0 }}>
        Conta as entregas finalizadas de <strong>segunda 00:00 a domingo 23:59</strong>. Na virada da semana o sistema fecha o ranking sozinho e lança o
        prêmio de cada um dos 10 primeiros como comissão: aparece no app do entregador (com aviso) e gera uma conta a pagar no Financeiro.
      </p>
      {!atual ? <Carregando /> : (
        <form onSubmit={salvar}>
          <div className="grade-campos">
            <label className="campo campo-switch">
              <input type="checkbox" role="switch" checked={!!atual.rankingAtivo} disabled={!pode} onChange={e => setV({ ...atual, rankingAtivo: e.target.checked })} />
              <span className="interruptor" aria-hidden="true" />
              <span>Ranking ativo (aba “Ranking” no app)</span>
            </label>
            <Campo rotulo="Mínimo de entregas na semana para entrar" dica="Quem fizer menos que isso não aparece no ranking.">
              <input type="number" min="0" step="1" value={atual.rankingMinimoEntregas} disabled={!pode} onChange={e => setV({ ...atual, rankingMinimoEntregas: e.target.value })} />
            </Campo>
          </div>
          <h3 className="secao-titulo">Prêmio por colocação (R$)</h3>
          <div className="grade-premios">
            {POSICOES.map((p, i) => (
              <label key={p} className="campo">
                <span className="campo-rotulo">{p}º lugar</span>
                <input type="number" min="0" step="0.01" value={atual.rankingPremios[i]} disabled={!pode} onChange={e => setPremio(i, e.target.value)} aria-label={`Prêmio do ${p}º lugar`} />
              </label>
            ))}
          </div>
          <p className="apagado">Total de prêmios por semana: <strong>{moeda(total)}</strong>. Deixe R$ 0 nas colocações sem prêmio.</p>
          {pode && v && (
            <div className="form-rodape">
              <Botao variante="fantasma" onClick={() => setV(null)}>Descartar</Botao>
              <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar ranking</button>
            </div>
          )}
        </form>
      )}

      <h3 className="secao-titulo">Semana atual {r && <span className="apagado">— {data(r.atual.inicio)} a {data(r.atual.fim)}</span>}</h3>
      <ErroCaixa erro={ranking.erro} />
      {!r ? <Carregando /> : r.atual.lista.length === 0 ? <p className="apagado">Nenhuma entrega finalizada nesta semana ainda.</p> : (
        <div className="tabela-rolagem">
          <table className="tabela tabela-compacta">
            <thead><tr><th>Posição</th><th>Entregador</th><th className="num">Entregas</th><th className="num">Prêmio</th></tr></thead>
            <tbody>
              {r.atual.lista.slice(0, 20).map(x => (
                <tr key={x.entregadorId}>
                  <td>{x.posicao <= 3 ? ["🥇", "🥈", "🥉"][x.posicao - 1] : ""} {x.posicao}º</td>
                  <td>{x.nome}</td>
                  <td className="num">{x.entregas}</td>
                  <td className="num">{x.premio > 0 ? moeda(x.premio) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {r?.fechadas?.length > 0 && (
        <>
          <h3 className="secao-titulo">Semanas fechadas</h3>
          {r.fechadas.map(s => (
            <details key={s.id} className="semana-fechada">
              <summary>
                {data(s.inicio)} a {data(s.fim)} · {(s.resultado || []).length} classificado(s) · prêmios {moeda(s.premiosTotal)}
                {s.resultado?.[0] && <span className="apagado"> · 1º {s.resultado[0].nome} ({s.resultado[0].entregas})</span>}
              </summary>
              <table className="tabela tabela-compacta">
                <tbody>
                  {(s.resultado || []).map(x => (
                    <tr key={x.posicao}><td>{x.posicao}º</td><td>{x.nome}</td><td className="num">{x.entregas} entregas</td><td className="num">{x.premio > 0 ? `${moeda(x.premio)} ✓ lançado` : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
        </>
      )}
    </section>
  );
}

// ---------- E-mail ----------

export function EmailEnvio({ dados, setDados, pode }) {
  const [v, setV] = useState(null);
  const [para, setPara] = useState("");
  const { executar, ocupado } = useAcao();
  const atual = v || (dados && {
    emailProvedor: dados.emailProvedor || "", emailRemetente: dados.emailRemetente || "",
    smtpHost: dados.smtpHost || "", smtpPorta: dados.smtpPorta || "", smtpUsuario: dados.smtpUsuario || "", smtpSenha: "", resendChave: "",
  });
  const set = k => e => setV({ ...atual, [k]: e.target.value });
  const configurado = dados && (dados.emailProvedor === "SMTP" ? dados.email?.smtpSenhaSalva && dados.smtpHost : dados.emailProvedor === "RESEND" ? dados.email?.resendChaveSalva : false);

  function usarGmail() {
    setV({ ...atual, emailProvedor: "SMTP", smtpHost: "smtp.gmail.com", smtpPorta: 465, emailRemetente: atual.emailRemetente || atual.smtpUsuario });
  }

  async function salvar(e) {
    e.preventDefault();
    const r = await executar(() => api.put("/configuracoes/email", atual), "Configuração de e-mail salva.");
    if (r) { setDados(r); setV(null); }
  }

  async function testar(e) {
    e.preventDefault();
    await executar(() => api.post("/configuracoes/email/testar", { para }), `E-mail de teste enviado para ${para}. Confira a caixa de entrada (e o spam).`);
  }

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>E-mail (recuperação de senha)</h2>
        {dados && <Badge tom={configurado ? "ok" : "aviso"}>{configurado ? "● Configurado" : "Não configurado"}</Badge>}
      </div>
      <p className="apagado" style={{ marginTop: 0 }}>
        Usado para enviar o código de “Esqueci minha senha” do app do entregador e o link de nova senha do painel.
        O jeito mais simples é uma conta Gmail com <strong>senha de app</strong>.
      </p>
      {!atual ? <Carregando /> : (
        <form onSubmit={salvar}>
          <div className="grade-campos">
            <Campo rotulo="Serviço de envio">
              <select value={atual.emailProvedor} onChange={set("emailProvedor")} disabled={!pode}>
                <option value="">Não enviar</option>
                <option value="SMTP">SMTP (Gmail, Outlook, provedor do domínio…)</option>
                <option value="RESEND">Resend (chave de API)</option>
              </select>
            </Campo>
            <Campo rotulo="E-mail remetente" dica="Aparece como “De:”. No Gmail, use o próprio endereço da conta.">
              <input type="email" value={atual.emailRemetente} onChange={set("emailRemetente")} disabled={!pode} placeholder="contato@seudominio.com" />
            </Campo>
            {atual.emailProvedor === "SMTP" && (
              <>
                <Campo rotulo="Servidor SMTP"><input value={atual.smtpHost} onChange={set("smtpHost")} disabled={!pode} placeholder="smtp.gmail.com" /></Campo>
                <Campo rotulo="Porta"><input type="number" value={atual.smtpPorta} onChange={set("smtpPorta")} disabled={!pode} placeholder="465" /></Campo>
                <Campo rotulo="Usuário (e-mail da conta)"><input value={atual.smtpUsuario} onChange={set("smtpUsuario")} disabled={!pode} autoComplete="off" /></Campo>
                <Campo rotulo="Senha / senha de app" dica={dados?.email?.smtpSenhaSalva ? "Já existe uma senha salva — deixe em branco para manter." : "No Gmail: Conta Google › Segurança › Senhas de app."}>
                  <input type="password" value={atual.smtpSenha} onChange={set("smtpSenha")} disabled={!pode} autoComplete="new-password" />
                </Campo>
              </>
            )}
            {atual.emailProvedor === "RESEND" && (
              <Campo rotulo="Chave da API do Resend" largo dica={dados?.email?.resendChaveSalva ? "Já existe uma chave salva — deixe em branco para manter." : "Em resend.com › API Keys. O remetente precisa ser de um domínio verificado no Resend."}>
                <input type="password" value={atual.resendChave} onChange={set("resendChave")} disabled={!pode} autoComplete="off" placeholder="re_…" />
              </Campo>
            )}
          </div>
          {pode && (
            <div className="form-rodape">
              {atual.emailProvedor !== "RESEND" && <Botao variante="fantasma" onClick={usarGmail}>Preencher para Gmail</Botao>}
              {v && <Botao variante="fantasma" onClick={() => setV(null)}>Descartar</Botao>}
              <button type="submit" className="btn btn-primario" disabled={ocupado || !v}>Salvar e-mail</button>
            </div>
          )}
        </form>
      )}
      {pode && configurado && (
        <form onSubmit={testar} className="linha-acao" style={{ marginTop: 10 }}>
          <input type="email" value={para} onChange={e => setPara(e.target.value)} placeholder="Enviar teste para…" aria-label="E-mail para o teste" required style={{ flex: 1, minWidth: 0 }} />
          <button type="submit" className="btn" disabled={ocupado}>Enviar e-mail de teste</button>
        </form>
      )}
      {!configurado && dados && (
        <details style={{ marginTop: 12 }}>
          <summary className="link">Como criar a senha de app do Gmail</summary>
          <ol className="google-passos">
            <li>Entre na conta Google que vai enviar os e-mails e ative a <strong>verificação em duas etapas</strong> (Conta Google › Segurança).</li>
            <li>Abra <strong>myaccount.google.com/apppasswords</strong>, dê um nome (ex.: “Route Delivery”) e clique em <strong>Criar</strong>.</li>
            <li>Copie a senha de 16 letras. Aqui: clique em <strong>Preencher para Gmail</strong>, coloque o e-mail em “Usuário” e a senha de app em “Senha”.</li>
            <li>Salve e use <strong>Enviar e-mail de teste</strong> para conferir.</li>
          </ol>
        </details>
      )}
    </section>
  );
}
