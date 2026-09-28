// Relatórios › Roteirização — sequência de coletas e entregas de um entregador num dia.
import { useState } from "react";
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { BadgeMapa, Cabecalho, Carregando, ErroCaixa, StatTile, Vazio } from "../../components/ui";
import { FiltroDia, TabelaRelatorio, duracao } from "../../components/relatorios";
import MapaRota from "../../components/MapaRota";
import { STATUS_PEDIDO, dataHora, km, moeda, numero, paraInputData } from "../../utils/format";

const hora = d => (d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

const COLUNAS = [
  { chave: "ordem", rotulo: "#", num: true },
  { chave: "codigo", rotulo: "Pedido", valor: l => <strong>{l.codigo}</strong> },
  { chave: "status", rotulo: "Status", valor: l => <BadgeMapa mapa={STATUS_PEDIDO} valor={l.status} /> },
  { chave: "coleta", rotulo: "Coleta", valor: l => <>{l.coleta.nome}<div className="celula-sub">{l.coleta.endereco}</div></>, csv: l => `${l.coleta.nome} — ${l.coleta.endereco || ""}`, ordenar: l => l.coleta.nome },
  { chave: "entrega", rotulo: "Entrega", valor: l => <>{l.cliente}<div className="celula-sub">{l.entrega.endereco}</div></>, csv: l => `${l.cliente} — ${l.entrega.endereco}`, ordenar: l => l.cliente },
  { chave: "aceitoEm", rotulo: "Aceite", valor: l => hora(l.aceitoEm), csv: l => dataHora(l.aceitoEm), ordenar: l => (l.aceitoEm ? new Date(l.aceitoEm).getTime() : null) },
  { chave: "entregueEm", rotulo: "Entrega", valor: l => hora(l.entregueEm), csv: l => dataHora(l.entregueEm), ordenar: l => (l.entregueEm ? new Date(l.entregueEm).getTime() : null) },
  { chave: "duracaoMin", rotulo: "Duração", num: true, valor: l => duracao(l.duracaoMin) },
  { chave: "distanciaKm", rotulo: "Distância", num: true, valor: l => km(l.distanciaKm) },
  { chave: "valor", rotulo: "Valor", num: true, valor: l => moeda(l.valor) },
];

function Detalhe({ entregadorId, data, nome }) {
  const { dados, erro } = useApi(`/relatorios/roteirizacao${qs({ entregadorId, data })}`);
  if (erro) return <ErroCaixa erro={erro} />;
  if (!dados) return <Carregando />;
  const t = dados.totais;

  // Percurso: coleta -> entrega de cada corrida (linha cheia) e deslocamento até a próxima coleta (tracejada).
  const linhas = [];
  const marcadores = [];
  dados.paradas.forEach((p, i) => {
    if (p.coleta.lat != null) marcadores.push({ ...p.coleta, tipo: "coleta", rotulo: p.ordem, dica: `${p.ordem}. Coleta · ${p.coleta.nome}` });
    if (p.entrega.lat != null) marcadores.push({ ...p.entrega, tipo: "entrega", rotulo: p.ordem, dica: `${p.ordem}. Entrega · ${p.cliente} (${p.codigo})` });
    if (p.coleta.lat != null && p.entrega.lat != null) linhas.push({ pontos: [[p.coleta.lat, p.coleta.lng], [p.entrega.lat, p.entrega.lng]] });
    const prox = dados.paradas[i + 1];
    if (prox && p.entrega.lat != null && prox.coleta.lat != null) {
      linhas.push({ pontos: [[p.entrega.lat, p.entrega.lng], [prox.coleta.lat, prox.coleta.lng]], cor: "#898781", tracejada: true });
    }
  });

  return (
    <>
      <div className="grade-stats">
        <StatTile rotulo="Corridas" valor={numero(t.corridas)} detalhe={`${numero(t.entregues)} entregues`} />
        <StatTile rotulo="Km das entregas" valor={km(t.kmEntregas)} detalhe="Coleta → entrega, pelo percurso" />
        <StatTile rotulo="Deslocamento entre corridas" valor={km(t.kmDeslocamentoEstimado)} detalhe="Estimado em linha reta" />
        <StatTile rotulo="Valor" valor={moeda(t.valor)} />
      </div>
      {dados.paradas.length === 0 ? <Vazio titulo={`${nome || "Este entregador"} não teve corridas neste dia`} /> : (
        <>
          <section className="cartao">
            <MapaRota linhas={linhas} marcadores={marcadores} chave={`${entregadorId}-${data}`} />
            <div className="legenda-rota">
              <span><i style={{ background: "#ea580c", borderRadius: 3 }} /> Coleta (nº da corrida)</span>
              <span><i style={{ background: "#2a78d6" }} /> Entrega</span>
              <span>— Corrida · - - Deslocamento até a próxima coleta</span>
              {t.semCoordenadas > 0 && <span className="apagado">{t.semCoordenadas} corrida(s) sem coordenadas não aparecem no mapa</span>}
            </div>
          </section>
          <TabelaRelatorio colunas={COLUNAS} linhas={dados.paradas} nomeCsv={`roteirizacao_${nome || entregadorId}_${data}`} chaveLinha={l => l.pedidoId} />
        </>
      )}
    </>
  );
}

export default function Roteirizacao() {
  const [data, setData] = useState(paraInputData(new Date()));
  const [entregadorId, setEntregadorId] = useState("");
  const resumo = useApi(`/relatorios/roteirizacao${qs({ data })}`);
  const { dados: entregadores } = useApi("/entregadores");
  const nome = (entregadores || []).find(e => e.id === entregadorId)?.nomeCompleto;

  return (
    <>
      <Cabecalho titulo="Roteirização" subtitulo="Ordem das corridas de cada entregador no dia, com coletas, entregas e deslocamentos no mapa" />
      <FiltroDia valor={data} onChange={setData}>
        <select value={entregadorId} onChange={e => setEntregadorId(e.target.value)} aria-label="Entregador">
          <option value="">Todos os entregadores (resumo)</option>
          {(entregadores || []).map(e => <option key={e.id} value={e.id}>{e.nomeCompleto}</option>)}
        </select>
      </FiltroDia>

      {entregadorId ? <Detalhe key={`${entregadorId}-${data}`} entregadorId={entregadorId} data={data} nome={nome} /> : (
        <>
          <ErroCaixa erro={resumo.erro} />
          <TabelaRelatorio
            carregando={resumo.carregando}
            linhas={resumo.dados?.entregadores}
            vazio="Nenhuma corrida neste dia"
            chaveLinha={l => l.entregadorId}
            onLinha={l => setEntregadorId(l.entregadorId)}
            nomeCsv={`roteirizacao_resumo_${data}`}
            colunas={[
              { chave: "nome", rotulo: "Entregador", valor: l => <strong>{l.nome}</strong> },
              { chave: "corridas", rotulo: "Corridas", num: true, valor: l => numero(l.corridas) },
              { chave: "entregues", rotulo: "Entregues", num: true, valor: l => numero(l.entregues) },
              { chave: "distanciaKm", rotulo: "Km das entregas", num: true, valor: l => km(l.distanciaKm) },
            ]}
          />
          {resumo.dados?.entregadores?.length > 0 && <p className="apagado">Clique num entregador para ver a rota no mapa.</p>}
        </>
      )}
    </>
  );
}
