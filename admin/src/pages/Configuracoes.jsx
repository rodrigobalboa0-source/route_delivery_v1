import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { Botao, Cabecalho, Carregando, ErroCaixa, GradeCampos, prepararValores, useAcao } from "../components/ui";

// Os canais de notificação ficam salvos como preferência; o envio real depende de
// integrar um provedor (push/e-mail/SMS) no backend.
const CAMPOS = [
  {
    nome: "raioMaximoKm", rotulo: "Raio máximo para oferecer pedidos (km)", tipo: "number", obrigatorio: true,
    dica: "O app do entregador só mostra pedidos cuja coleta esteja dentro deste raio da posição dele.",
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
      <RegrasSaque pode={pode} />
      <DadosEmpresa dados={dados} setDados={setDados} pode={pode} />
    </>
  );
}
