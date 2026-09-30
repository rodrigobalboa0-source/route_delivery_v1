// Integrações › detalhe: ativação, credenciais, webhooks, lojas e eventos.
import { Fragment, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { Badge, Botao, BotaoConfirmar, Cabecalho, Campo, Carregando, ErroCaixa, Vazio, useAcao, useToast } from "../components/ui";
import { STATUS_PEDIDO, dataHora } from "../utils/format";
import { situacao } from "./Integracoes";

const EXEMPLO_ENTRADA = {
  idExterno: "PEDIDO-123",
  loja: "ID-DA-LOJA-NA-PLATAFORMA",
  cliente: { nome: "Maria Souza", telefone: "(11) 98888-7777" },
  endereco: { rua: "Av. Paulista", numero: "1000", complemento: "ap 12", bairro: "Bela Vista", cidade: "São Paulo", referencia: "portaria 24h" },
  formaPagamento: "Pago online",
  valorEntrega: 12.5,
  observacao: "Entregar na portaria",
  notaFiscal: { numero: "12345", chave: "", valor: 89.9 },
  pronto: false,
};

function Copiar({ texto, rotulo = "Copiar" }) {
  const avisar = useToast();
  return (
    <Botao pequeno onClick={() => navigator.clipboard.writeText(texto).then(() => avisar("Copiado."), () => avisar("Não foi possível copiar.", "erro"))}>
      {rotulo}
    </Botao>
  );
}

function Lojas({ slug, lojas, pode, onSalvo }) {
  const { dados: comercios } = useApi("/comercios");
  const [linhas, setLinhas] = useState(lojas.map(l => ({ comercioId: l.comercioId, idExterno: l.idExterno })));
  const { executar, ocupado } = useAcao();
  useEffect(() => { setLinhas(lojas.map(l => ({ comercioId: l.comercioId, idExterno: l.idExterno }))); }, [lojas]);
  const set = (i, campo, valor) => setLinhas(linhas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  return (
    <section className="cartao">
      <div className="cartao-topo"><h2>Lojas vinculadas</h2></div>
      <p className="apagado">Informe, para cada comércio, o identificador da loja nesta plataforma. Pedidos de lojas sem vínculo são recusados.</p>
      {linhas.length === 0 && <Vazio titulo="Nenhuma loja vinculada" />}
      {linhas.map((l, i) => (
        <div key={i} className="linha-acao linha-loja">
          <select value={l.comercioId} onChange={e => set(i, "comercioId", e.target.value)} disabled={!pode} aria-label="Comércio">
            <option value="">Comércio…</option>
            {(comercios || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
          </select>
          <input value={l.idExterno} onChange={e => set(i, "idExterno", e.target.value)} placeholder="ID da loja na plataforma" disabled={!pode} aria-label="ID da loja na plataforma" />
          {pode && <Botao pequeno variante="fantasma" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}>Remover</Botao>}
        </div>
      ))}
      {pode && (
        <div className="form-rodape">
          <Botao onClick={() => setLinhas([...linhas, { comercioId: "", idExterno: "" }])}>+ Adicionar loja</Botao>
          <Botao variante="primario" disabled={ocupado} onClick={async () => {
            const r = await executar(() => api.put(`/integracoes/${slug}/lojas`, { lojas: linhas }), "Lojas salvas.");
            if (r) onSalvo(r);
          }}>Salvar lojas</Botao>
        </div>
      )}
    </section>
  );
}

// iFood: testa a conexão com as credenciais salvas e mostra as lojas que o aplicativo enxerga
// (com o Merchant ID), para vincular cada uma a um comércio com um clique.
function ConexaoIfood({ lojas, pode, credenciaisSalvas, onSalvo, webhookUrl, ativa }) {
  const { dados: comercios } = useApi("/comercios");
  const [resultado, setResultado] = useState(null);
  const [escolha, setEscolha] = useState({});
  const [sinc, setSinc] = useState(null);
  const { executar, ocupado } = useAcao();

  async function sincronizar() {
    const r = await executar(() => api.post("/integracoes/ifood/sincronizar"));
    if (r) { setSinc(r); onSalvo(await api.get("/integracoes/ifood")); }
  }

  async function testar() {
    setResultado(null);
    const r = await executar(() => api.post("/integracoes/ifood/conexao"));
    if (r) setResultado(r);
  }

  async function vincular(loja) {
    const comercioId = escolha[loja.id];
    if (!comercioId) return;
    const novas = [...lojas.filter(l => l.idExterno !== loja.id).map(l => ({ comercioId: l.comercioId, idExterno: l.idExterno })), { comercioId, idExterno: loja.id }];
    const r = await executar(() => api.put("/integracoes/ifood/lojas", { lojas: novas }), `Loja “${loja.nome}” vinculada.`);
    if (r) { onSalvo(r); testar(); }
  }

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <h2>Conexão com o iFood</h2>
        {pode && <Botao variante="primario" disabled={ocupado || !credenciaisSalvas} onClick={testar}>{ocupado ? "Conectando…" : "Testar conexão e buscar lojas"}</Botao>}
      </div>
      <p className="apagado" style={{ marginTop: 0 }}>
        {credenciaisSalvas
          ? "Entra na API do iFood com o Client ID e o Client Secret salvos e mostra as lojas liberadas para o aplicativo, com o Merchant ID de cada uma."
          : "Salve o Client ID e o Client Secret acima para testar a conexão."}
      </p>
      {resultado && (
        resultado.lojas.length === 0 ? (
          <div className="aviso-caixa">
            ✓ Conectou ao iFood, mas nenhuma loja está liberada para este aplicativo ainda. No Portal do Desenvolvedor, confira se o
            <strong> modo de teste</strong> está ativo (Perfil › Editar dados) e se a loja de teste aparece em Meus apps › Permissões.
          </div>
        ) : (
          <>
            <div className="sucesso-caixa">✓ Conectado ao iFood — {resultado.lojas.length} loja(s) encontrada(s).</div>
            <div className="tabela-rolagem" style={{ marginTop: 10 }}>
              <table className="tabela tabela-compacta">
                <thead><tr><th>Loja no iFood</th><th>Merchant ID</th><th>Comércio no sistema</th></tr></thead>
                <tbody>
                  {resultado.lojas.map(l => (
                    <tr key={l.id}>
                      <td><strong>{l.nome}</strong>{l.razaoSocial && l.razaoSocial !== l.nome && <div className="celula-sub">{l.razaoSocial}</div>}</td>
                      <td className="mono">{l.id} <Copiar texto={l.id} /></td>
                      <td>
                        {l.comercioId ? <Badge tom="ok">✓ {l.comercioNome}</Badge> : pode ? (
                          <div className="linha-acao">
                            <select value={escolha[l.id] || ""} onChange={e => setEscolha({ ...escolha, [l.id]: e.target.value })} aria-label={`Comércio para ${l.nome}`}>
                              <option value="">Escolha o comércio…</option>
                              {(comercios || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
                            </select>
                            <Botao pequeno variante="primario" disabled={!escolha[l.id] || ocupado} onClick={() => vincular(l)}>Vincular</Botao>
                          </div>
                        ) : <span className="apagado">Não vinculada</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}

      <h3 className="secao-titulo">Receber os pedidos</h3>
      <p className="apagado" style={{ marginTop: 0 }}>
        Cadastre este endereço como <strong>Webhook</strong> do aplicativo no Portal do Desenvolvedor iFood (Meus apps › seu app › Webhook).
        O iFood avisa cada pedido na hora; o sistema também busca os pedidos a cada 30 s como reserva, enquanto o painel ou o app estiverem abertos.
      </p>
      {webhookUrl && (
        <div className="linha-acao">
          <input readOnly value={webhookUrl} className="mono" onFocus={e => e.target.select()} aria-label="URL do webhook do iFood" />
          <Copiar texto={webhookUrl} />
        </div>
      )}
      <p className="apagado">
        Só entram os pedidos de <strong>entrega própria</strong> (o iFood marca a entrega como feita pela loja). Pedidos entregues pelo iFood ou para retirar são ignorados.
        {!ativa && <strong> Ative a integração (botão no topo) para começar a receber.</strong>}
      </p>
      {pode && (
        <div className="linha-acao">
          <Botao disabled={ocupado || !credenciaisSalvas || !lojas.length} onClick={sincronizar}>Buscar pedidos agora</Botao>
          {sinc && (
            <span className={sinc.erros ? "texto-erro" : "sucesso-inline"}>
              {sinc.aviso || `${sinc.recebidos} evento(s) · ${sinc.novos} entrega(s) criada(s)${sinc.erros ? ` · ${sinc.erros} com erro (veja os eventos)` : ""}`}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function Eventos({ eventos }) {
  const [aberto, setAberto] = useState(null);
  return (
    <section className="cartao cartao-tabela">
      <div className="tabela-barra"><h2>Últimos eventos</h2><span className="apagado">{eventos.length} mais recentes</span></div>
      {eventos.length === 0 ? <Vazio titulo="Nenhum evento ainda" /> : (
        <div className="tabela-rolagem">
          <table className="tabela tabela-compacta">
            <thead><tr><th>Quando</th><th>Direção</th><th>Evento</th><th>Resultado</th><th>Detalhe</th><th /></tr></thead>
            <tbody>
              {eventos.map(ev => (
                <Fragment key={ev.id}>
                  <tr>
                    <td>{dataHora(ev.createdAt)}</td>
                    <td>{ev.direcao === "ENTRADA" ? "⬇ Entrada" : "⬆ Saída"}</td>
                    <td>{ev.tipo}{ev.payload?.dados?.status && <div className="celula-sub">{STATUS_PEDIDO[ev.payload.dados.status]?.rotulo}</div>}</td>
                    <td>{ev.sucesso ? <Badge tom="ok">✓ Sucesso</Badge> : <Badge tom="critico">⚠ Erro</Badge>}</td>
                    <td className="celula-endereco">{ev.mensagem || "—"}</td>
                    <td>{ev.payload && <button type="button" className="link" onClick={() => setAberto(aberto === ev.id ? null : ev.id)}>{aberto === ev.id ? "Ocultar" : "Ver dados"}</button>}</td>
                  </tr>
                  {aberto === ev.id && (
                    <tr><td colSpan={6}><pre className="bloco-codigo">{JSON.stringify(ev.payload, null, 2)}</pre></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function IntegracaoDetalhe() {
  const { slug } = useParams();
  const { podeEditar } = useAuth();
  const pode = podeEditar("integracoes");
  const { dados: d, setDados, erro } = useApi(`/integracoes/${slug}`, { intervaloMs: 20000 });
  const { executar, ocupado } = useAcao();
  const avisar = useToast();
  const [cred, setCred] = useState({});
  const [remover, setRemover] = useState({});
  const [saidaUrl, setSaidaUrl] = useState(null);
  const [config, setConfig] = useState(null);

  if (erro) return <ErroCaixa erro={erro} />;
  if (!d) return <Carregando />;

  const s = situacao({ ...d, configurada: d.credenciais.campos.some(c => c.preenchido) || d.webhookSaidaUrl || d.lojas.length });
  const cfg = config || d.config;
  const urlSaida = saidaUrl ?? d.webhookSaidaUrl ?? "";
  const alterado = Object.keys(cred).length || Object.keys(remover).length || saidaUrl !== null || config !== null;

  async function salvar() {
    const credenciais = { ...cred };
    Object.keys(remover).forEach(k => { credenciais[k] = null; });
    const r = await executar(() => api.put(`/integracoes/${slug}`, { credenciais, webhookSaidaUrl: urlSaida, config: cfg }), "Configuração salva.");
    if (r) { setDados(r); setCred({}); setRemover({}); setSaidaUrl(null); setConfig(null); }
  }

  async function alternarAtiva() {
    const r = await executar(() => api.put(`/integracoes/${slug}`, { ativa: !d.ativa }), d.ativa ? "Integração pausada." : "Integração ativada.");
    if (r) setDados(r);
  }

  function alternarEvento(st) {
    const eventos = cfg.eventos.includes(st) ? cfg.eventos.filter(e => e !== st) : [...cfg.eventos, st];
    setConfig({ ...cfg, eventos });
  }

  return (
    <>
      <Cabecalho titulo={d.nome} subtitulo={`${d.categoria} · ${d.descricao}`}>
        <Link to="/integracoes" className="btn btn-fantasma">Voltar</Link>
        <Badge tom={s.tom}>{s.rotulo}</Badge>
        {pode && (
          <Botao variante={d.ativa ? "secundario" : "primario"} disabled={ocupado} onClick={alternarAtiva}>
            {d.ativa ? "Pausar integração" : "Ativar integração"}
          </Botao>
        )}
      </Cabecalho>

      {!pode && <div className="aviso-caixa">Somente contas com permissão Total podem alterar integrações.</div>}
      {d.tipo !== "saida" && slug !== "ifood" && (
        <div className="aviso-caixa">
          <strong>Conexão direta com {d.nome}:</strong> exige cadastro como parceiro e homologação com a plataforma. Até lá, os
          pedidos podem chegar pelo <strong>webhook de entrada</strong> abaixo (por exemplo, a partir de um integrador ou do suporte técnico da plataforma).
        </div>
      )}
      {d.credenciais.ilegivel && <div className="erro-caixa">As credenciais salvas não puderam ser lidas (a chave de criptografia mudou). Informe-as novamente.</div>}

      <div className="grade-2">
        <section className="cartao">
          <div className="cartao-topo"><h2>Credenciais</h2></div>
          <p className="apagado">Guardadas criptografadas. Campos secretos nunca são exibidos depois de salvos.</p>
          <div className="grade-campos">
            {d.credenciais.campos.map(c => (
              <Campo key={c.nome} rotulo={c.rotulo} largo dica={c.secreto && c.preenchido && !remover[c.nome] ? "Salvo. Digite para substituir." : undefined}>
                <input
                  type={c.secreto ? "password" : "text"}
                  autoComplete="off"
                  disabled={!pode || remover[c.nome]}
                  placeholder={c.secreto && c.preenchido ? "••••••••••" : ""}
                  value={cred[c.nome] ?? (c.secreto ? "" : c.valor)}
                  onChange={e => setCred({ ...cred, [c.nome]: e.target.value })}
                />
                {pode && c.preenchido && (
                  <button type="button" className="link link-perigo" onClick={() => setRemover({ ...remover, [c.nome]: !remover[c.nome] })}>
                    {remover[c.nome] ? "Manter valor salvo" : "Apagar valor salvo"}
                  </button>
                )}
              </Campo>
            ))}
          </div>

          {d.tipo !== "saida" && (
            <label className="campo-check" style={{ paddingTop: 8 }}>
              <input type="checkbox" checked={cfg.liberarAutomaticamente} disabled={!pode}
                onChange={e => setConfig({ ...cfg, liberarAutomaticamente: e.target.checked })} />
              <span>Liberar o pedido para os entregadores assim que chegar (pular a etapa “Em preparo”)</span>
            </label>
          )}
          {slug === "ifood" && (
            <label className="campo-check" style={{ paddingTop: 8 }}>
              <input type="checkbox" checked={!!cfg.confirmarAutomaticamente} disabled={!pode}
                onChange={e => setConfig({ ...cfg, confirmarAutomaticamente: e.target.checked })} />
              <span>
                Confirmar o pedido no iFood automaticamente ao receber
                <span className="celula-sub">Marque se a loja não usa outro sistema (ou o Gestor de Pedidos) para confirmar. O iFood cancela pedidos não confirmados em 8 minutos.</span>
              </span>
            </label>
          )}

          <h3 className="secao-titulo">Webhook de saída</h3>
          <p className="apagado">
            {d.tipo === "pedidos"
              ? `A cada mudança de status de um pedido vindo de ${d.nome}, enviamos um POST para esta URL.`
              : "A cada mudança de status das entregas, enviamos um POST para esta URL."}
          </p>
          <Campo rotulo="URL de saída" largo>
            <input type="url" placeholder="https://" value={urlSaida} disabled={!pode} onChange={e => setSaidaUrl(e.target.value)} />
          </Campo>
          <div className="campo" style={{ marginTop: 10 }}>
            <span className="campo-rotulo">Enviar quando o pedido ficar</span>
            <div className="dias-semana">
              {d.statusDisponiveis.map(st => (
                <label key={st} className={cfg.eventos.includes(st) ? "dia marcado" : "dia"}>
                  <input type="checkbox" checked={cfg.eventos.includes(st)} disabled={!pode} onChange={() => alternarEvento(st)} />
                  {STATUS_PEDIDO[st].rotulo}
                </label>
              ))}
            </div>
          </div>

          {pode && (
            <div className="form-rodape">
              {d.webhookSaidaUrl && !alterado && (
                <Botao disabled={ocupado} onClick={async () => {
                  const r = await executar(() => api.post(`/integracoes/${slug}/testar`));
                  if (r) {
                    avisar(r.sucesso ? `Teste enviado: ${r.mensagem}` : `Teste falhou: ${r.mensagem}`, r.sucesso ? "ok" : "erro");
                    setDados(await api.get(`/integracoes/${slug}`));
                  }
                }}>Enviar evento de teste</Botao>
              )}
              {alterado && <Botao variante="fantasma" onClick={() => { setCred({}); setRemover({}); setSaidaUrl(null); setConfig(null); }}>Descartar</Botao>}
              <Botao variante="primario" disabled={!alterado || ocupado} onClick={salvar}>Salvar configuração</Botao>
            </div>
          )}
        </section>

        <section className="cartao">
          {d.webhookEntradaUrl ? (
            <>
              <div className="cartao-topo"><h2>Webhook de entrada</h2><span className="apagado">{d.pedidosRecebidos} pedido(s) recebido(s)</span></div>
              <p className="apagado">Envie os pedidos com <strong>POST</strong> para este endereço. O token no fim da URL é a senha — não compartilhe.</p>
              <div className="linha-acao">
                <input readOnly value={d.webhookEntradaUrl} className="mono" onFocus={e => e.target.select()} aria-label="URL do webhook de entrada" />
                <Copiar texto={d.webhookEntradaUrl} />
              </div>
              {pode && (
                <div style={{ marginTop: 8 }}>
                  <BotaoConfirmar pequeno confirmar="O endereço atual para de funcionar. Continuar?" onConfirm={async () => {
                    const r = await executar(() => api.post(`/integracoes/${slug}/regenerar-token`), "Novo endereço gerado.");
                    if (r) setDados(r);
                  }}>Gerar novo endereço</BotaoConfirmar>
                </div>
              )}
              <h3 className="secao-titulo">Formato do pedido (JSON)</h3>
              <pre className="bloco-codigo">{JSON.stringify(EXEMPLO_ENTRADA, null, 2)}</pre>
              <p className="apagado">
                Obrigatórios: <code>idExterno</code>, <code>loja</code>, <code>cliente.nome</code> e <code>endereco</code> (texto ou objeto com <code>rua</code>).
                Sem <code>valorEntrega</code>, o valor é calculado pelo percurso. Reenviar o mesmo <code>idExterno</code> não duplica o pedido.
                Resposta: <code>201</code> com <code>codigo</code> do pedido, ou <code>200</code> com <code>duplicado: true</code>.
              </p>
            </>
          ) : (
            <>
              <div className="cartao-topo"><h2>Como os eventos são enviados</h2></div>
              <p className="apagado">{d.nome} só recebe eventos — não envia pedidos para o sistema.</p>
            </>
          )}
          <h3 className="secao-titulo">Segurança dos webhooks de saída</h3>
          <p className="apagado">
            Cada envio traz o cabeçalho <code>X-Route-Assinatura: sha256=…</code> (HMAC-SHA256 do corpo, usando o token do webhook de entrada desta
            integração como segredo) e <code>X-Route-Evento</code>.
            {d.credenciais.campos.some(c => c.bearer) && " A credencial desta integração também vai em Authorization: Bearer."}
          </p>
          <div className="linha-acao">
            <input readOnly value={d.segredoAssinatura} className="mono" onFocus={e => e.target.select()} aria-label="Segredo da assinatura" />
            <Copiar texto={d.segredoAssinatura} rotulo="Copiar segredo" />
          </div>
          {pode && !d.webhookEntradaUrl && (
            <div style={{ marginTop: 8 }}>
              <BotaoConfirmar pequeno confirmar="Quem valida a assinatura precisará do novo segredo. Continuar?" onConfirm={async () => {
                const r = await executar(() => api.post(`/integracoes/${slug}/regenerar-token`), "Novo segredo gerado.");
                if (r) setDados(r);
              }}>Gerar novo segredo</BotaoConfirmar>
            </div>
          )}
        </section>
      </div>

      {slug === "ifood" && (
        <ConexaoIfood lojas={d.lojas} pode={pode} onSalvo={setDados} webhookUrl={d.ifoodWebhookUrl} ativa={d.ativa}
          credenciaisSalvas={["clientId", "clientSecret"].every(n => d.credenciais.campos.find(c => c.nome === n)?.preenchido)} />
      )}
      {d.tipo !== "saida" && <Lojas slug={slug} lojas={d.lojas} pode={pode} onSalvo={setDados} />}
      <Eventos eventos={d.eventos} />
    </>
  );
}
