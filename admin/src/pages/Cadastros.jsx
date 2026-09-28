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
      { rotulo: "Situação", valor: r => (r.ativo ? <Badge tom="ok">● Ativa</Badge> : <Badge tom="apagado">Inativa</Badge>) },
    ],
  };
}

const TIPO_PROMOCAO = { DESCONTO_PERCENTUAL: "Desconto percentual", CUPOM_FIXO: "Cupom de valor fixo", FRETE_GRATIS: "Frete grátis" };

// Cada cadastro simples é descrito aqui: rota na API, campos do formulário e colunas da tabela.
// `area` define quem pode editar (ver ESCRITA_POR_PERMISSAO em auth.jsx).
const CADASTROS = [
  {
    chave: "tabela-preco-km", titulo: "Tabela de preço por KM", area: "precificacao",
    descricao: "Usada no cálculo automático quando vinculada a um comércio (Cadastros › Comércio › aba Preços); tem prioridade sobre a precificação padrão.",
    campos: [
      { nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true },
      { nome: "tipoCalculo", rotulo: "Cálculo", tipo: "select", obrigatorio: true, opcoes: opcoes({ DESLOCAMENTO: "Por deslocamento (km)", FIXO: "Valor fixo" }) },
      { nome: "valorMinimo", rotulo: "Valor mínimo (R$)", tipo: "number" },
      { nome: "kmAdicional", rotulo: "Valor por km (R$)", tipo: "number" },
      { nome: "valorPorPonto", rotulo: "Valor por ponto (R$)", tipo: "number" },
      { nome: "valorMultiplo", rotulo: "Valor múltiplo (R$)", tipo: "number" },
      { nome: "tipoRetorno", rotulo: "Tipo de retorno", tipo: "select", obrigatorio: true, opcoes: opcoes({ PORCENTAGEM: "Porcentagem", VALOR_FIXO: "Valor fixo" }) },
      { nome: "retorno", rotulo: "Retorno", tipo: "number" },
    ],
    colunas: [
      { rotulo: "Nome", valor: r => r.nome },
      { rotulo: "Cálculo", valor: r => (r.tipoCalculo === "FIXO" ? "Fixo" : "Deslocamento") },
      { rotulo: "Mínimo", valor: r => moeda(r.valorMinimo), num: true },
      { rotulo: "Por km", valor: r => moeda(r.kmAdicional), num: true },
    ],
  },
  {
    chave: "tabela-comissoes", titulo: "Tabela de comissões", area: "precificacao",
    descricao: "Percentual de comissão por categoria de veículo, vinculado ao comércio no cadastro dele.",
    campos: [
      { nome: "categoria", rotulo: "Categoria", tipo: "select", obrigatorio: true, opcoes: opcoes(VEICULOS) },
      { nome: "percentual", rotulo: "Percentual (%)", tipo: "number", obrigatorio: true },
      { nome: "valorMinimo", rotulo: "Valor mínimo (R$)", tipo: "number" },
    ],
    colunas: [
      { rotulo: "Categoria", valor: r => VEICULOS[r.categoria] },
      { rotulo: "Percentual", valor: r => `${r.percentual}%`, num: true },
      { rotulo: "Mínimo", valor: r => moeda(r.valorMinimo), num: true },
    ],
  },
  {
    chave: "preco-dinamico-demanda", titulo: "Preço dinâmico (demanda)", area: "precificacao",
    descricao: "Regras que aumentam o valor cobrado da entrega. Cadastro de referência — ainda não é aplicado automaticamente no cálculo das entregas.",
    ...regraPrecoDinamico("MULTIPLICADOR"),
  },
  {
    chave: "preco-dinamico-entregador", titulo: "Preço dinâmico entregador", area: "precificacao",
    descricao: "Regras que aumentam o ganho do entregador. Cadastro de referência — ainda não é aplicado automaticamente aos repasses.",
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

  async function salvar(e) {
    e.preventDefault();
    const corpo = prepararValores(def.campos, editando.valores);
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

  return (
    <section className="cartao">
      <div className="cartao-topo">
        <span className="apagado">{dados ? `${dados.length} registro(s)` : ""}</span>
        {pode && (
          <Botao pequeno variante="primario" onClick={() => setEditando({ valores: valoresDoRegistro(def.campos, {}, def.padrao) })}>
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
                  {def.colunas.map(c => <td key={c.rotulo} className={c.num ? "num" : ""}>{c.valor(r)}</td>)}
                  {pode && (
                    <td className="acoes-celula">
                      <Botao pequeno variante="fantasma" onClick={() => setEditando({ registro: r, valores: valoresDoRegistro(def.campos, r) })}>Editar</Botao>
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
        >
          <form onSubmit={salvar}>
            <GradeCampos defs={def.campos} valores={editando.valores} onChange={valores => setEditando({ ...editando, valores })} />
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
