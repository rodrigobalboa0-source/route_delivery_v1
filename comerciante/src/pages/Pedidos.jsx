import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, qs } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { Abas, BadgeMapa, Botao, Cabecalho, Carregando, ErroCaixa, Vazio, useAcao, useToast } from "../components/ui";
import DetalhePedido from "../components/DetalhePedido";
import { STATUS_PEDIDO, dataHora, moeda, paraInputData } from "../utils/format";

const VISOES = {
  todos: { rotulo: "Todos", status: "" },
  entregues: { rotulo: "Entregues", status: "ENTREGUE" },
  cancelados: { rotulo: "Cancelados", status: "CANCELADO" },
};

const dataBR = t => (t ? t.split("-").reverse().join("/") : "");

// Excel e PDF (com a logo) do que está na tela: período, aba e busca aplicados.
function specEntregas(lista, { desde, ate, ver, busca, loja }) {
  const entregues = lista.filter(p => p.status === "ENTREGUE");
  const valor = entregues.reduce((s, p) => s + (p.valor || 0), 0);
  const kmTotal = entregues.reduce((s, p) => s + (p.distanciaKm || 0), 0);
  return {
    arquivo: `entregas-${desde}-a-${ate}`,
    aba: "Entregas",
    titulo: "Relatório de entregas",
    subtitulo: [loja, `Período: ${dataBR(desde)} a ${dataBR(ate)}`, ver !== "todos" && VISOES[ver].rotulo, busca && `Busca: ${busca}`].filter(Boolean).join(" · "),
    resumo: [
      ["Entregas", lista.length.toLocaleString("pt-BR")],
      ["Entregues", entregues.length.toLocaleString("pt-BR")],
      ["Canceladas", lista.filter(p => p.status === "CANCELADO").length.toLocaleString("pt-BR")],
      ["Valor das entregues", moeda(valor)],
    ],
    colunas: [
      { titulo: "Criado", valor: p => p.createdAt, tipo: "data", largura: 17, larguraPdf: 24 },
      { titulo: "Pedido", valor: p => [p.codigo, p.codigoExterno].filter(Boolean).join(" · "), largura: 16, larguraPdf: 22 },
      { titulo: "Status", valor: p => STATUS_PEDIDO[p.status]?.rotulo || p.status, largura: 16, larguraPdf: 22 },
      { titulo: "Cliente", valor: p => p.clienteNome, largura: 22 },
      { titulo: "Endereço", valor: p => [p.endereco, p.complemento].filter(Boolean).join(" · "), largura: 40, larguraPdf: 60 },
      { titulo: "Retorno", valor: p => (p.retorno ? "Sim" : "Não"), largura: 9, larguraPdf: 16 },
      { titulo: "Entregador", valor: p => p.entregador?.nomeCompleto, largura: 22 },
      { titulo: "Km", valor: p => p.distanciaKm, tipo: "km", largura: 11, larguraPdf: 16 },
      { titulo: "Valor", valor: p => p.valor, tipo: "moeda", largura: 13, larguraPdf: 20 },
    ],
    linhas: lista,
    totais: { 1: `${lista.length} entrega(s)`, 7: kmTotal, 8: valor },
  };
}

function Baixar({ gerar, desabilitado }) {
  const [gerando, setGerando] = useState(null);
  const avisar = useToast();
  async function baixar(formato) {
    setGerando(formato);
    try {
      const { exportarExcel, exportarPdf } = await import("../utils/exportar");
      await (formato === "excel" ? exportarExcel : exportarPdf)(gerar());
    } catch (e) {
      avisar(`Não foi possível gerar o arquivo: ${e.message}`, "erro");
    } finally {
      setGerando(null);
    }
  }
  return (
    <div className="botoes baixar-grupo" role="group" aria-label="Baixar relatório">
      <Botao pequeno disabled={desabilitado || !!gerando} onClick={() => baixar("pdf")}>{gerando === "pdf" ? "Gerando…" : "⬇ Baixar PDF"}</Botao>
      <Botao pequeno disabled={desabilitado || !!gerando} onClick={() => baixar("excel")}>{gerando === "excel" ? "Gerando…" : "⬇ Baixar Excel"}</Botao>
    </div>
  );
}

