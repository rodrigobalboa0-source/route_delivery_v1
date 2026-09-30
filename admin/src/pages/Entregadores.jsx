import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, qs } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import {
  Abas, Badge, BadgeMapa, Botao, BotaoConfirmar, Cabecalho, Campo, Carregando, ErroCaixa, Gaveta, GradeCampos, Modal,
  StatTile, Vazio, prepararValores, useAcao, useToast,
} from "../components/ui";
import {
  PERMISSAO_COLETA, STATUS_ENTREGADOR, STATUS_PEDIDO, TIPO_ENTREGA, VEICULOS, dataHora, moeda, numero, opcoes,
  paraInputData, tempoRelativo,
} from "../utils/format";

const CAMPOS_PESSOAIS = [
  { nome: "nomeCompleto", rotulo: "Nome completo", obrigatorio: true, largo: true },
  { nome: "cpf", rotulo: "CPF" },
  { nome: "rg", rotulo: "RG" },
  { nome: "dataNascimento", rotulo: "Data de nascimento", tipo: "date" },
  { nome: "telefone", rotulo: "Telefone" },
  { nome: "email", rotulo: "E-mail (login do app)", tipo: "email", largo: true, dica: "Usado para entrar no app do entregador." },
  { nome: "cep", rotulo: "CEP" },
  { nome: "rua", rotulo: "Rua" },
  { nome: "numero", rotulo: "Número" },
  { nome: "complemento", rotulo: "Complemento" },
  { nome: "bairro", rotulo: "Bairro" },
  { nome: "cidade", rotulo: "Cidade" },
];

const CAMPOS_OPERACAO = [
  { nome: "veiculoTipo", rotulo: "Veículo", tipo: "select", opcoes: opcoes(VEICULOS), obrigatorio: true },
  { nome: "veiculoModelo", rotulo: "Modelo" },
  { nome: "veiculoPlaca", rotulo: "Placa" },
  { nome: "veiculoAno", rotulo: "Ano" },
  { nome: "cnhValida", rotulo: "CNH válida", tipo: "checkbox" },
  { nome: "tipoEntrega", rotulo: "Vínculo", tipo: "select", opcoes: opcoes(TIPO_ENTREGA), obrigatorio: true },
  { nome: "taxaEntrega", rotulo: "Repasse por entrega (R$)", tipo: "number", dica: "Usado no cálculo de repasse do financeiro." },
  { nome: "prioridadeBusca", rotulo: "Prioridade na busca (0–10)", tipo: "number", passo: "1" },
  { nome: "permissaoColeta", rotulo: "Pode coletar em", tipo: "select", opcoes: opcoes(PERMISSAO_COLETA), obrigatorio: true, largo: true },
  { nome: "fotoUrl", rotulo: "URL da foto", largo: true },
  { nome: "fotoCnhUrl", rotulo: "URL da CNH", largo: true },
  { nome: "comprovanteResidenciaUrl", rotulo: "URL do comprovante de residência", largo: true },
  { nome: "documentoVeiculoUrl", rotulo: "URL do documento do veículo", largo: true },
];

// Comissão automática: extra pago pela empresa a cada entrega finalizada por este entregador.
const CAMPOS_COMISSAO = [
  {
    nome: "comissaoAutoAtiva", rotulo: "Cair comissão automática ao finalizar cada entrega", tipo: "switch", largo: true,
  },
  {
    nome: "comissaoAutoValor", rotulo: "Comissão por entrega finalizada (R$)", tipo: "number", obrigatorio: true,
    dica: "Aparece no app do entregador na hora e entra no Acerto de Entregadores.",
  },
];

const TODOS_CAMPOS = [...CAMPOS_PESSOAIS, ...CAMPOS_OPERACAO, ...CAMPOS_COMISSAO];

