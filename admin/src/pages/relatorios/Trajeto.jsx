// Relatórios › Trajeto dos Entregadores — rastro de GPS enviado pelo app num dia.
import { useState } from "react";
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { Botao, Cabecalho, Carregando, ErroCaixa, StatTile, Vazio } from "../../components/ui";
import { FiltroDia, baixarCsv, duracao } from "../../components/relatorios";
import MapaRota from "../../components/MapaRota";
import { km, numero, paraInputData } from "../../utils/format";

const hora = d => (d ? new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

function Detalhe({ entregadorId, data, nome }) {
  const { dados, erro } = useApi(`/relatorios/trajeto${qs({ entregadorId, data })}`);
  if (erro) return <ErroCaixa erro={erro} />;
  if (!dados) return <Carregando />;
  const t = dados.totais;
  const pontos = dados.pontos.map(p => [p.lat, p.lng]);

  const marcadores = [];
  if (pontos.length) {
    marcadores.push({ lat: pontos[0][0], lng: pontos[0][1], tipo: "inicio", rotulo: "I", dica: `Início · ${hora(t.inicio)}` });
    marcadores.push({ lat: pontos[pontos.length - 1][0], lng: pontos[pontos.length - 1][1], tipo: "fim", rotulo: "F", dica: `Última posição · ${hora(t.fim)}` });
  }
  dados.pedidos.forEach(p => {
    marcadores.push({ ...p.coleta, tipo: "coleta", rotulo: "C", dica: `Coleta ${p.codigo} · ${p.coleta.nome}` });
    marcadores.push({ ...p.entrega, tipo: "entrega", rotulo: "E", dica: `Entrega ${p.codigo} · ${p.entrega.endereco}` });
  });

  return (
    <>
      <div className="grade-stats">
        <StatTile rotulo="Distância percorrida" valor={km(t.distanciaKm)} detalhe="Pelo rastro de GPS" />
        <StatTile rotulo="Tempo com o app enviando posição" valor={duracao(t.duracaoMin)} detalhe={t.inicio ? `${hora(t.inicio)} às ${hora(t.fim)}` : ""} />
        <StatTile rotulo="Pontos registrados" valor={numero(t.pontos)} detalhe={t.pontosDescartados ? `${t.pontosDescartados} descartado(s) por salto de GPS` : ""} />
        <StatTile rotulo="Corridas no dia" valor={numero(dados.pedidos.length)} />
      </div>
      {pontos.length === 0 ? (
        <Vazio titulo={`Nenhuma posição registrada para ${nome || "este entregador"} neste dia`}>
          O rastro é gravado quando o app do entregador envia a localização (a partir desta versão).
        </Vazio>
      ) : (
        <section className="cartao">
          <div className="cartao-topo">
            <h2>Trajeto</h2>
            <Botao pequeno onClick={() => baixarCsv(`trajeto_${nome || entregadorId}_${data}`,
              [{ chave: "t", rotulo: "Horário", csv: p => new Date(p.t).toLocaleString("pt-BR") }, { chave: "lat", rotulo: "Latitude" }, { chave: "lng", rotulo: "Longitude" }],
              dados.pontos)}>⬇ Exportar pontos (CSV)</Botao>
          </div>
          <MapaRota linhas={[{ pontos, cor: "#2a78d6" }]} marcadores={marcadores} chave={`${entregadorId}-${data}`} altura={420} />
          <div className="legenda-rota">
            <span><i style={{ background: "#0b7a0b" }} /> Início</span>
            <span><i style={{ background: "#1e293b" }} /> Última posição</span>
            <span><i style={{ background: "#ea580c", borderRadius: 3 }} /> Coleta</span>
            <span><i style={{ background: "#2a78d6" }} /> Entrega</span>
          </div>
        </section>
      )}
    </>
  );
}

export default function Trajeto() {
  const [data, setData] = useState(paraInputData(new Date()));
  const [entregadorId, setEntregadorId] = useState("");
  const { dados: entregadores } = useApi("/entregadores");
  const nome = (entregadores || []).find(e => e.id === entregadorId)?.nomeCompleto;

  return (
    <>
      <Cabecalho titulo="Trajeto dos Entregadores" subtitulo="Caminho real percorrido no dia, pelas posições que o app do entregador envia" />
      <FiltroDia valor={data} onChange={setData}>
        <select value={entregadorId} onChange={e => setEntregadorId(e.target.value)} aria-label="Entregador">
          <option value="">Escolha o entregador…</option>
          {(entregadores || []).map(e => <option key={e.id} value={e.id}>{e.nomeCompleto}</option>)}
        </select>
      </FiltroDia>
      {entregadorId ? <Detalhe key={`${entregadorId}-${data}`} entregadorId={entregadorId} data={data} nome={nome} />
        : <Vazio titulo="Escolha um entregador e o dia">O mapa mostra o percurso, as coletas e as entregas daquele dia.</Vazio>}
    </>
  );
}