// Lista de entregas com filtros. "fixo" = filtro sempre aplicado.
export default function Pedidos({
  titulo = "Entregas",
  subtitulo = "Todas as entregas da sua loja. A lista se atualiza sozinha.",
  fixo = {},
  diasPadrao = 0, // período inicial: hoje (0) ou os últimos N dias
}) {
  const { loja } = useAuth();
  const [params, setParams] = useSearchParams();
  const hoje = paraInputData(new Date());
  const [ver, setVer] = useState(VISOES[params.get("ver")] ? params.get("ver") : "todos");
  const [desde, setDesde] = useState(() => paraInputData(new Date(Date.now() - diasPadrao * 864e5)));
  const [ate, setAte] = useState(hoje);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [aberto, setAberto] = useState(params.get("abrir"));
  const { executar, ocupado } = useAcao();

  // Busca digitada: aplica depois de uma pausa curta.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 350);
    return () => clearTimeout(t);
  }, [busca]);

  // Em aberto aparece sempre, mesmo que tenha sido criado antes do período.
  const caminho = `/pedidos${qs({ status: VISOES[ver].status, desde, ate, busca: buscaAplicada, abertos: ver === "todos" ? "1" : "", ...fixo })}`;
  const { dados, erro, carregando, recarregar } = useApi(caminho, { aoVivo: ["pedidos"] });
  const lista = dados || [];
  const total = lista.filter(p => p.status === "ENTREGUE").reduce((t, p) => t + (p.valor || 0), 0);

  function fechar() {
    setAberto(null);
    if (params.get("abrir")) { params.delete("abrir"); setParams(params, { replace: true }); }
  }

  async function pronto(p) {
    if (await executar(() => api.patch(`/pedidos/${p.id}/pronto`), `Pedido de ${p.clienteNome} pronto — chamando entregador.`)) {
      recarregar({ silencioso: true });
    }
  }

  return (
    <>
      <Cabecalho titulo={titulo} subtitulo={subtitulo} />

      <div className="filtros">
        <label className="filtro-data">De <input type="date" value={desde} max={ate || undefined} onChange={e => setDesde(e.target.value)} /></label>
        <label className="filtro-data">Até <input type="date" value={ate} min={desde || undefined} onChange={e => setAte(e.target.value)} /></label>
        <Botao pequeno variante="fantasma" onClick={() => { setDesde(hoje); setAte(hoje); }}>Hoje</Botao>
        <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente, código, telefone ou endereço" aria-label="Buscar" style={{ flex: "1 1 220px" }} />
      </div>

      <div className="abas-com-acoes">
        <Abas ativa={ver} onChange={setVer} abas={Object.entries(VISOES).map(([valor, x]) => ({ valor, rotulo: x.rotulo }))} />
        <Baixar desabilitado={!lista.length} gerar={() => specEntregas(lista, { desde, ate, ver, busca: buscaAplicada, loja: loja?.nomeFantasia })} />
      </div>
      <ErroCaixa erro={erro} onTentar={() => recarregar()} />

      <div className="cartao cartao-tabela">
        {carregando && !dados ? <Carregando /> : lista.length === 0 ? (
          <Vazio titulo="Nenhum pedido encontrado">Mude o período ou a busca.</Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Status</th>
                  <th>Pedido pronto</th>
                  <th>Entregador</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id} className="linha-clicavel" onClick={() => setAberto(p.id)}>
                    <td><strong>{p.codigo}</strong><div className="celula-sub">{dataHora(p.createdAt)}</div></td>
                    <td>
                      {p.clienteNome}{p.retorno && <span className="selo-retorno">↩ retorno</span>}
                      <div className="celula-sub">{p.endereco}{p.complemento ? ` · ${p.complemento}` : ""}</div>
                    </td>
                    <td>
                      <BadgeMapa mapa={STATUS_PEDIDO} valor={p.status} />
                      {p.agendadoPara && p.status === "PREPARANDO" && <div className="celula-sub">⏰ {dataHora(p.agendadoPara)}</div>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      {p.status === "PREPARANDO" ? (
                        <Botao pequeno variante="primario" disabled={ocupado} onClick={() => pronto(p)}>Pedido pronto</Botao>
                      ) : p.prontoEm || !["PREPARANDO", "CANCELADO"].includes(p.status) ? (
                        <span className="apagado">✓ {p.prontoEm ? dataHora(p.prontoEm) : "Pronto"}</span>
                      ) : <span className="apagado">—</span>}
                    </td>
                    <td>{p.entregador?.nomeCompleto || <span className="apagado">{p.status === "PENDENTE" ? "Procurando…" : "—"}</span>}</td>
                    <td className="num">{moeda(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {lista.length > 0 && (
          <div className="tabela-barra">
            <span className="apagado">{lista.length} pedido(s)</span>
            <span>Entregues no filtro: <strong>{moeda(total)}</strong></span>
          </div>
        )}
      </div>

      {aberto && <DetalhePedido id={aberto} onFechar={fechar} />}
    </>
  );
}
