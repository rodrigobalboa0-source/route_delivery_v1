import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import {
  Badge, Botao, BotaoConfirmar, Cabecalho, Carregando, ErroCaixa, GradeCampos, Modal, Vazio, prepararValores, useAcao,
} from "../components/ui";
import { VEICULOS, data, moeda, opcoes, paraInputData } from "../utils/format";

const TIPO_APLICACAO = { MULTIPLICADOR: "Multiplicador (x)", VALOR_FIXO: "Valor Fixo (+ R$)" };
const formatarRegra = r => (r.tipoAplicacao === "MULTIPLICADOR" ? `${String(r.valor).replace(".", ",")}x` : `+ ${moeda(r.valor)}`);

// Mesma regra para o preço dinâmico da demanda e do entregador:
// Nome da Regra, Tipo de Aplicação, valor e Regra Ativa. Excluir fica dentro da edição.
function regraPrecoDinamico(tipoPadrao) {
  return {
    rotuloItem: "regra",
    excluirNoModal: true,
    padrao: { tipoAplicacao: tipoPadrao, ativo: true },
    campos: [
      { nome: "nome", rotulo: "Nome da Regra", obrigatorio: true, largo: true, placeholder: "Ex.: Horário de pico, Chuva, Feriado" },
      { nome: "tipoAplicacao", rotulo: "Tipo de Aplicação", tipo: "select", obrigatorio: true, largo: true, opcoes: opcoes(TIPO_APLICACAO) },
      {
        nome: "valor", tipo: "number", obrigatorio: true, largo: true,
        rotulo: v => (v.tipoAplicacao === "MULTIPLICADOR" ? "Multiplicador (x)" : "Valor Adicional (R$)"),
        placeholder: "0,00",
        dica: v => (v.tipoAplicacao === "MULTIPLICADOR" ? "Ex.: 1,2 = valor 20% maior." : "Somado ao valor da entrega."),
      },
      { nome: "ativo", rotulo: "Regra Ativa", tipo: "switch", largo: true },
    ],
    colunas: [
      { rotulo: "Regra", valor: r => <strong>{r.nome}</strong> },
      { rotulo: "Aplicação", valor: r => TIPO_APLICACAO[r.tipoAplicacao] },
      { rotulo: "Valor", valor: formatarRegra, num: true },
      {
        rotulo: "Situação",
        valor: (r, ctx) => (
          <label className="campo-switch chave-situacao" title={r.ativo ? "Desativar a regra" : "Ativar a regra"}>
            <input type="checkbox" role="switch" checked={!!r.ativo} disabled={!ctx?.pode || ctx?.ocupado}
              onChange={e => ctx?.alternarAtivo(r, e.target.checked)} aria-label={`${r.ativo ? "Desativar" : "Ativar"} ${r.nome}`} />
            <span className="interruptor" aria-hidden="true" />
            <span>{r.ativo ? <Badge tom="ok">● Ativa</Badge> : <Badge tom="apagado">Inativa</Badge>}</span>
          </label>
        ),
      },
    ],
  };
}

// ---------- Tabela de preço por KM: faixas ("até 3 km = R$ 7,00") ----------

const TIPO_CALCULO_KM = { FAIXAS: "Por faixas de km", DESLOCAMENTO: "Por deslocamento (valor por km)", FIXO: "Valor fixo" };
const TIPO_CALCULO_COMISSAO = { FAIXAS: "Por faixas de km", PERCENTUAL: "Percentual do valor da entrega" };
const num = v => Number(String(v ?? "").replace(",", "."));
const km = v => `${String(v).replace(".", ",")} km`;

function faixasValidas(faixas = []) {
  return faixas
    .map(f => ({ ateKm: num(f.ateKm), valor: num(f.valor) }))
    .filter(f => f.ateKm > 0 && Number.isFinite(f.valor) && String(f.valor) !== "")
    .sort((a, b) => a.ateKm - b.ateKm);
}

// Mesmo cálculo do servidor (backend/src/utils/geo.js › calcularValorEntrega), para simular na tela.
function valorPorFaixas(distancia, faixas, kmAdicional, minimo) {
  const fs = faixasValidas(faixas);
  if (!fs.length || !(distancia >= 0)) return null;
  const d = Math.round(distancia * 100) / 100;
  const faixa = fs.find(f => d <= f.ateKm);
  const ultima = fs[fs.length - 1];
  const valor = faixa ? faixa.valor : ultima.valor + (d - ultima.ateKm) * (num(kmAdicional) || 0);
  return Math.max(valor, num(minimo) || 0);
}

