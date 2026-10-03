import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { Badge, Botao, BotaoConfirmar, Cabecalho, Campo, Carregando, ErroCaixa, GradeCampos, prepararValores, useAcao } from "../components/ui";
import { EmailEnvio, RankingSemanal } from "./ConfiguracoesExtras";

// Google Maps: usado SÓ para localizar endereços e medir o km da rota (preço da entrega).
// Os mapas do painel continuam no OpenStreetMap. Sem chave, o cálculo usa o OpenStreetMap (gratuito).
function GoogleMaps({ dados, setDados, pode }) {
  const [chave, setChave] = useState("");
  const [teste, setTeste] = useState({ origem: "", destino: "" });
  const [resultado, setResultado] = useState(null);
  const { executar, ocupado } = useAcao();
  const g = dados?.googleMaps;

  async function salvar(e) {
    e.preventDefault();
    const r = await executar(() => api.put("/configuracoes/google-maps", { chave }), "Chave do Google Maps salva.");
    if (r) { setDados(r); setChave(""); setResultado(null); }
  }

  async function testar(e) {
    e.preventDefault();
    setResultado(null);
    const r = await executar(() => api.post("/configuracoes/google-maps/testar", teste));
    if (r) setResultado(r);
  }

  return (
    <section className="cartao">
      <div className="cartao-topo"><h2>Google Maps (cálculo do km)</h2></div>
      {!dados ? <Carregando /> : (
        <>
          <div className="google-status">
            {g?.configurada
              ? <Badge tom="ok">● Ativo — chave terminada em …{g.final}</Badge>
              : g?.viaVariavel
                ? <Badge tom="ok">● Ativo (chave na variável do servidor)</Badge>
                : <Badge tom="apagado">Não configurado — usando OpenStreetMap (gratuito)</Badge>}
            <span className="apagado">Usado só para localizar endereços e medir o km da rota. O mapa do painel não muda.</span>
          </div>

          {pode && (
            <form onSubmit={salvar} className="linha-acao">
              <input type="password" autoComplete="off" value={chave} onChange={e => setChave(e.target.value)}
                placeholder={g?.configurada ? "Colar uma nova chave para trocar" : "Cole aqui a chave da API (começa com AIza…)"} aria-label="Chave da API do Google Maps" style={{ flex: 1, minWidth: 0 }} />
              <button type="submit" className="btn btn-primario" disabled={ocupado || chave.trim().length < 30}>Salvar chave</button>
              {g?.configurada && (
                <BotaoConfirmar confirmar="Remover a chave?" onConfirm={async () => { const r = await executar(() => api.del("/configuracoes/google-maps"), "Chave removida — voltando ao OpenStreetMap."); if (r) { setDados(r); setResultado(null); } }}>Remover</BotaoConfirmar>
              )}
            </form>
          )}

          {(g?.configurada || g?.viaVariavel) && pode && (
            <form onSubmit={testar} className="google-teste">
              <Campo rotulo="Testar: endereço de origem"><input value={teste.origem} onChange={e => setTeste({ ...teste, origem: e.target.value })} placeholder="Ex.: Av. Paulista, 1000, São Paulo" required /></Campo>
              <Campo rotulo="Endereço de destino"><input value={teste.destino} onChange={e => setTeste({ ...teste, destino: e.target.value })} placeholder="Ex.: Rua Augusta, 500, São Paulo" required /></Campo>
              <button type="submit" className="btn" disabled={ocupado}>Calcular rota</button>
            </form>
          )}
          {resultado && <div className="sucesso-caixa" style={{ marginTop: 10 }}>✓ O Google calculou a rota: <strong>{String(resultado.distanciaKm).replace(".", ",")} km</strong>. Está funcionando.</div>}

          {!g?.configurada && (
            <details style={{ marginTop: 12 }}>
              <summary className="link">Como conseguir a chave do Google Maps</summary>
              <ol className="google-passos">
                <li>Acesse <strong>console.cloud.google.com/google/maps-apis</strong> e entre com uma conta Google.</li>
                <li>Crie um projeto e ative o <strong>faturamento</strong> (o Google exige cartão; há uma cota mensal gratuita).</li>
                <li>Em <strong>APIs e serviços</strong>, ative a <strong>Geocoding API</strong> e a <strong>Routes API</strong>.</li>
                <li>Em <strong>Credenciais</strong>, crie uma <strong>chave de API</strong> e restrinja-a a essas duas APIs.</li>
                <li>Cole a chave acima e clique em <strong>Salvar chave</strong>; depois use o teste para conferir.</li>
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
}

// Os canais de notificação ficam salvos como preferência; o envio real depende de
// integrar um provedor (push/e-mail/SMS) no backend.
const CAMPOS = [
  {
    nome: "raioMaximoKm", rotulo: "Raio máximo para oferecer pedidos (km)", tipo: "number", obrigatorio: true,
    dica: "O app do entregador só mostra pedidos cuja coleta esteja dentro deste raio da posição dele.",
  },
  {
    nome: "retornoPercentual", rotulo: "Acréscimo da entrega com retorno (%)", tipo: "number", obrigatorio: true,
    dica: "Quando a loja marca “Retorno?” (o entregador volta à loja), a taxa calculada fica esta % maior. Padrão: 20%.",
  },
  {
    nome: "raioConfirmacaoMetros", rotulo: "Distância para confirmar etapa no app (metros)", tipo: "number", obrigatorio: true,
    dica: "O entregador só marca “Cheguei na loja”/“Saí para entrega” perto da loja e “Cheguei no cliente”/“Finalizar” perto do cliente. Padrão: 200 m.",
  },
  { nome: "notificacoesPush", rotulo: "Notificações push", tipo: "checkbox" },
  { nome: "notificacoesEmail", rotulo: "Notificações por e-mail", tipo: "checkbox" },
  { nome: "notificacoesSms", rotulo: "Notificações por SMS", tipo: "checkbox" },
];

// Emitente dos recibos e das notas de débito (Financeiro › Gerar Recibo / Gerar Nota).
const CAMPOS_EMPRESA = [
  { nome: "empresaNome", rotulo: "Nome / razão social", dica: "Sai no topo de recibos e notas. Em branco, usa “Route Delivery”." },
  { nome: "empresaDocumento", rotulo: "CNPJ ou CPF" },
  { nome: "empresaEndereco", rotulo: "Endereço completo", largo: true },
  { nome: "empresaTelefone", rotulo: "Telefone" },
  { nome: "empresaEmail", rotulo: "E-mail" },
];

function DadosEmpresa({ dados, setDados, pode }) {
  const [v, setV] = useState(null);
  const { executar, ocupado } = useAcao();
  const valores = v || dados;

  async function salvar(e) {
    e.preventDefault();
    const r = await executar(() => api.put("/configuracoes", prepararValores(CAMPOS_EMPRESA, valores)), "Dados da empresa salvos.");
    if (r) { setDados(r); setV(null); }
  }

  return (
    <section className="cartao">
      <div className="cartao-topo"><h2>Dados da empresa</h2></div>
      {!valores ? <Carregando /> : (
        <form onSubmit={salvar}>
          <GradeCampos defs={CAMPOS_EMPRESA} valores={valores} onChange={setV} desabilitado={!pode} />
          {pode && v && (
            <div className="form-rodape">
              <Botao variante="fantasma" onClick={() => setV(null)}>Descartar</Botao>
              <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar dados da empresa</button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

// O que cada loja pode fazer no sistema do comerciante. Desligado = a opção nem aparece para a loja.
const PERMISSOES_LOJA = [
  { nome: "exigirCodigoTelefone", rotulo: "Código de entrega", curto: "Código", dica: "Pedidos lançados pela loja: o entregador só finaliza digitando os 4 últimos números do telefone do cliente informado na criação do pedido. O telefone passa a ser obrigatório e o app não mostra o telefone do cliente ao entregador. Após 5 erros, só a loja ou a equipe finalizam." },
  { nome: "lojaPodeFinalizar", rotulo: "Finalizar pedido", curto: "Finalizar", dica: "A loja marca o pedido como entregue. Com entregador, conta como entrega dele (ganho, ranking e acerto). Pedido do iFood com código continua sendo finalizado só pelo app." },
  { nome: "lojaPodeEditarComercio", rotulo: "Editar comércio", curto: "Editar comércio", dica: "A loja muda nome, responsável, telefone, logo e o endereço de coleta (escolhido no mapa). O endereço muda o km e o preço das próximas entregas. Você recebe uma notificação a cada alteração." },
  { nome: "lojaPodeEditarEntregador", rotulo: "Editar entregador", curto: "Editar entregador", dica: "A loja muda nome, telefone e veículo (tipo, modelo, placa, ano) dos entregadores que trabalharam para ela. Fica no histórico do entregador e gera notificação." },
  { nome: "lojaPodeBloquearEntregador", rotulo: "Bloquear entregador", curto: "Bloquear entregador", dica: "Bloqueio só na loja: o entregador não vê nem recebe corridas dela, mas continua trabalhando para as outras. Você vê e desfaz na ficha do entregador." },
];

function Chave({ ligado, onChange, desabilitado, rotulo }) {
  return (
    <label className="campo-switch chave-tabela" title={rotulo}>
      <input type="checkbox" role="switch" checked={!!ligado} disabled={desabilitado} onChange={e => onChange(e.target.checked)} aria-label={rotulo} />
      <span className="interruptor" aria-hidden="true" />
    </label>
  );
}

// Permissões por loja: cada função ligada ou desligada loja a loja (ou para todas de uma vez).
function PermissoesLoja({ pode }) {
  const { dados: lojas, erro, setDados, recarregar } = useApi("/comercios/permissoes");
  const [busca, setBusca] = useState("");
  const { executar, ocupado } = useAcao();
  const q = busca.trim().toLowerCase();
  const lista = (lojas || []).filter(l => !q || l.nomeFantasia.toLowerCase().includes(q));

  async function mudar(loja, campo, valor) {
    setDados(ls => ls.map(l => (l.id === loja.id ? { ...l, [campo]: valor } : l)));
    const r = await executar(() => api.put(`/comercios/${loja.id}/permissoes`, { [campo]: valor }),
      `${PERMISSOES_LOJA.find(p => p.nome === campo).rotulo} ${valor ? "ligado" : "desligado"} para ${loja.nomeFantasia}.`);
    if (!r) recarregar({ silencioso: true });
  }

  async function todas(campo, valor) {
    const r = await executar(() => api.put("/comercios/permissoes/todas", { campo, valor }),
      `${PERMISSOES_LOJA.find(p => p.nome === campo).rotulo} ${valor ? "ligado" : "desligado"} para todas as lojas.`);
    if (r) recarregar({ silencioso: true });
  }

  return (
    <section className="cartao">
      <div className="cartao-topo"><h2>Permissões da loja</h2></div>
      <p className="apagado" style={{ marginTop: 0 }}>
        Escolha, loja por loja, as funções extras do sistema da loja. Editar, Detalhes, Copiar link de rastreio,
        Escrever observação, Trocar entregador, Reprocurar e Cancelar ficam sempre disponíveis.
      </p>
      <dl className="legenda-permissoes">
        {PERMISSOES_LOJA.map(p => <div key={p.nome}><dt>{p.rotulo}</dt><dd>{p.dica}</dd></div>)}
      </dl>
      <ErroCaixa erro={erro} />
      {!lojas ? <Carregando /> : (
        <>
          <input type="search" className="busca-permissoes" placeholder="Buscar loja…" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar loja" />
          <div className="tabela-rolagem">
            <table className="tabela tabela-compacta tabela-permissoes">
              <thead>
                <tr>
                  <th>Loja</th>
                  {PERMISSOES_LOJA.map(p => <th key={p.nome} className="centro">{p.curto}</th>)}
                </tr>
                {pode && lojas.length > 1 && (
                  <tr className="linha-todas">
                    <td className="apagado">Todas as lojas</td>
                    {PERMISSOES_LOJA.map(p => (
                      <td key={p.nome} className="centro">
                        <BotaoConfirmar pequeno variante="primario" confirmar="Ligar para todas?" disabled={ocupado} onConfirm={() => todas(p.nome, true)}>Ligar</BotaoConfirmar>
                        <BotaoConfirmar pequeno confirmar="Desligar para todas?" disabled={ocupado} onConfirm={() => todas(p.nome, false)}>Desligar</BotaoConfirmar>
                      </td>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {lista.length === 0 ? (
                  <tr><td colSpan={PERMISSOES_LOJA.length + 1} className="apagado">Nenhuma loja encontrada.</td></tr>
                ) : lista.map(l => (
                  <tr key={l.id}>
                    <td>{l.nomeFantasia}{l.bloqueado && <> <Badge tom="critico">Bloqueada</Badge></>}</td>
                    {PERMISSOES_LOJA.map(p => (
                      <td key={p.nome} className="centro">
                        <Chave ligado={l[p.nome]} desabilitado={!pode} rotulo={`${p.rotulo} — ${l.nomeFantasia}`} onChange={v => mudar(l, p.nome, v)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

const PARAMETROS_ROTA = [
  { nome: "rotaEsperaSegundos", rotulo: "Espera para roteirizar (segundos)", min: 5, max: 120, step: 1, dica: "Tempo que o pedido pronto aguarda outros pedidos antes de ser oferecido. Padrão: 15 s." },
  { nome: "rotaMaxPedidos", rotulo: "Máximo de entregas por rota", min: 2, max: 10, step: 1, dica: "Padrão: 3." },
  { nome: "rotaDistanciaMaxKm", rotulo: "Distância máx. entre entregas (km)", min: 0.3, max: 30, step: 0.1, dica: "Só agrupa clientes próximos entre si. Padrão: 3 km." },
  { nome: "rotaRaioColetaKm", rotulo: "Distância máx. entre lojas (km)", min: 0.1, max: 20, step: 0.1, dica: "Para “Todos os comércios”: só junta lojas próximas. Padrão: 2 km." },
];

// Roteirização automática: valores gerais + liga/desliga e escopo loja a loja.
function Roteirizacao({ dados, setDados, pode }) {
  const { dados: lojas, erro, setDados: setLojas, recarregar } = useApi("/comercios/roteirizacao");
  const [v, setV] = useState(null);
  const [busca, setBusca] = useState("");
  const { executar, ocupado } = useAcao();
  const q = busca.trim().toLowerCase();
  const lista = (lojas || []).filter(l => !q || l.nomeFantasia.toLowerCase().includes(q));
  const valores = v || (dados && Object.fromEntries(PARAMETROS_ROTA.map(p => [p.nome, dados[p.nome] ?? ""])));

  async function salvar(e) {
    e.preventDefault();
    const r = await executar(() => api.put("/configuracoes", valores), "Parâmetros da roteirização salvos.");
    if (r) { setDados(r); setV(null); }
  }

  async function mudar(loja, campo, valor, msg) {
    setLojas(ls => ls.map(l => (l.id === loja.id ? { ...l, [campo]: valor } : l)));
    const r = await executar(() => api.put(`/comercios/${loja.id}/roteirizacao`, { [campo]: valor }), `${msg} — ${loja.nomeFantasia}.`);
    if (!r) recarregar({ silencioso: true });
  }

  async function todas(corpo, msg) {
    const r = await executar(() => api.put("/comercios/roteirizacao/todas", corpo), `${msg} para todas as lojas.`);
    if (r) recarregar({ silencioso: true });
  }

  return (
    <section className="cartao">
      <div className="cartao-topo"><h2>Roteirização automática</h2></div>
      <p className="apagado" style={{ marginTop: 0 }}>
        Com a roteirização ligada, o pedido pronto espera alguns segundos: se sair outro pedido para perto, os dois (ou mais)
        viram uma rota, oferecida a um só entregador com o valor somado. O que não tiver par segue sozinho, como hoje.
        A roteirização manual (botão <strong>Roteirizar</strong> na Operação) funciona sempre, em qualquer loja.
      </p>
      {valores && (
        <form onSubmit={salvar}>
          <div className="grade-campos">
            {PARAMETROS_ROTA.map(p => (
              <label key={p.nome} className="campo">
                <span className="campo-rotulo">{p.rotulo}</span>
                <input type="number" min={p.min} max={p.max} step={p.step} value={valores[p.nome]} disabled={!pode} required
                  onChange={e => setV({ ...valores, [p.nome]: e.target.value })} />
                <span className="campo-dica">{p.dica}</span>
              </label>
            ))}
          </div>
          {pode && v && (
            <div className="form-rodape">
              <Botao variante="fantasma" onClick={() => setV(null)}>Descartar</Botao>
              <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar parâmetros</button>
            </div>
          )}
        </form>
      )}
      <dl className="legenda-permissoes">
        <div><dt>Só desta loja</dt><dd>Junta apenas pedidos da mesma loja.</dd></div>
        <div><dt>Todos os comércios</dt><dd>Também junta com pedidos de outras lojas que estejam em “Todos os comércios” e próximas entre si.</dd></div>
      </dl>
      <ErroCaixa erro={erro} />
      {!lojas ? <Carregando /> : (
        <>
          <input type="search" className="busca-permissoes" placeholder="Buscar loja…" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar loja" />
          <div className="tabela-rolagem">
            <table className="tabela tabela-compacta tabela-permissoes">
              <thead>
                <tr><th>Loja</th><th className="centro">Automática</th><th>Agrupar com</th></tr>
                {pode && lojas.length > 1 && (
                  <tr className="linha-todas">
                    <td className="apagado">Todas as lojas</td>
                    <td className="centro">
                      <BotaoConfirmar pequeno variante="primario" confirmar="Ligar para todas?" disabled={ocupado} onConfirm={() => todas({ roteirizacaoAutomatica: true }, "Roteirização automática ligada")}>Ligar</BotaoConfirmar>
                      <BotaoConfirmar pequeno confirmar="Desligar para todas?" disabled={ocupado} onConfirm={() => todas({ roteirizacaoAutomatica: false }, "Roteirização automática desligada")}>Desligar</BotaoConfirmar>
                    </td>
                    <td>
                      <BotaoConfirmar pequeno variante="secundario" confirmar="Só da loja, para todas?" disabled={ocupado} onConfirm={() => todas({ roteirizacaoEscopo: "LOJA" }, "Agrupar só da própria loja")}>Só da loja</BotaoConfirmar>
                      <BotaoConfirmar pequeno variante="secundario" confirmar="Todos os comércios, para todas?" disabled={ocupado} onConfirm={() => todas({ roteirizacaoEscopo: "TODOS" }, "Agrupar com todos os comércios")}>Todos</BotaoConfirmar>
                    </td>
                  </tr>
                )}
              </thead>
              <tbody>
                {lista.length === 0 ? (
                  <tr><td colSpan={3} className="apagado">Nenhuma loja encontrada.</td></tr>
                ) : lista.map(l => (
                  <tr key={l.id}>
                    <td>{l.nomeFantasia}{l.bloqueado && <> <Badge tom="critico">Bloqueada</Badge></>}</td>
                    <td className="centro">
                      <Chave ligado={l.roteirizacaoAutomatica} desabilitado={!pode} rotulo={`Roteirização automática — ${l.nomeFantasia}`}
                        onChange={val => mudar(l, "roteirizacaoAutomatica", val, `Roteirização automática ${val ? "ligada" : "desligada"}`)} />
                    </td>
                    <td>
                      <select value={l.roteirizacaoEscopo} disabled={!pode} aria-label={`Agrupar com — ${l.nomeFantasia}`}
                        onChange={e => mudar(l, "roteirizacaoEscopo", e.target.value, e.target.value === "TODOS" ? "Agrupa com todos os comércios" : "Agrupa só pedidos da própria loja")}>
                        <option value="LOJA">Só desta loja</option>
                        <option value="TODOS">Todos os comércios</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

const DIAS_SEMANA =["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TIPOS_SAQUE = [
  { tipo: "NORMAL", titulo: "Saque normal" },
  { tipo: "RAPIDO", titulo: "Saque rápido" },
];

// Converte a regra da API para o formulário (datas como texto separado por vírgula).
function paraFormulario(r) {
  return {
    limitePorSolicitacao: r.limitePorSolicitacao ?? "",
    maxSolicitacoesDia: r.maxSolicitacoesDia,
    diasPermitidos: r.diasPermitidos || [],
    datasEspecificas: (r.datasEspecificas || []).join(", "),
  };
}

function BlocoSaque({ titulo, valor, onChange, desabilitado }) {
  const set = campo => e => onChange({ ...valor, [campo]: e.target.value });
  function alternarDia(d) {
    const dias = valor.diasPermitidos.includes(d) ? valor.diasPermitidos.filter(x => x !== d) : [...valor.diasPermitidos, d];
    onChange({ ...valor, diasPermitidos: dias.sort((a, b) => a - b) });
  }
  return (
    <div className="bloco-saque">
      <h3>{titulo}</h3>
      <div className="grade-campos">
        <label className="campo">
          <span className="campo-rotulo">Limite por solicitação (R$)</span>
          <input type="number" min="0" step="0.01" placeholder="Sem limite" value={valor.limitePorSolicitacao} onChange={set("limitePorSolicitacao")} disabled={desabilitado} />
        </label>
        <label className="campo">
          <span className="campo-rotulo">Máx. solicitações por dia</span>
          <input type="number" min="1" step="1" value={valor.maxSolicitacoesDia} onChange={set("maxSolicitacoesDia")} disabled={desabilitado} required />
        </label>
      </div>
      <div className="campo">
        <span className="campo-rotulo">Dias permitidos</span>
        <div className="dias-semana" role="group" aria-label={`Dias permitidos — ${titulo}`}>
          {DIAS_SEMANA.map((nome, d) => (
            <label key={d} className={valor.diasPermitidos.includes(d) ? "dia marcado" : "dia"}>
              <input type="checkbox" checked={valor.diasPermitidos.includes(d)} onChange={() => alternarDia(d)} disabled={desabilitado} />
              {nome}
            </label>
          ))}
        </div>
        <span className="campo-dica">Se nenhum dia for marcado, o saque fica liberado em todos os dias.</span>
      </div>
      <label className="campo">
        <span className="campo-rotulo">Datas específicas (YYYY-MM-DD)</span>
        <input placeholder="Ex: 2026-04-13, 2026-04-20" value={valor.datasEspecificas} onChange={set("datasEspecificas")} disabled={desabilitado} />
        <span className="campo-dica">Se houver datas preenchidas, elas têm prioridade sobre os dias permitidos.</span>
      </label>
    </div>
  );
}

function RegrasSaque({ pode }) {
  const { dados, erro, setDados } = useApi("/configuracoes/saque");
  const [v, setV] = useState(null);
  const { executar, ocupado } = useAcao();
  const valores = v || (dados && { NORMAL: paraFormulario(dados.NORMAL), RAPIDO: paraFormulario(dados.RAPIDO) });

  async function salvar(e) {
    e.preventDefault();
    const r = await executar(() => api.put("/configuracoes/saque", valores), "Regras de saque salvas.");
    if (r) { setDados(r); setV(null); }
  }

  return (
    <section className="cartao">
      <div className="cartao-topo"><h2>Regras de saque</h2></div>
      <ErroCaixa erro={erro} />
      {!valores ? <Carregando /> : (
        <form onSubmit={salvar}>
          <div className="grade-2 grade-saque">
            {TIPOS_SAQUE.map(t => (
              <BlocoSaque
                key={t.tipo}
                titulo={t.titulo}
                valor={valores[t.tipo]}
                desabilitado={!pode}
                onChange={novo => setV({ ...valores, [t.tipo]: novo })}
              />
            ))}
          </div>
          {pode && v && (
            <div className="form-rodape">
              <Botao variante="fantasma" onClick={() => setV(null)}>Descartar</Botao>
              <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar regras de saque</button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

export default function Configuracoes() {
  const { podeEditar } = useAuth();
  const pode = podeEditar("configuracoes");
  const { dados, erro, setDados } = useApi("/configuracoes");
  const [v, setV] = useState(null);
  const { executar, ocupado } = useAcao();
  const valores = v || dados;

  async function salvar(e) {
    e.preventDefault();
    const r = await executar(() => api.put("/configuracoes", prepararValores(CAMPOS, valores)), "Configurações salvas.");
    if (r) { setDados(r); setV(null); }
  }

  return (
    <>
      <Cabecalho titulo="Configurações" subtitulo="Regras gerais da plataforma, válidas para o app do entregador e o sistema do comerciante" />
      {!pode && <div className="aviso-caixa">Somente contas com permissão Total podem alterar as configurações.</div>}
      <ErroCaixa erro={erro} />
      <section className="cartao">
        {!valores ? <Carregando /> : (
          <form onSubmit={salvar}>
            <GradeCampos defs={CAMPOS} valores={valores} onChange={setV} desabilitado={!pode} />
            <p className="apagado">Canais de notificação: preferência salva; o envio depende de integrar um provedor no backend.</p>
            {pode && v && (
              <div className="form-rodape">
                <Botao variante="fantasma" onClick={() => setV(null)}>Descartar</Botao>
                <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar</button>
              </div>
            )}
          </form>
        )}
      </section>
      <PermissoesLoja pode={pode} />
      <Roteirizacao dados={dados} setDados={setDados} pode={pode} />
      <RankingSemanal dados={dados} setDados={setDados} pode={pode} />
      <RegrasSaque pode={pode} />
      <EmailEnvio dados={dados} setDados={setDados} pode={pode} />
      <GoogleMaps dados={dados} setDados={setDados} pode={pode} />
      <DadosEmpresa dados={dados} setDados={setDados} pode={pode} />
    </>
  );
}
