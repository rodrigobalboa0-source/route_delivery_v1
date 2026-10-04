import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, qs } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import {
  Abas, Badge, BadgeMapa, Botao, BotaoConfirmar, Cabecalho, Campo, Carregando, ErroCaixa, Gaveta, StatTile, Vazio, useAcao,
} from "../components/ui";
import { CADASTRO_VIA, STATUS_PEDIDO, data, dataHora, moeda, numero } from "../utils/format";
import { mascaraDocumento, mascaraTelefone } from "../utils/documento";

// O cadastro completo (dados, preços por modal, endereços, acesso) fica em FormComercio.jsx.
function AcessoSistema({ comercio, onAlterado, desabilitado }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [redefinindo, setRedefinindo] = useState(null);
  const [novaSenha, setNovaSenha] = useState("");
  const { executar, ocupado } = useAcao();

  async function criar(e) {
    e.preventDefault();
    if (await executar(() => api.post(`/comercios/${comercio.id}/usuarios`, { email, senha }), "Usuário criado.")) {
      setEmail(""); setSenha(""); onAlterado();
    }
  }

  return (
    <div>
      <p className="apagado">Logins que entram no sistema do comerciante para criar e acompanhar pedidos desta loja.</p>
      {comercio.bloqueado && <div className="erro-caixa">Comércio bloqueado — nenhum destes usuários consegue entrar até o desbloqueio.</div>}
      {comercio.usuariosAdicionais.length === 0 ? <Vazio titulo="Nenhum usuário de acesso" /> : (
        <ul className="lista-cartoes">
          {comercio.usuariosAdicionais.map(u => (
            <li key={u.id}>
              <strong>{u.email}</strong>
              {!desabilitado && (redefinindo === u.id ? (
                <div className="linha-acao">
                  <input type="text" placeholder="Nova senha (mín. 6)" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} aria-label="Nova senha" />
                  <Botao pequeno variante="primario" disabled={novaSenha.length < 6 || ocupado} onClick={async () => {
                    if (await executar(() => api.patch(`/comercios/${comercio.id}/usuarios/${u.id}/senha`, { senha: novaSenha }), "Senha redefinida.")) {
                      setRedefinindo(null); setNovaSenha("");
                    }
                  }}>Salvar</Botao>
                  <Botao pequeno variante="fantasma" onClick={() => setRedefinindo(null)}>Cancelar</Botao>
                </div>
              ) : (
                <div className="botoes">
                  <Botao pequeno onClick={() => { setRedefinindo(u.id); setNovaSenha(""); }}>Redefinir senha</Botao>
                  <BotaoConfirmar pequeno confirmar="Remover acesso?" onConfirm={async () => {
                    if (await executar(() => api.del(`/comercios/${comercio.id}/usuarios/${u.id}`), "Acesso removido.")) onAlterado();
                  }}>Remover</BotaoConfirmar>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
      {!desabilitado && (
        <form onSubmit={criar} className="bloco">
          <h3>Novo usuário</h3>
          <div className="grade-campos">
            <Campo rotulo="E-mail *"><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></Campo>
            <Campo rotulo="Senha inicial *"><input type="text" minLength={6} value={senha} onChange={e => setSenha(e.target.value)} required /></Campo>
          </div>
          <div className="form-rodape"><button type="submit" className="btn btn-primario" disabled={ocupado}>Criar acesso</button></div>
        </form>
      )}
    </div>
  );
}

function SituacaoComercio({ c }) {
  if (c.situacaoCadastro === "EM_ANALISE") return <Badge tom="aviso">Cadastro em análise</Badge>;
  if (c.situacaoCadastro === "RECUSADO") return <Badge tom="critico">Cadastro recusado</Badge>;
  return c.bloqueado ? <Badge tom="critico">Bloqueado</Badge> : <Badge tom="ok">Ativo</Badge>;
}

// Loja que se cadastrou pela tela de login: confere os dados e aprova (libera o login) ou recusa com motivo.
function AprovarCadastro({ comercio, pode, onAlterado }) {
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const { executar, ocupado } = useAcao();
  const e = comercio.enderecos.find(x => x.principal) || comercio.enderecos[0];
  async function decidir(situacao) {
    if (await executar(() => api.patch(`/comercios/${comercio.id}/cadastro`, { situacao, motivo }), situacao === "ATIVO" ? `${comercio.nomeFantasia} aprovada — a loja já pode entrar.` : "Cadastro recusado.")) {
      setRecusando(false); onAlterado();
    }
  }
  return (
    <section className="bloco aviso-cadastro">
      <h3>{comercio.situacaoCadastro === "EM_ANALISE" ? "Cadastro feito pela loja — aguardando aprovação" : "Cadastro recusado"}</h3>
      {comercio.situacaoCadastro === "RECUSADO" && comercio.motivoRecusa && <p>Motivo: {comercio.motivoRecusa}</p>}
      <p className="apagado">Confira os dados abaixo. Ao aprovar, a loja entra com o e-mail e a senha que cadastrou (e recebe um e-mail, se o envio estiver configurado).
        {e && e.lat == null && <strong> O endereço de coleta ficou sem posição no mapa: ajuste em Editar cadastro antes de aprovar.</strong>}</p>
      {pode && (recusando ? (
        <div className="botoes">
          <input value={motivo} onChange={ev => setMotivo(ev.target.value)} placeholder="Motivo da recusa (a loja vê ao tentar entrar)" style={{ flex: "1 1 260px" }} autoFocus />
          <Botao variante="perigo" disabled={ocupado || !motivo.trim()} onClick={() => decidir("RECUSADO")}>Confirmar recusa</Botao>
          <Botao variante="fantasma" onClick={() => setRecusando(false)}>Cancelar</Botao>
        </div>
      ) : (
        <div className="botoes">
          <Botao variante="primario" disabled={ocupado} onClick={() => decidir("ATIVO")}>✓ Aprovar loja</Botao>
          {comercio.situacaoCadastro === "EM_ANALISE" && <Botao variante="perigo-leve" disabled={ocupado} onClick={() => setRecusando(true)}>Recusar</Botao>}
        </div>
      ))}
    </section>
  );
}

function DetalheComercio({ id, onFechar, onAlterado }) {
  const navegar = useNavigate();
  const { podeEditar } = useAuth();
  const pode = podeEditar("comercios");
  const { dados: c, erro, recarregar } = useApi(`/comercios/${id}`);
  const [aba, setAba] = useState("resumo");
  const pedidos = useApi(`/pedidos?comercioId=${id}&limite=20`, { ativo: aba === "pedidos", aoVivo: ["pedidos"] });
  const faturas = useApi(`/financeiro/faturas?comercioId=${id}`, { ativo: aba === "faturas" });
  const { executar, ocupado } = useAcao();

  function alterado() {
    recarregar({ silencioso: true });
    onAlterado();
  }

  return (
    <Gaveta
      titulo={c?.nomeFantasia || "Comércio"}
      subtitulo={c && <SituacaoComercio c={c} />}
      onFechar={onFechar}
    >
      <ErroCaixa erro={erro} />
      {!c ? <Carregando /> : (
        <>
          <Abas ativa={aba} onChange={setAba} abas={[
            { valor: "resumo", rotulo: "Resumo" },
            { valor: "acesso", rotulo: "Acesso ao sistema" },
            { valor: "pedidos", rotulo: "Pedidos" },
            { valor: "faturas", rotulo: "Faturas" },
          ]} />

          {aba === "resumo" && (
            <>
              <div className="grade-stats grade-stats-3">
                <StatTile rotulo="Entregas no mês" valor={numero(c.estatisticas.entreguesNoMes)} detalhe={moeda(c.estatisticas.valorNoMes)} />
                <StatTile rotulo="Pedidos no total" valor={numero(c.estatisticas.totalPedidos)} />
                <StatTile rotulo="Faturas em aberto" valor={moeda(c.estatisticas.faturasEmAberto)} tom={c.estatisticas.faturasEmAberto > 0 ? "aviso" : undefined} />
              </div>
              {c.situacaoCadastro !== "ATIVO" && <AprovarCadastro comercio={c} pode={pode} onAlterado={alterado} />}
              <div className="botoes" style={{ marginBottom: 14 }}>
                <Botao variante="primario" onClick={() => navegar(`/cadastros/comercios/${id}`)}>{pode ? "Editar cadastro" : "Ver cadastro completo"}</Botao>
              </div>
              <dl className="detalhes">
                <dt>Segmento</dt><dd>{c.segmento || "—"}</dd>
                <dt>{c.tipoDocumento}</dt><dd>{c.documento ? mascaraDocumento(c.tipoDocumento, c.documento) : "—"}</dd>
                <dt>Telefone</dt><dd>{c.telefone ? mascaraTelefone(c.telefone) : "—"}</dd>
                <dt>E-mail</dt><dd>{c.email || "—"}</dd>
                <dt>Responsável</dt><dd>{c.nomeCompleto || "—"}</dd>
                <dt>Endereço principal</dt>
                <dd>{(() => { const e = c.enderecos.find(x => x.principal) || c.enderecos[0]; return e ? `${e.rua}${e.numero ? ", " + e.numero : ""} · ${e.bairro || ""}` : "—"; })()}</dd>
                <dt>Logins de acesso</dt><dd>{c.usuariosAdicionais.length}</dd>
                <dt>Modalidade de cobrança</dt><dd>{c.modalidadeCobranca === "CREDITO" ? <Badge tom="aviso">Crédito (pré-pago)</Badge> : <Badge>Faturamento</Badge>}</dd>
                <dt>Cadastrado via</dt><dd>{CADASTRO_VIA[c.cadastroVia] || "—"}</dd>
                <dt>Desde</dt><dd>{data(c.dataInicio || c.createdAt)}</dd>
              </dl>
              {pode && (
                <section className="bloco">
                  <h3>Situação</h3>
                  <p className="apagado">Bloquear impede o login no sistema do comerciante e a criação de novos pedidos. Pedidos em andamento continuam.</p>
                  <div className="botoes">
                    {c.bloqueado ? (
                      <Botao disabled={ocupado} onClick={async () => { if (await executar(() => api.patch(`/comercios/${id}/desbloquear`), "Comércio desbloqueado.")) alterado(); }}>Desbloquear</Botao>
                    ) : (
                      <BotaoConfirmar confirmar="Bloquear o comércio?" onConfirm={async () => { if (await executar(() => api.patch(`/comercios/${id}/bloquear`), "Comércio bloqueado.")) alterado(); }}>
                        Bloquear
                      </BotaoConfirmar>
                    )}
                    <BotaoConfirmar confirmar="Excluir definitivamente?" onConfirm={async () => {
                      if (await executar(() => api.del(`/comercios/${id}`), "Comércio excluído.")) { onAlterado(); onFechar(); }
                    }}>Excluir</BotaoConfirmar>
                  </div>
                </section>
              )}
            </>
          )}
          {aba === "acesso" && <AcessoSistema comercio={c} desabilitado={!pode} onAlterado={alterado} />}
          {aba === "pedidos" && (
            !pedidos.dados ? <Carregando /> : pedidos.dados.length === 0 ? <Vazio titulo="Nenhum pedido ainda" /> : (
              <table className="tabela tabela-compacta">
                <thead><tr><th>Código</th><th>Status</th><th>Cliente</th><th className="num">Valor</th><th>Data</th></tr></thead>
                <tbody>
                  {pedidos.dados.map(p => (
                    <tr key={p.id}>
                      <td>{p.codigo}</td><td><BadgeMapa mapa={STATUS_PEDIDO} valor={p.status} /></td>
                      <td>{p.clienteNome}</td><td className="num">{moeda(p.valor)}</td><td>{dataHora(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
          {aba === "faturas" && (
            !faturas.dados ? <Carregando /> : faturas.dados.length === 0 ? <Vazio titulo="Nenhuma fatura" /> : (
              <table className="tabela tabela-compacta">
                <thead><tr><th>Descrição</th><th>Vencimento</th><th className="num">Valor</th><th>Situação</th></tr></thead>
                <tbody>
                  {faturas.dados.map(f => (
                    <tr key={f.id}>
                      <td>{f.descricao}</td><td>{data(f.vencimento)}</td><td className="num">{moeda(f.valor)}</td>
                      <td>{f.paga ? <Badge tom="ok">Paga</Badge> : new Date(f.vencimento) < new Date() ? <Badge tom="critico">Atrasada</Badge> : <Badge tom="aviso">Em aberto</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </>
      )}
    </Gaveta>
  );
}

export default function Comercios() {
  const { podeEditar } = useAuth();
  const [filtro, setFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const navegar = useNavigate();
  // ?abrir=<id> abre a gaveta do comércio (usado ao voltar do formulário).
  const [params, setParams] = useSearchParams();
  const aberto = params.get("abrir");
  const setAberto = id => setParams(id ? { abrir: id } : {}, { replace: true });

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const lista = useApi(`/comercios${qs({ busca: buscaAplicada, ...(filtro === "analise" ? { situacao: "EM_ANALISE" } : { bloqueado: filtro }) })}`);
  const contagem = useApi("/comercios/contagem");
  const c = contagem.dados || {};

  function atualizar() {
    lista.recarregar({ silencioso: true });
    contagem.recarregar({ silencioso: true });
  }

  return (
    <>
      <Cabecalho titulo="Comércio" subtitulo="Lojas parceiras e o acesso delas ao sistema do comerciante">
        {podeEditar("comercios") && <Botao variante="primario" onClick={() => navegar("/cadastros/comercios/novo")}>+ Novo cliente</Botao>}
      </Cabecalho>

      <div className="grade-stats">
        <StatTile rotulo="Total" valor={numero(c.total)} ativo={filtro === ""} onClick={() => setFiltro("")} />
        <StatTile rotulo="Ativos" valor={numero(c.ativos)} ativo={filtro === "false"} onClick={() => setFiltro("false")} />
        <StatTile rotulo="Bloqueados" valor={numero(c.bloqueados)} tom={c.bloqueados > 0 ? "critico" : undefined} ativo={filtro === "true"} onClick={() => setFiltro("true")} />
        <StatTile rotulo="Cadastros em análise" valor={numero(c.emAnalise)} detalhe="lojas que se cadastraram sozinhas" tom={c.emAnalise > 0 ? "aviso" : undefined} ativo={filtro === "analise"} onClick={() => setFiltro("analise")} />
      </div>

      <div className="filtros">
        <input type="search" placeholder="Buscar por nome, razão social ou documento" value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      <ErroCaixa erro={lista.erro} onTentar={() => lista.recarregar()} />

      <div className="cartao cartao-tabela">
        {lista.carregando && !lista.dados ? <Carregando /> : !lista.dados?.length ? <Vazio titulo="Nenhum comerciante encontrado" /> : (
          <div className="tabela-rolagem">
            <table className="tabela tabela-clicavel">
              <thead><tr><th>Comércio</th><th>Situação</th><th>Segmento</th><th>Endereço principal</th><th className="num">Logins</th><th className="num">Pedidos</th></tr></thead>
              <tbody>
                {lista.dados.map(x => {
                  const e = x.enderecos.find(y => y.principal) || x.enderecos[0];
                  return (
                    <tr key={x.id} onClick={() => setAberto(x.id)} tabIndex={0} onKeyDown={ev => { if (ev.key === "Enter") setAberto(x.id); }}>
                      <td>
                        <div className="celula-comercio">
                          {x.fotoUrl ? <img src={x.fotoUrl} alt="" /> : <span className="logo-vazio" aria-hidden="true">{x.nomeFantasia[0]}</span>}
                          <div><strong>{x.nomeFantasia}</strong><div className="celula-sub">{x.telefone ? mascaraTelefone(x.telefone) : x.email || ""}</div></div>
                        </div>
                      </td>
                      <td><SituacaoComercio c={x} /></td>
                      <td>{x.segmento || "—"}</td>
                      <td>
                        {e ? `${e.rua}${e.numero ? ", " + e.numero : ""}` : <span className="apagado">Sem endereço</span>}
                        {e && e.lat == null && <div className="celula-sub">⚠ sem coordenadas</div>}
                      </td>
                      <td className="num">{x.usuariosAdicionais.length}</td>
                      <td className="num">{numero(x._count?.pedidos)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aberto && <DetalheComercio key={aberto} id={aberto} onFechar={() => setAberto(null)} onAlterado={atualizar} />}
    </>
  );
}