function EditorFaixas({ valores, onChange, desabilitado, rotuloSimular = "Simular entrega de", rotuloValor = "Valor (R$)" }) {
  const [simular, setSimular] = useState("");
  const faixas = valores.faixas || [];
  const set = lista => onChange({ ...valores, faixas: lista });
  const alterar = (i, campo) => e => set(faixas.map((f, j) => (j === i ? { ...f, [campo]: e.target.value } : f)));
  const ordenadas = faixasValidas(faixas);
  const foraDeOrdem = faixas.some((f, i) => i > 0 && num(f.ateKm) > 0 && num(faixas[i - 1].ateKm) >= num(f.ateKm));
  const ultima = ordenadas[ordenadas.length - 1];
  const resultado = simular !== "" ? valorPorFaixas(num(simular), faixas, valores.kmAdicional, valores.valorMinimo) : null;

  return (
    <div className="faixas-km">
      <div className="faixas-topo">
        <strong>Faixas de km</strong>
        <span className="apagado">Cada faixa vale da faixa anterior até o km informado.</span>
      </div>
      <table className="tabela tabela-compacta">
        <thead><tr><th>De</th><th>Até (km)</th><th>{rotuloValor}</th><th /></tr></thead>
        <tbody>
          {faixas.map((f, i) => (
            <tr key={i}>
              <td className="apagado">{i === 0 ? "0 km" : num(faixas[i - 1].ateKm) > 0 ? `acima de ${km(num(faixas[i - 1].ateKm))}` : "—"}</td>
              <td><input type="number" min="0.1" step="0.1" value={f.ateKm} onChange={alterar(i, "ateKm")} disabled={desabilitado} aria-label={`Faixa ${i + 1}: até quantos km`} required /></td>
              <td><input type="number" min="0" step="0.01" value={f.valor} onChange={alterar(i, "valor")} disabled={desabilitado} aria-label={`Faixa ${i + 1}: valor`} required /></td>
              <td>{!desabilitado && faixas.length > 1 && <Botao pequeno variante="fantasma" onClick={() => set(faixas.filter((_, j) => j !== i))} aria-label={`Remover faixa ${i + 1}`}>Remover</Botao>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!desabilitado && (
        <Botao pequeno onClick={() => set([...faixas, { ateKm: ultima ? ultima.ateKm + 2 : "", valor: "" }])}>+ Adicionar faixa</Botao>
      )}
      {foraDeOrdem && <p className="aviso-texto">As faixas serão salvas em ordem crescente de km.</p>}
      {ultima && (
        <p className="apagado">
          Acima de {km(ultima.ateKm)}: {moeda(ultima.valor)}
          {num(valores.kmAdicional) > 0 ? ` + ${moeda(num(valores.kmAdicional))} por km excedente` : " (preencha o “valor por km acima da última faixa” para cobrar o excedente)"}.
        </p>
      )}
      <div className="faixas-simular">
        <label>{rotuloSimular} <input type="number" min="0" step="0.1" value={simular} onChange={e => setSimular(e.target.value)} placeholder="km" aria-label="Distância para simular" /> km</label>
        {resultado != null && <strong>= {moeda(resultado)}</strong>}
      </div>
    </div>
  );
}

function resumoTabelaKm(r) {
  if (r.tipoCalculo === "FIXO") return `Fixo ${moeda(r.valorMinimo)}`;
  if (r.tipoCalculo === "FAIXAS") {
    const fs = faixasValidas(r.faixas || []);
    const txt = fs.slice(0, 3).map(f => `até ${km(f.ateKm)} ${moeda(f.valor)}`).join(" · ");
    return fs.length > 3 ? `${txt} · +${fs.length - 3} faixa(s)` : txt;
  }
  return `mín. ${moeda(r.valorMinimo)} + ${moeda(r.kmAdicional)}/km`;
}

// Adicional do entregador nas entregas com retorno à loja (Tabela de comissões).
const TIPO_RETORNO_COMISSAO = {
  REPASSE_LOJA: "Repassar o acréscimo cobrado da loja",
  PORCENTAGEM: "Porcentagem sobre a comissão",
  VALOR_FIXO: "Valor fixo por entrega",
  SEM_ADICIONAL: "Sem adicional",
};
const DICA_RETORNO = {
  REPASSE_LOJA: "O entregador recebe o acréscimo que a loja paga no retorno (Configurações › Acréscimo da entrega com retorno, padrão 20%).",
  PORCENTAGEM: "Ex.: 20 = o entregador ganha 20% a mais sobre a comissão da entrega quando ela tem retorno.",
  VALOR_FIXO: "Ex.: 3,00 = o entregador ganha R$ 3,00 a mais em cada entrega com retorno.",
  SEM_ADICIONAL: "O entregador recebe só a comissão normal, mesmo com retorno.",
};
function resumoRetorno(r) {
  const t = r.tipoRetorno || "REPASSE_LOJA";
  if (t === "PORCENTAGEM") return `+${String(r.valorRetorno ?? 0).replace(".", ",")}% da comissão`;
  if (t === "VALOR_FIXO") return `+${moeda(r.valorRetorno)}`;
  if (t === "SEM_ADICIONAL") return "Sem adicional";
  return "Acréscimo da loja";
}

const TIPO_PROMOCAO ={ DESCONTO_PERCENTUAL: "Desconto percentual", CUPOM_FIXO: "Cupom de valor fixo", FRETE_GRATIS: "Frete grátis" };

// Cada cadastro simples é descrito aqui: rota na API, campos do formulário e colunas da tabela.
// `area` define quem pode editar (ver ESCRITA_POR_PERMISSAO em auth.jsx).
const CADASTROS = [
  {
    chave: "tabela-preco-km", titulo: "Tabela de preço por KM", area: "precificacao",
    descricao: "Cadastre vários km e valores (faixas). Usada no cálculo automático quando vinculada a um comércio (Cadastros › Comércio › aba Preços); tem prioridade sobre a precificação padrão. O km é a distância da rota (Google Maps, quando configurado).",
    rotuloItem: "tabela de preço",
    modalLargo: true,
    padrao: { tipoCalculo: "FAIXAS", tipoRetorno: "PORCENTAGEM" },
    campos: [
      { nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true, placeholder: "Ex.: Tabela Centro, Tabela Moto" },
      { nome: "tipoCalculo", rotulo: "Cálculo", tipo: "select", obrigatorio: true, largo: true, opcoes: opcoes(TIPO_CALCULO_KM) },
      { nome: "valorMinimo", tipo: "number", rotulo: v => (v.tipoCalculo === "FIXO" ? "Valor fixo (R$)" : "Valor mínimo (R$)") },
      {
        nome: "kmAdicional", tipo: "number", mostrar: v => v.tipoCalculo !== "FIXO",
        rotulo: v => (v.tipoCalculo === "FAIXAS" ? "Valor por km acima da última faixa (R$)" : "Valor por km (R$)"),
      },
      { nome: "valorPorPonto", rotulo: "Valor por ponto (R$)", tipo: "number" },
      { nome: "valorMultiplo", rotulo: "Valor múltiplo (R$)", tipo: "number" },
      { nome: "tipoRetorno", rotulo: "Tipo de retorno", tipo: "select", obrigatorio: true, opcoes: opcoes({ PORCENTAGEM: "Porcentagem", VALOR_FIXO: "Valor fixo" }) },
      { nome: "retorno", rotulo: "Retorno", tipo: "number" },
    ],
    // Faixas ficam fora da grade de campos: editor próprio, visível no cálculo "Por faixas de km".
    Extra: ({ valores, onChange }) => (valores.tipoCalculo === "FAIXAS" ? <EditorFaixas valores={valores} onChange={onChange} /> : null),
    valoresExtras: r => ({ faixas: r.faixas?.length ? r.faixas.map(f => ({ ateKm: f.ateKm, valor: f.valor })) : [{ ateKm: "", valor: "" }] }),
    corpoExtra: v => (v.tipoCalculo === "FAIXAS" ? { faixas: (v.faixas || []).filter(f => f.ateKm !== "" || f.valor !== "") } : {}),
    colunas: [
      { rotulo: "Nome", valor: r => <strong>{r.nome}</strong> },
      { rotulo: "Cálculo", valor: r => (r.tipoCalculo === "FAIXAS" ? `Faixas (${(r.faixas || []).length})` : TIPO_CALCULO_KM[r.tipoCalculo]) },
      { rotulo: "Valores", valor: resumoTabelaKm },
      { rotulo: "Acima / por km", valor: r => (r.tipoCalculo === "FIXO" ? "—" : moeda(r.kmAdicional)), num: true },
    ],
  },
  {
    chave: "tabela-comissoes", titulo: "Tabela de comissões", area: "precificacao",
    descricao: "Quanto o entregador ganha por entrega: cadastre vários km e valores (faixas) ou um percentual do valor da entrega. Vincule a tabela ao comércio no cadastro dele; comércio sem tabela vinculada usa a primeira tabela da categoria do veículo do entregador (tabela padrão). O km é o da rota da entrega.",
    rotuloItem: "tabela de comissão",
    modalLargo: true,
    padrao: { tipoCalculo: "FAIXAS", categoria: "MOTO", tipoRetorno: "REPASSE_LOJA" },
    campos: [
      { nome: "nome", rotulo: "Nome", largo: true, placeholder: "Ex.: Comissão Moto Centro" },
      { nome: "categoria", rotulo: "Categoria (veículo)", tipo: "select", obrigatorio: true, opcoes: opcoes(VEICULOS) },
      { nome: "tipoCalculo", rotulo: "Cálculo", tipo: "select", obrigatorio: true, opcoes: opcoes(TIPO_CALCULO_COMISSAO) },
      { nome: "percentual", rotulo: "Percentual do valor da entrega (%)", tipo: "number", obrigatorio: true, mostrar: v => v.tipoCalculo === "PERCENTUAL" },
      { nome: "valorMinimo", rotulo: "Comissão mínima (R$)", tipo: "number" },
      { nome: "kmAdicional", rotulo: "Valor por km acima da última faixa (R$)", tipo: "number", mostrar: v => v.tipoCalculo === "FAIXAS" },
      {
        nome: "tipoRetorno", rotulo: "Tipo de retorno", tipo: "select", obrigatorio: true, opcoes: opcoes(TIPO_RETORNO_COMISSAO),
        dica: v => DICA_RETORNO[v.tipoRetorno || "REPASSE_LOJA"],
      },
      {
        nome: "valorRetorno", tipo: "number", obrigatorio: true, mostrar: v => ["PORCENTAGEM", "VALOR_FIXO"].includes(v.tipoRetorno),
        rotulo: v => (v.tipoRetorno === "PORCENTAGEM" ? "Valor do retorno (% da comissão)" : "Valor do retorno (R$ por entrega)"),
      },
    ],
    Extra: ({ valores, onChange }) => (valores.tipoCalculo === "FAIXAS"
      ? <EditorFaixas valores={valores} onChange={onChange} rotuloValor="Comissão (R$)" rotuloSimular="Simular comissão numa entrega de" />
      : null),
    valoresExtras: r => ({ faixas: r.faixas?.length ? r.faixas.map(f => ({ ateKm: f.ateKm, valor: f.valor })) : [{ ateKm: "", valor: "" }] }),
    corpoExtra: v => (v.tipoCalculo === "FAIXAS" ? { faixas: (v.faixas || []).filter(f => f.ateKm !== "" || f.valor !== "") } : {}),
    colunas: [
      { rotulo: "Tabela", valor: r => <><strong>{r.nome || VEICULOS[r.categoria]}</strong>{r.nome && <div className="celula-sub">{VEICULOS[r.categoria]}</div>}</> },
      { rotulo: "Cálculo", valor: r => (r.tipoCalculo === "FAIXAS" ? `Faixas (${(r.faixas || []).length})` : "Percentual") },
      { rotulo: "Comissão", valor: r => (r.tipoCalculo === "FAIXAS" ? resumoTabelaKm(r) : `${String(r.percentual ?? 0).replace(".", ",")}% do valor`) },
      { rotulo: "Mínimo", valor: r => moeda(r.valorMinimo), num: true },
      { rotulo: "Retorno", valor: resumoRetorno },
    ],
  },
  {
    chave: "preco-dinamico-demanda", titulo: "Preço dinâmico (demanda)", area: "precificacao",
    descricao: "Regras que aumentam o valor cobrado da loja em cada entrega. Ativa, entra na hora no cálculo das entregas lançadas pelo ADM e pela loja (multiplicadores sobre a taxa; valores fixos somados). Use a chave da coluna Situação para ligar e desligar.",
    ...regraPrecoDinamico("MULTIPLICADOR"),
  },
  {
    chave: "preco-dinamico-entregador", titulo: "Preço dinâmico entregador", area: "precificacao",
    descricao: "Regras que aumentam o ganho do entregador em cada entrega. Ativa, vale na hora: entra nas entregas abertas e nas novas, aparece no app (oferta e carteira, separado do ganho) e no acerto. Desativada, os pedidos já lançados mantêm o valor — só os próximos saem sem. Ligar ou desligar mostra um aviso no app de todos os entregadores. Use a chave da coluna Situação.",
    ...regraPrecoDinamico("VALOR_FIXO"),
  },
  {
    chave: "servicos-opcionais", titulo: "Serviços opcionais", area: "precificacao",
    descricao: "Serviços extras que podem ser cobrados na entrega. Cadastro de referência — ainda não são somados automaticamente.",
    campos: [
      { nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true },
      { nome: "valor", rotulo: "Valor (R$)", tipo: "number", obrigatorio: true },
      { nome: "ativo", rotulo: "Ativo", tipo: "checkbox" },
    ],
    padrao: { ativo: true },
    colunas: [
      { rotulo: "Serviço", valor: r => r.nome },
      { rotulo: "Valor", valor: r => moeda(r.valor), num: true },
      { rotulo: "Situação", valor: r => (r.ativo ? <Badge tom="ok">Ativo</Badge> : <Badge tom="apagado">Inativo</Badge>) },
    ],
  },
  {
    chave: "promocoes", titulo: "Promoção", area: "precificacao",
    descricao: "Cadastro de referência — as promoções ainda não são aplicadas automaticamente no valor das entregas.",
    campos: [
      { nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true },
      { nome: "tipo", rotulo: "Tipo", tipo: "select", obrigatorio: true, opcoes: opcoes(TIPO_PROMOCAO) },
      { nome: "valor", rotulo: "Valor / código", placeholder: "10% ou PROMO10" },
      { nome: "validade", rotulo: "Validade", tipo: "date" },
      { nome: "ativo", rotulo: "Ativa", tipo: "checkbox" },
    ],
    padrao: { ativo: true },
    colunas: [
      { rotulo: "Promoção", valor: r => r.nome },
      { rotulo: "Tipo", valor: r => TIPO_PROMOCAO[r.tipo] },
      { rotulo: "Validade", valor: r => data(r.validade) },
      { rotulo: "Situação", valor: r => (r.ativo ? <Badge tom="ok">Ativa</Badge> : <Badge tom="apagado">Inativa</Badge>) },
    ],
  },
  {
    chave: "modais", titulo: "Modais", area: "estrutura",
    descricao: "Tipos de veículo usados na operação, com capacidade e taxa base.",
    campos: [
      { nome: "nome", rotulo: "Veículo", tipo: "select", obrigatorio: true, opcoes: opcoes(VEICULOS) },
      { nome: "capacidadeCargaKg", rotulo: "Capacidade (kg)", tipo: "number" },
      { nome: "taxaBase", rotulo: "Taxa base (R$)", tipo: "number" },
    ],
    colunas: [
      { rotulo: "Veículo", valor: r => VEICULOS[r.nome] },
      { rotulo: "Capacidade", valor: r => (r.capacidadeCargaKg != null ? `${r.capacidadeCargaKg} kg` : "—"), num: true },
      { rotulo: "Taxa base", valor: r => moeda(r.taxaBase), num: true },
    ],
  },
  {
    chave: "grupos-operacionais", titulo: "Grupos operacionais", area: "estrutura",
    descricao: "Equipes de entregadores por região, com responsável e capacidade.",
    campos: [
      { nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true },
      { nome: "regiao", rotulo: "Região" },
      { nome: "responsavel", rotulo: "Responsável" },
      { nome: "capacidade", rotulo: "Capacidade (entregadores)", tipo: "number", passo: "1" },
    ],
    colunas: [
      { rotulo: "Grupo", valor: r => r.nome },
      { rotulo: "Região", valor: r => r.regiao || "—" },
      { rotulo: "Responsável", valor: r => r.responsavel || "—" },
      { rotulo: "Capacidade", valor: r => r.capacidade ?? "—", num: true },
    ],
  },
  {
    chave: "franquias", titulo: "Franquias", area: "estrutura",
    campos: [{ nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true }],
    colunas: [{ rotulo: "Franquia", valor: r => r.nome }],
  },
  {
    chave: "hubs", titulo: "Hubs", area: "estrutura",
    campos: [{ nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true }],
    colunas: [{ rotulo: "Hub", valor: r => r.nome }],
  },
];

const SINGLETONS = [
  {
    chave: "precificacao-padrao", titulo: "Precificação padrão",
    descricao: "Valor da entrega = taxa base + (taxa por km × km de percurso), respeitando o valor mínimo.",
    campos: [
      { nome: "taxaBase", rotulo: "Taxa base (R$)", tipo: "number", obrigatorio: true },
      { nome: "taxaPorKm", rotulo: "Taxa por km (R$)", tipo: "number", obrigatorio: true },
      { nome: "valorMinimo", rotulo: "Valor mínimo (R$)", tipo: "number", obrigatorio: true },
      { nome: "taxaServico", rotulo: "Taxa de serviço (%)", tipo: "number", obrigatorio: true },
    ],
  },
  {
    chave: "preco-espera", titulo: "Preço por espera",
    descricao: "Cobrança quando o entregador espera no comércio além da tolerância. Cadastro de referência — ainda não é somado automaticamente às entregas.",
    campos: [
      { nome: "tolerancia", rotulo: "Tolerância (min)", tipo: "number", passo: "1", obrigatorio: true },
      { nome: "valorMinuto", rotulo: "Valor por minuto (R$)", tipo: "number", obrigatorio: true },
      { nome: "limiteMaximo", rotulo: "Limite máximo (min)", tipo: "number", passo: "1", obrigatorio: true },
    ],
  },
];

function valoresDoRegistro(campos, r = {}, padrao = {}) {
  const v = { ...padrao };
  campos.forEach(c => {
    if (r[c.nome] !== undefined && r[c.nome] !== null) v[c.nome] = c.tipo === "date" ? paraInputData(r[c.nome]) : r[c.nome];
    else if (v[c.nome] === undefined) v[c.nome] = c.tipo === "select" && c.obrigatorio ? c.opcoes[0].valor : "";
  });
  return v;
}

// Título e descrição ficam no cabeçalho da página (PaginaCadastro).
function Singleton({ def, pode }) {
  const { dados, erro, setDados } = useApi(`/cadastro/${def.chave}`);
  const [v, setV] = useState(null);
  const { executar, ocupado } = useAcao();
  const valores = v || (dados ? valoresDoRegistro(def.campos, dados) : null);

  async function salvar(e) {
    e.preventDefault();
    const r = await executar(() => api.put(`/cadastro/${def.chave}`, prepararValores(def.campos, valores)), `${def.titulo} salva.`);
    if (r) { setDados(r); setV(null); }
  }

  return (
    <section className="cartao form-pagina">
      <ErroCaixa erro={erro} />
      {!valores ? <Carregando /> : (
        <form onSubmit={salvar}>
          <GradeCampos defs={def.campos} valores={valores} onChange={setV} desabilitado={!pode} />
          {pode && v && (
            <div className="form-rodape">
              <Botao variante="fantasma" onClick={() => setV(null)}>Descartar</Botao>
              <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar</button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

function ListaCadastro({ def, pode }) {
  const { dados, erro, recarregar } = useApi(`/cadastro/${def.chave}`);
  const [editando, setEditando] = useState(null); // null | { registro?, valores }
  const { executar, ocupado } = useAcao();

  // Campos extras fora da grade (ex.: faixas da tabela de km) entram por valoresExtras/corpoExtra.
  const valoresPara = (r = {}) => ({ ...valoresDoRegistro(def.campos, r, r.id ? {} : def.padrao), ...(def.valoresExtras?.(r) || {}) });
  const camposVisiveis = valores => def.campos.filter(c => !c.mostrar || c.mostrar(valores));

  async function salvar(e) {
    e.preventDefault();
    const corpo = { ...prepararValores(def.campos, editando.valores), ...(def.corpoExtra?.(editando.valores) || {}) };
    const id = editando.registro?.id;
    const r = await executar(
      () => (id ? api.put(`/cadastro/${def.chave}/${id}`, corpo) : api.post(`/cadastro/${def.chave}`, corpo)),
      id ? "Registro atualizado." : "Registro criado."
    );
    if (r) { setEditando(null); recarregar({ silencioso: true }); }
  }

  async function excluir(id) {
    if (await executar(() => api.del(`/cadastro/${def.chave}/${id}`), "Registro excluído.")) {
      setEditando(null);
      recarregar({ silencioso: true });
    }
  }

  // Liga/desliga direto na lista (ex.: preço dinâmico), sem abrir a edição.
  async function alternarAtivo(r, ativo) {
    if (await executar(() => api.patch(`/cadastro/${def.chave}/${r.id}/ativo`, { ativo }), `${r.nome}: regra ${ativo ? "ativada — já vale para as próximas entregas" : "desativada"}.`)) {
      recarregar({ silencioso: true });
    }
  }
  const ctx = { pode, ocupado, alternarAtivo };

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <span className="apagado">{dados ? `${dados.length} registro(s)` : ""}</span>
        {pode && (
          <Botao pequeno variante="primario" onClick={() => setEditando({ valores: valoresPara() })}>
            + Adicionar
          </Botao>
        )}
      </div>
      <ErroCaixa erro={erro} />
      {!dados ? <Carregando /> : dados.length === 0 ? <Vazio titulo="Nenhum registro" /> : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>{def.colunas.map(c => <th key={c.rotulo} className={c.num ? "num" : ""}>{c.rotulo}</th>)}{pode && <th />}</tr>
            </thead>
            <tbody>
              {dados.map(r => (
                <tr key={r.id}>
                  {def.colunas.map(c => <td key={c.rotulo} className={c.num ? "num" : ""}>{c.valor(r, ctx)}</td>)}
                  {pode && (
                    <td className="acoes-celula">
                      <Botao pequeno variante="fantasma" onClick={() => setEditando({ registro: r, valores: valoresPara(r) })}>Editar</Botao>
                      {!def.excluirNoModal && (
                        <BotaoConfirmar pequeno confirmar="Excluir?" onConfirm={() => excluir(r.id)}>Excluir</BotaoConfirmar>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editando && (
        <Modal
          titulo={def.rotuloItem
            ? `${editando.registro ? "Editar" : "Nova"} ${def.rotuloItem}`
            : `${editando.registro ? "Editar" : "Adicionar"} · ${def.titulo}`}
          onFechar={() => setEditando(null)}
          largo={def.modalLargo}
        >
          <form onSubmit={salvar}>
            <GradeCampos defs={camposVisiveis(editando.valores)} valores={editando.valores} onChange={valores => setEditando({ ...editando, valores })} />
            {def.Extra && <def.Extra valores={editando.valores} onChange={valores => setEditando({ ...editando, valores })} />}
            <div className="form-rodape">
              {def.excluirNoModal && editando.registro && (
                <span className="rodape-esquerda">
                  <BotaoConfirmar confirmar="Excluir esta regra?" disabled={ocupado} onConfirm={() => excluir(editando.registro.id)}>Excluir</BotaoConfirmar>
                </span>
              )}
              <Botao variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Botao>
              <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

// Uma página por cadastro (item do submenu Cadastros), identificada pela chave da API.
export function PaginaCadastro({ chave }) {
  const { podeEditar } = useAuth();
  const singleton = SINGLETONS.find(s => s.chave === chave);
  const def = singleton || CADASTROS.find(c => c.chave === chave);
  if (!def) return <Vazio titulo="Cadastro não encontrado" />;
  const pode = podeEditar(singleton ? "precificacao" : def.area);

  return (
    <>
      <Cabecalho titulo={def.titulo} subtitulo={def.descricao} />
      {singleton
        ? <Singleton key={chave} def={def} pode={pode} />
        : <ListaCadastro key={chave} def={def} pode={pode} />}
    </>
  );
}
