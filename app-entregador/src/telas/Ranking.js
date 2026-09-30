// Ranking semanal: entregas concluídas de segunda a domingo. Os 10 primeiros ganham o prêmio configurado pelo ADM.
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { api } from "../api";
import { assinarTempoReal } from "../tempoReal";
import { Cartao, Erro, Vazio } from "../componentes";
import { cor, dataCurta, moeda } from "../tema";

const MEDALHA = ["#f5c542", "#cbd5e1", "#d9955b"]; // ouro, prata, bronze

function tempoParaFechar(fim) {
  const ms = new Date(fim).getTime() - Date.now();
  if (ms <= 0) return "fechando agora";
  const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
  return d > 0 ? `fecha em ${d} dia${d > 1 ? "s" : ""} e ${h} h` : `fecha em ${h} h`;
}

function Linha({ posicao, item, premio }) {
  const medalha = MEDALHA[posicao - 1];
  return (
    <View style={[st.linha, item?.eu && st.linhaEu]}>
      <View style={[st.posicao, medalha && { backgroundColor: medalha }]}>
        {medalha ? <Feather name="award" size={15} color="#1e293b" /> : <Text style={st.posicaoTexto}>{posicao}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[st.nome, !item && { color: cor.texto3 }]} numberOfLines={1}>
          {item ? `${medalha ? `${posicao}º · ` : ""}${item.nome}${item.eu ? " (você)" : ""}` : "Vaga aberta"}
        </Text>
        <Text style={st.entregas}>{item ? `${item.entregas} entrega${item.entregas === 1 ? "" : "s"}` : "—"}</Text>
      </View>
      {premio > 0 && <Text style={st.premio}>{moeda(premio)}</Text>}
    </View>
  );
}

export default function Ranking() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    try { setDados(await api.get("/ranking")); setErro(null); } catch (e) { setErro(e.message); }
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60000);
    const sair = assinarTempoReal(["ranking"], carregar);
    return () => { clearInterval(t); sair(); };
  }, [carregar]);

  if (!dados) return <ScrollView contentContainerStyle={st.tela}><Erro texto={erro} />{!erro && <Vazio titulo="Carregando ranking…" />}</ScrollView>;
  if (!dados.ativo) return <ScrollView contentContainerStyle={st.tela}><Vazio titulo="Ranking desativado" texto="A equipe ainda não ativou o ranking semanal." /></ScrollView>;

  const totalPremios = dados.premios.reduce((s, v) => s + v, 0);
  const eu = dados.eu;
  return (
    <ScrollView
      contentContainerStyle={st.tela}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={async () => { setAtualizando(true); await carregar(); setAtualizando(false); }} tintColor={cor.texto2} />}
    >
      <Erro texto={erro} />
      <Cartao estilo={st.topo}>
        <View style={st.topoLinha}>
          <Feather name="award" size={26} color="#f5c542" />
          <View style={{ flex: 1 }}>
            <Text style={st.titulo}>Ranking da semana</Text>
            <Text style={st.sub}>{dataCurta(dados.inicio)} (seg) a {dataCurta(dados.fim)} (dom) · {tempoParaFechar(dados.fim)}</Text>
          </View>
        </View>
        {totalPremios > 0 && <Text style={st.chamada}>Os 10 primeiros ganham prêmio em dinheiro — {moeda(totalPremios)} em prêmios!</Text>}
        <View style={st.meu}>
          <View style={st.meuBloco}>
            <Text style={st.meuValor}>{eu.posicao ? `${eu.posicao}º` : "—"}</Text>
            <Text style={st.meuRotulo}>sua posição</Text>
          </View>
          <View style={st.meuBloco}>
            <Text style={st.meuValor}>{eu.entregas}</Text>
            <Text style={st.meuRotulo}>entregas na semana</Text>
          </View>
          <View style={st.meuBloco}>
            <Text style={[st.meuValor, { color: cor.ok }]}>{eu.premio > 0 ? moeda(eu.premio) : "—"}</Text>
            <Text style={st.meuRotulo}>prêmio atual</Text>
          </View>
        </View>
        {eu.faltamParaTop10 > 0 && (
          <Text style={st.falta}>Faltam {eu.faltamParaTop10} entrega{eu.faltamParaTop10 > 1 ? "s" : ""} para você entrar no top 10.</Text>
        )}
        {dados.minimo > 1 && <Text style={st.sub}>Para entrar no ranking: mínimo de {dados.minimo} entregas na semana.</Text>}
      </Cartao>

      <Cartao>
        <Text style={st.secao}>Top 10</Text>
        {Array.from({ length: 10 }, (_, i) => (
          <Linha key={i} posicao={i + 1} item={dados.top10[i]} premio={dados.premios[i]} />
        ))}
        <Text style={st.rodape}>Conta as entregas finalizadas de segunda 00:00 a domingo 23:59. Empate: fica na frente quem chegou primeiro ao total. O prêmio cai na sua Carteira quando a semana fecha.</Text>
      </Cartao>

      {dados.anterior && (
        <Cartao>
          <Text style={st.secao}>Semana passada · {dataCurta(dados.anterior.inicio)} a {dataCurta(dados.anterior.fim)}</Text>
          {dados.anterior.top3.length === 0 && <Text style={st.sub}>Sem classificados.</Text>}
          {dados.anterior.top3.map(x => <Linha key={x.posicao} posicao={x.posicao} item={x} premio={x.premio} />)}
          {dados.anterior.minha && (
            <Text style={st.falta}>Você ficou em {dados.anterior.minha.posicao}º com {dados.anterior.minha.entregas} entregas{dados.anterior.minha.premio > 0 ? ` e ganhou ${moeda(dados.anterior.minha.premio)}` : ""}.</Text>
          )}
        </Cartao>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  tela: { padding: 16, gap: 12, paddingBottom: 120, maxWidth: 560, width: "100%", alignSelf: "center" },
  topo: { borderColor: "rgba(245,197,66,0.45)" },
  topoLinha: { flexDirection: "row", gap: 12, alignItems: "center" },
  titulo: { color: cor.texto, fontSize: 20, fontWeight: "800" },
  sub: { color: cor.texto3, fontSize: 13 },
  chamada: { color: "#f5c542", fontSize: 14, fontWeight: "700" },
  meu: { flexDirection: "row", gap: 8, marginTop: 4 },
  meuBloco: { flex: 1, backgroundColor: cor.superficie2, borderRadius: 12, paddingVertical: 10, alignItems: "center", gap: 2 },
  meuValor: { color: cor.texto, fontSize: 20, fontWeight: "800" },
  meuRotulo: { color: cor.texto3, fontSize: 11, textAlign: "center" },
  falta: { color: cor.primariaClara, fontSize: 14, fontWeight: "600" },
  secao: { color: cor.texto2, fontSize: 13, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  linha: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 10 },
  linhaEu: { backgroundColor: "rgba(42,120,214,0.18)" },
  posicao: { width: 32, height: 32, borderRadius: 16, backgroundColor: cor.superficie2, alignItems: "center", justifyContent: "center" },
  posicaoTexto: { color: cor.texto2, fontWeight: "800", fontSize: 14 },
  nome: { color: cor.texto, fontSize: 15, fontWeight: "700" },
  entregas: { color: cor.texto3, fontSize: 13 },
  premio: { color: cor.ok, fontSize: 15, fontWeight: "800" },
  rodape: { color: cor.texto3, fontSize: 12, lineHeight: 17, marginTop: 4 },
});