function valoresIniciais(e = {}) {
  const v = {};
  TODOS_CAMPOS.forEach(c => { v[c.nome] = e[c.nome] ?? ""; });
  v.dataNascimento = paraInputData(e.dataNascimento);
  v.veiculoTipo = e.veiculoTipo || "MOTO";
  v.tipoEntrega = e.tipoEntrega || "PROPRIO";
  v.permissaoColeta = e.permissaoColeta || "TODOS_CLIENTES";
  v.cnhValida = e.cnhValida ?? true;
  v.comissaoAutoAtiva = e.comissaoAutoAtiva ?? false;
  return v;
}

function FormEntregador({ entregador, onSalvo, desabilitado }) {
  const [v, setV] = useState(() => valoresIniciais(entregador));
  const [senha, setSenha] = useState("");
  const { executar, ocupado } = useAcao();
  const novo = !entregador?.id;

  async function salvar(e) {
    e.preventDefault();
    const corpo = prepararValores(TODOS_CAMPOS, v);
    if (novo && senha) corpo.senha = senha;
    const r = await executar(
      () => (novo ? api.post("/entregadores", corpo) : api.put(`/entregadores/${entregador.id}`, corpo)),
      novo ? "Entregador cadastrado." : "Dados salvos."
    );
    if (r) onSalvo(r);
  }

  return (
    <form onSubmit={salvar}>
      <h3 className="secao-titulo">Dados pessoais</h3>
      <GradeCampos defs={CAMPOS_PESSOAIS} valores={v} onChange={setV} desabilitado={desabilitado} />
      <h3 className="secao-titulo">Veículo e operação</h3>
      <GradeCampos defs={CAMPOS_OPERACAO} valores={v} onChange={setV} desabilitado={desabilitado} />
      <h3 className="secao-titulo">Comissão automática</h3>
      <p className="apagado">Valor extra pago pela empresa a cada entrega finalizada: não é descontado do repasse do entregador nem cobrado do comércio.</p>
      <GradeCampos defs={v.comissaoAutoAtiva ? CAMPOS_COMISSAO : CAMPOS_COMISSAO.slice(0, 1)} valores={v} onChange={setV} desabilitado={desabilitado} />
      {novo && (
        <>
          <h3 className="secao-titulo">Acesso ao app</h3>
          <div className="grade-campos">
            <Campo rotulo="Senha inicial do app" dica="Opcional. Mínimo 6 caracteres; exige e-mail preenchido. Pode ser definida depois.">
              <input type="text" value={senha} onChange={e => setSenha(e.target.value)} minLength={6} />
            </Campo>
          </div>
        </>
      )}
      {!desabilitado && (
        <div className="form-rodape">
          <button type="submit" className="btn btn-primario" disabled={ocupado}>{novo ? "Cadastrar entregador" : "Salvar alterações"}</button>
        </div>
      )}
    </form>
  );
}

