// Relatórios › Recorrência de Entregas — clientes que recebem entregas repetidas vezes.
import { useState } from "react";
import { qs } from "../../api";
import { useApi } from "../../hooks/useApi";
import { Cabecalho, ErroCaixa, StatTile } from "../../components/ui";
import { FiltroPeriodo, TabelaRelatorio, porcento, usePeriodo } from "../../components/relatorios";
import { data, moeda, numero } from "../../utils/format";
import { mascaraTelefone } from "../../utils/documento";

const COLUNAS = [
  { chave: "cliente", rotulo: "Cliente", valor: l => <><strong>{l.cliente}</strong><div className="celula-sub">{l.telefone ? mascaraTelefone(l.telefone) : "sem telefone"}</div></> },
  { chave: "endereco", rotulo: "Último endereço", valor: l => <>{l.endereco}{l.enderecosDiferentes > 1 && <div className="celula-sub">{l.enderecosDiferentes} endereços diferentes</div>}</> },
  { chave: "comercios", rotulo: "Comércios", valor: l => l.comercios.join(", "), ordenar: l => l.comercios.join(", ") },
  { chave: "entregas", rotulo: "Entregas", num: true, valor: l => numero(l.entregas) },
  { chave: "intervaloMedioDias", rotulo: "Intervalo médio", num: true, valor: l => (l.intervaloMedioDias == null ? "—" : `${numero(l.intervaloMedioDias)} dia(s)`) },
  { chave: "primeira", rotulo: "Primeira", valor: l => data(l.primeira), ordenar: l => new Date(l.primeira).getTime(), csv: l => data(l.primeira) },
  { chave: "ultima", rotulo: "Última", valor: l => data(l.ultima), ordenar: l => new Date(l.ultima).getTime(), csv: l => data(l.ultima) },
  { chave: "valorTotal", rotulo: "Valor total", num: true, valor: l => moeda(l.valorTotal) },
];

export default function Recorrencia() {
  const [periodo, setPeriodo] = usePeriodo(90);
  const [comercioId, setComercioId] = useState("");
  const [minimo, setMinimo] = useState(2);
  const { dados: comercios } = useApi("/comercios");
  const { dados, erro, carregando } = useApi(`/relatorios/recorrencia${qs({ ...periodo, comercioId, minimo })}`);
  const t = dados?.totais;

  return (
    <>
      <Cabecalho titulo="Recorrência de Entregas" subtitulo="Clientes que recebem mais de uma vez. O cliente é identificado pelo telefone; sem telefone, pelo nome + endereço." />
      <FiltroPeriodo valor={periodo} onChange={setPeriodo}>
        <select value={comercioId} onChange={e => setComercioId(e.target.value)} aria-label="Comércio">
          <option value="">Todos os comércios</option>
          {(comercios || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
        </select>
        <label className="campo-inline">Mínimo de entregas
          <select value={minimo} onChange={e => setMinimo(Number(e.target.value))}>
            {[2, 3, 5, 10].map(n => <option key={n} value={n}>{n}+</option>)}
          </select>
        </label>
      </FiltroPeriodo>
      <ErroCaixa erro={erro} />
      {t && (
        <div className="grade-stats">
          <StatTile rotulo="Clientes atendidos" valor={numero(t.clientes)} detalhe={`${numero(t.entregas)} entregas`} />
          <StatTile rotulo="Clientes recorrentes" valor={numero(t.recorrentes)} detalhe={`${porcento(t.percentualRecorrentes)} dos clientes`} />
          <StatTile rotulo="Entregas de recorrentes" valor={numero(t.entregasDeRecorrentes)} detalhe={`${porcento(t.entregas ? (t.entregasDeRecorrentes / t.entregas) * 100 : 0)} do volume`} />
        </div>
      )}
      <TabelaRelatorio
        colunas={COLUNAS}
        linhas={dados?.linhas}
        carregando={carregando}
        vazio={`Nenhum cliente com ${minimo} ou mais entregas no período`}
        nomeCsv={`recorrencia_${periodo.desde}_${periodo.ate}`}
      />
    </>
  );
}
