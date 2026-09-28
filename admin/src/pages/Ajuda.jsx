import { Link } from "react-router-dom";
import { Cabecalho } from "../components/ui";
import { PERMISSOES } from "../utils/format";

const SECOES = [
  { para: "/operacao", titulo: "Operação", texto: "Pedidos • Acompanhamento: entregadores online no mapa, resumo de entregas e alocação, atribuição em lote, filtros por cidade, comércio, status, origem e período, e a lista de pedidos com as ações de cada um." },
  { para: "/relatorios", titulo: "Relatórios", texto: "Desempenho por período (7, 30 ou 90 dias): volume diário, taxas de entrega e cancelamento, receita e rankings de comerciantes e entregadores." },
  { para: "/cadastros", titulo: "Cadastros", texto: "Submenu com: Comércio (sistema do comerciante), Contas gerenciais (acesso a este painel), Entregadores (app do entregador), Grupos operacionais, Modais e as regras de preço — precificação padrão, tabela de preço por KM, comissões, espera, preço dinâmico, serviços opcionais e promoção." },
  { para: "/mensagens", titulo: "Mensagens", texto: "Conversas com clientes e com entregadores." },
  { para: "/financeiro", titulo: "Financeiro", texto: "Receita das entregas, faturas cobradas dos comerciantes e repasse estimado aos entregadores." },
  { para: "/nova-entrega", titulo: "Nova Entrega", texto: "Cria uma entrega em nome de um comerciante, com cálculo de distância pelo percurso real." },
  { para: "/configuracoes", titulo: "Configurações", texto: "Regras gerais, como o raio máximo em que o app mostra pedidos para o entregador." },
];

const FLUXO = [
  ["Em preparo", "O comerciante (ou o painel) criou o pedido. Ainda não aparece para os entregadores."],
  ["Pronto", "O comerciante marcou como pronto. O pedido aparece no app dos entregadores online e próximos, aguardando um deles aceitar."],
  ["Em rota", "Um entregador aceitou. Só um consegue aceitar o mesmo pedido."],
  ["Entregue", "O entregador (ou o painel) finalizou a entrega."],
];

const PERGUNTAS = [
  ["Como aprovo um entregador que se cadastrou pelo app?", "Cadastros › Entregadores › card “Em análise” › abra o entregador › Aprovar. Só entregadores ativos ficam online e recebem pedidos."],
  ["Como libero o acesso de um entregador ao app?", "Abra o entregador, confira se ele tem e-mail cadastrado e, em “Acesso ao app do entregador”, defina uma senha."],
  ["Como dou acesso ao sistema do comerciante?", "Cadastros › Comércio › abra o comércio › aba “Acesso ao sistema” › crie um usuário com e-mail e senha."],
  ["O que acontece quando bloqueio alguém?", "Entregador ou comerciante bloqueado perde o acesso na hora, mesmo se já estiver logado. Entregador bloqueado também fica offline."],
  ["Por que um comércio não calcula o valor da entrega?", "O endereço principal do comércio precisa estar localizado (com coordenadas). Em Cadastros › Comércio › Endereços use “Localizar”."],
  ["Um pedido está parado sem entregador. O que faço?", "Em Operação, o card “Alocação” mostra quantos pedidos estão sem entregador. Use o botão laranja “Atribuir”: com pedidos marcados na tabela ele atribui só esses; sem seleção, atribui todos os prontos sem entregador."],
  ["Como filtro os pedidos de outro dia?", "Em Operação, mude as duas datas (de/até). Os contadores por status acompanham os filtros; clique em um contador para listar só aquele status."],
];

const DESCRICAO_PERMISSAO = {
  TOTAL: "Tudo, inclusive contas do painel e configurações.",
  OPERACIONAL: "Pedidos, nova entrega, entregadores, comerciantes e mensagens.",
  FINANCEIRO: "Faturas, repasses e regras de preço.",
  LEITURA: "Visualiza tudo, não altera nada.",
};

export default function Ajuda() {
  return (
    <>
      <Cabecalho titulo="Ajuda" subtitulo="Guia rápido do painel administrativo Route Delivery" />

      <section className="cartao">
        <div className="cartao-topo"><h2>O que tem em cada item do menu</h2></div>
        <ul className="lista-ajuda">
          {SECOES.map(s => (
            <li key={s.para}>
              <Link to={s.para} className="link">{s.titulo}</Link>
              <span>{s.texto}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grade-2">
        <section className="cartao">
          <div className="cartao-topo"><h2>Caminho de um pedido</h2></div>
          <ol className="linha-tempo">
            {FLUXO.map(([etapa, texto]) => (
              <li key={etapa}><strong>{etapa}</strong><small>{texto}</small></li>
            ))}
          </ol>
          <p className="apagado">Em qualquer etapa antes da entrega o pedido pode ser cancelado. O comerciante só cancela antes de um entregador aceitar.</p>
        </section>

        <section className="cartao">
          <div className="cartao-topo"><h2>Permissões das contas do painel</h2></div>
          <dl className="detalhes">
            {Object.entries(PERMISSOES).map(([k, rotulo]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{rotulo}</dt><dd>{DESCRICAO_PERMISSAO[k]}</dd>
              </div>
            ))}
          </dl>
          <p className="apagado">As contas são gerenciadas em Cadastros › Contas gerenciais.</p>
        </section>
      </div>

      <section className="cartao">
        <div className="cartao-topo"><h2>Perguntas frequentes</h2></div>
        <div className="faq">
          {PERGUNTAS.map(([p, r]) => (
            <details key={p}>
              <summary>{p}</summary>
              <p>{r}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