function ComerciosPermitidos({ entregador, onSalvo, desabilitado }) {
  const { dados: comercios } = useApi("/comercios");
  const [sel, setSel] = useState(new Set(entregador.comerciosPermitidos || []));
  const { executar, ocupado } = useAcao();

  function alternar(id) {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSel(n);
  }

  async function salvar() {
    const r = await executar(() => api.put(`/entregadores/${entregador.id}/comercios-permitidos`, { comercioIds: [...sel] }), "Comércios permitidos salvos.");
    if (r) onSalvo();
  }

  return (
    <div>
      {entregador.permissaoColeta !== "SOMENTE_SELECIONADOS" && (
        <div className="aviso-caixa">
          Este entregador pode coletar em <strong>todos os comércios</strong>. Para restringir, mude "Pode coletar em" na aba Cadastro
          para "Somente comércios selecionados" — a lista abaixo passa a valer.
        </div>
      )}
      {!comercios ? <Carregando /> : (
        <ul className="lista-check">
          {comercios.map(c => (
            <li key={c.id}>
              <label>
                <input type="checkbox" checked={sel.has(c.id)} onChange={() => alternar(c.id)} disabled={desabilitado} />
                <span>{c.nomeFantasia}</span>
                {c.bloqueado && <Badge tom="critico">Bloqueado</Badge>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {!desabilitado && (
        <div className="form-rodape">
          <Botao variante="primario" onClick={salvar} disabled={ocupado}>Salvar seleção</Botao>
        </div>
      )}
    </div>
  );
}

function DetalheEntregador({ id, onFechar, onAlterado }) {
  const { podeEditar } = useAuth();
  const pode = podeEditar("entregadores");
  const { dados: e, erro, recarregar } = useApi(`/entregadores/${id}`, { aoVivo: ["entregadores"] });
  const pedidos = useApi(`/pedidos?entregadorId=${id}&limite=15`, { aoVivo: ["pedidos"] });
  const [aba, setAba] = useState("resumo");
  const [senha, setSenha] = useState("");
  const { executar, ocupado } = useAcao();

  async function acao(fn, msg) {
    const r = await executar(fn, msg);
    if (r) {
      await recarregar({ silencioso: true });
      onAlterado();
    }
    return r;
  }

  return (
    <Gaveta
      titulo={e?.nomeCompleto || "Entregador"}
      subtitulo={e && (
        <span className="badges">
          <BadgeMapa mapa={STATUS_ENTREGADOR} valor={e.status} />
          {e.bloqueado && <Badge tom="critico">Bloqueado</Badge>}
          {e.online ? <Badge tom="ok">● Online</Badge> : <Badge tom="apagado">Offline</Badge>}
        </span>
      )}
      onFechar={onFechar}
    >
      <ErroCaixa erro={erro} />
      {!e ? <Carregando /> : (
        <>
          <Abas
            ativa={aba}
            onChange={setAba}
            abas={[
              { valor: "resumo", rotulo: "Resumo" },
              { valor: "cadastro", rotulo: "Cadastro" },
              { valor: "comercios", rotulo: "Comércios permitidos" },
              { valor: "pedidos", rotulo: "Pedidos" },
            ]}
          />

          {aba === "resumo" && (
            <>
              <div className="grade-stats grade-stats-3">
                <StatTile rotulo="Entregas concluídas" valor={numero(e.estatisticas.entregues)} />
                <StatTile rotulo="Em andamento" valor={numero(e.estatisticas.emAndamento)} />
                <StatTile rotulo="Valor entregue" valor={moeda(e.estatisticas.valorEntregue)} />
              </div>

              {e.status === "EM_ANALISE" && pode && (
                <section className="bloco cartao-alerta-suave">
                  <h3>Cadastro aguardando aprovação</h3>
                  <p className="apagado">Confira documentos e dados na aba Cadastro antes de aprovar. Só entregadores ativos podem ficar online e aceitar corridas.</p>
                  <div className="botoes">
                    <Botao variante="primario" disabled={ocupado} onClick={() => acao(() => api.patch(`/entregadores/${id}/status`, { status: "ATIVO" }), "Entregador aprovado.")}>
                      Aprovar entregador
                    </Botao>
                    <BotaoConfirmar confirmar="Reprovar cadastro?" onConfirm={() => acao(() => api.patch(`/entregadores/${id}/status`, { status: "INATIVO" }), "Cadastro reprovado.")}>
                      Reprovar
                    </BotaoConfirmar>
                  </div>
                </section>
              )}

              <dl className="detalhes">
                <dt>Telefone</dt><dd>{e.telefone || "—"}</dd>
                <dt>E-mail</dt><dd>{e.email || "—"}</dd>
                <dt>Veículo</dt><dd>{VEICULOS[e.veiculoTipo]} {e.veiculoModelo} {e.veiculoPlaca && `· ${e.veiculoPlaca}`}</dd>
                <dt>Vínculo</dt><dd>{TIPO_ENTREGA[e.tipoEntrega]}</dd>
                <dt>Repasse/entrega</dt><dd>{moeda(e.taxaEntrega)}</dd>
                <dt>Comissão automática</dt><dd>{e.comissaoAutoAtiva ? `${moeda(e.comissaoAutoValor)} por entrega finalizada` : "Desligada"}</dd>
                <dt>Coleta</dt><dd>{PERMISSAO_COLETA[e.permissaoColeta]}</dd>
                <dt>Última posição</dt><dd>{e.localizacaoEm ? tempoRelativo(e.localizacaoEm) : "Nunca enviou"}</dd>
                <dt>Cadastrado em</dt><dd>{dataHora(e.createdAt)}</dd>
              </dl>

              {pode && (
                <>
                  <section className="bloco">
                    <h3>Acesso ao app do entregador</h3>
                    <p className="apagado">
                      {e.temAcessoApp ? `Acesso liberado com o e-mail ${e.email}.` : "Ainda sem senha de acesso ao app."}
                    </p>
                    <div className="linha-acao">
                      <input type="text" placeholder="Nova senha (mín. 6)" value={senha} onChange={ev => setSenha(ev.target.value)} aria-label="Nova senha do app" />
                      <Botao
                        pequeno
                        variante="primario"
                        disabled={senha.length < 6 || ocupado}
                        onClick={async () => { if (await acao(() => api.patch(`/entregadores/${id}/senha`, { senha }), "Senha do app definida.")) setSenha(""); }}
                      >
                        {e.temAcessoApp ? "Redefinir senha" : "Liberar acesso"}
                      </Botao>
                    </div>
                  </section>

                  <section className="bloco">
                    <h3>Celular conectado</h3>
                    <p className="apagado" style={{ marginTop: 0 }}>
                      {e.aparelhoConectado
                        ? <>📱 {e.aparelhoNome || "Aparelho"} — conectado desde {e.aparelhoEm ? new Date(e.aparelhoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}. A conta só entra neste celular.</>
                        : "Nenhum celular conectado. O próximo aparelho em que o entregador entrar fica vinculado à conta."}
                    </p>
                    {e.aparelhoConectado && (
                      <BotaoConfirmar variante="primario" confirmar="Desconectar este celular?" onConfirm={() => acao(() => api.patch(`/entregadores/${id}/liberar-aparelho`), "Celular liberado — o entregador pode entrar em outro aparelho.")}>
                        Liberar aparelho
                      </BotaoConfirmar>
                    )}
                  </section>

                  <section className="bloco">
                    <h3>Situação</h3>
                    <div className="botoes">
                      {e.bloqueado ? (
                        <Botao disabled={ocupado} onClick={() => acao(() => api.patch(`/entregadores/${id}/desbloquear`), "Entregador desbloqueado.")}>Desbloquear</Botao>
                      ) : (
                        <BotaoConfirmar confirmar="Bloquear e desconectar do app?" onConfirm={() => acao(() => api.patch(`/entregadores/${id}/bloquear`), "Entregador bloqueado.")}>
                          Bloquear
                        </BotaoConfirmar>
                      )}
                      {e.status === "ATIVO" && (
                        <Botao disabled={ocupado} onClick={() => acao(() => api.patch(`/entregadores/${id}/status`, { status: "INATIVO" }), "Entregador inativado.")}>Inativar</Botao>
                      )}
                      {e.status === "INATIVO" && (
                        <Botao disabled={ocupado} onClick={() => acao(() => api.patch(`/entregadores/${id}/status`, { status: "ATIVO" }), "Entregador reativado.")}>Reativar</Botao>
                      )}
                      <BotaoConfirmar
                        confirmar="Excluir definitivamente?"
                        onConfirm={async () => { if (await executar(() => api.del(`/entregadores/${id}`), "Entregador excluído.")) { onAlterado(); onFechar(); } }}
                      >
                        Excluir
                      </BotaoConfirmar>
                    </div>
                  </section>
                </>
              )}
            </>
          )}

          {aba === "cadastro" && (
            <FormEntregador key={e.id} entregador={e} desabilitado={!pode} onSalvo={() => { recarregar({ silencioso: true }); onAlterado(); }} />
          )}

          {aba === "comercios" && <ComerciosPermitidos entregador={e} desabilitado={!pode} onSalvo={() => recarregar({ silencioso: true })} />}

          {aba === "pedidos" && (
            !pedidos.dados ? <Carregando /> : pedidos.dados.length === 0 ? <Vazio titulo="Nenhum pedido ainda" /> : (
              <table className="tabela tabela-compacta">
                <thead><tr><th>Código</th><th>Status</th><th>Comércio</th><th className="num">Valor</th><th>Data</th></tr></thead>
                <tbody>
                  {pedidos.dados.map(p => (
                    <tr key={p.id}>
                      <td>{p.codigo}</td>
                      <td><BadgeMapa mapa={STATUS_PEDIDO} valor={p.status} /></td>
                      <td>{p.comercio?.nomeFantasia}</td>
                      <td className="num">{moeda(p.valor)}</td>
                      <td>{dataHora(p.createdAt)}</td>
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

const MODELO_CSV = "nome_completo,cpf,rg,data_nascimento,telefone,email,cep,rua,numero,complemento,bairro,cidade,veiculo_tipo,veiculo_modelo,veiculo_placa,veiculo_ano,cnh_valida,tipo_entrega,taxa_entrega,status";

function ImportarCsv({ onFechar, onImportado }) {
  const [csv, setCsv] = useState(MODELO_CSV + "\n");
  const { executar, ocupado } = useAcao();

  function lerArquivo(ev) {
    const arquivo = ev.target.files?.[0];
    if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = () => setCsv(String(leitor.result));
    leitor.readAsText(arquivo, "utf-8");
  }

  async function importar() {
    const r = await executar(() => api.post("/entregadores/import", { csv }));
    if (r) onImportado(r.importados);
  }

  return (
    <Modal
      titulo="Importar entregadores (CSV)"
      onFechar={onFechar}
      largo
      rodape={<>
        <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={importar} disabled={ocupado}>Importar</Botao>
      </>}
    >
      <p className="apagado">
        Separado por vírgula, com a primeira linha de cabeçalho abaixo. Valores aceitos: veiculo_tipo = moto/bike/carro;
        tipo_entrega = próprio/terceirizado/parceiro; status = em análise/ativo/inativo; cnh_valida = sim/não.
      </p>
      <Campo rotulo="Arquivo .csv"><input type="file" accept=".csv,text/csv" onChange={lerArquivo} /></Campo>
      <Campo rotulo="Conteúdo" largo><textarea rows={10} className="mono" value={csv} onChange={e => setCsv(e.target.value)} /></Campo>
    </Modal>
  );
}

export default function Entregadores() {
  const { podeEditar } = useAuth();
  const avisar = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "";
  const [soOnline, setSoOnline] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [aberto, setAberto] = useState(null);
  const [novo, setNovo] = useState(false);
  const [importar, setImportar] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  const lista = useApi(`/entregadores${qs({ status, busca: buscaAplicada, online: soOnline ? "true" : "" })}`, { intervaloMs: 60000, aoVivo: ["entregadores"] });
  const contagem = useApi("/entregadores/contagem", { intervaloMs: 60000, aoVivo: ["entregadores"] });
  const c = contagem.dados || {};

  function filtrarStatus(s) {
    setSoOnline(false);
    const p = new URLSearchParams(params);
    if (s && s !== status) p.set("status", s); else p.delete("status");
    setParams(p, { replace: true });
  }

  function atualizar() {
    lista.recarregar({ silencioso: true });
    contagem.recarregar({ silencioso: true });
  }

  return (
    <>
      <Cabecalho titulo="Entregadores" subtitulo="Cadastro, aprovação e acesso ao app do entregador">
        {podeEditar("entregadores") && (
          <>
            <Botao onClick={() => setImportar(true)}>Importar CSV</Botao>
            <Botao variante="primario" onClick={() => setNovo(true)}>+ Novo entregador</Botao>
          </>
        )}
      </Cabecalho>

      <div className="grade-stats grade-stats-5">
        <StatTile rotulo="Em análise" valor={numero(c.emAnalise)} tom={c.emAnalise > 0 ? "aviso" : undefined} ativo={status === "EM_ANALISE"} onClick={() => filtrarStatus("EM_ANALISE")} />
        <StatTile rotulo="Ativos" valor={numero(c.ativos)} ativo={status === "ATIVO"} onClick={() => filtrarStatus("ATIVO")} />
        <StatTile rotulo="Inativos" valor={numero(c.inativos)} ativo={status === "INATIVO"} onClick={() => filtrarStatus("INATIVO")} />
        <StatTile rotulo="Online agora" valor={numero(c.online)} ativo={soOnline} onClick={() => { const ligar = !soOnline; filtrarStatus(""); setSoOnline(ligar); }} />
        <StatTile rotulo="Bloqueados" valor={numero(c.bloqueados)} />
      </div>

      <div className="filtros">
        <input type="search" placeholder="Buscar por nome, CPF, telefone ou e-mail" value={busca} onChange={e => setBusca(e.target.value)} />
        {(status || soOnline) && <Botao variante="fantasma" pequeno onClick={() => filtrarStatus("")}>Limpar filtro</Botao>}
      </div>

      <ErroCaixa erro={lista.erro} onTentar={() => lista.recarregar()} />

      <div className="cartao cartao-tabela">
        {lista.carregando && !lista.dados ? <Carregando /> : !lista.dados?.length ? (
          <Vazio titulo="Nenhum entregador encontrado" />
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela tabela-clicavel">
              <thead>
                <tr><th>Nome</th><th>Status</th><th>Veículo</th><th>Vínculo</th><th>App</th><th className="num">Pedidos</th><th>Cadastro</th></tr>
              </thead>
              <tbody>
                {lista.dados.map(e => (
                  <tr key={e.id} onClick={() => setAberto(e.id)} tabIndex={0} onKeyDown={ev => { if (ev.key === "Enter") setAberto(e.id); }}>
                    <td>
                      <strong>{e.nomeCompleto}</strong>
                      <div className="celula-sub">{e.telefone || e.email || ""}</div>
                    </td>
                    <td>
                      <span className="badges">
                        <BadgeMapa mapa={STATUS_ENTREGADOR} valor={e.status} />
                        {e.bloqueado && <Badge tom="critico">Bloqueado</Badge>}
                      </span>
                    </td>
                    <td>{VEICULOS[e.veiculoTipo]}{e.veiculoPlaca && <span className="apagado"> · {e.veiculoPlaca}</span>}</td>
                    <td>{TIPO_ENTREGA[e.tipoEntrega]}</td>
                    <td>
                      {e.online ? <Badge tom="ok">● Online</Badge> : e.temAcessoApp ? <span className="apagado">Offline</span> : <span className="apagado">Sem acesso</span>}
                    </td>
                    <td className="num">{numero(e._count?.pedidos)}</td>
                    <td className="apagado">{dataHora(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {aberto && <DetalheEntregador key={aberto} id={aberto} onFechar={() => setAberto(null)} onAlterado={atualizar} />}

      {novo && (
        <Gaveta titulo="Novo entregador" onFechar={() => setNovo(false)}>
          <FormEntregador onSalvo={e => { setNovo(false); atualizar(); setAberto(e.id); }} />
        </Gaveta>
      )}

      {importar && (
        <ImportarCsv
          onFechar={() => setImportar(false)}
          onImportado={n => {
            setImportar(false);
            atualizar();
            avisar(`${n} entregador(es) importado(s).`);
          }}
        />
      )}
    </>
  );
}
