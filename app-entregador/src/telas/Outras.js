// Abas Ganhos, Promoções e Perfil.
import { useCallback, useEffect, useState } from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../api";
import { Botao, Cartao, Erro, Selo, Vazio } from "../componentes";
import { VEICULOS, cor, dataCurta, km, moeda } from "../tema";

function useCarregar(fn) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const carregar = useCallback(async () => {
    try { setDados(await fn()); setErro(null); } catch (e) { setErro(e.message); }
  }, [fn]);
  useEffect(() => { carregar(); }, [carregar]);
  const puxar = async () => { setAtualizando(true); await carregar(); setAtualizando(false); };
  return { dados, erro, refresh: <RefreshControl refreshing={atualizando} onRefresh={puxar} tintColor={cor.texto2} /> };
}

// ---------- Ganhos ----------

const buscarGanhos = () => Promise.all([api.get("/ganhos"), api.get("/comissoes")]);

function Periodo({ titulo, g }) {
  return (
    <Cartao estilo={st.periodo}>
      <Text style={st.periodoTitulo}>{titulo}</Text>
      <Text style={st.grande}>{g?.entregas ?? 0} <Text style={st.grandeUnidade}>entrega(s)</Text></Text>
      <Text style={st.periodoLinha}>{km(g?.distanciaKm || 0)} rodados</Text>
      {g?.comissoes > 0 && <Text style={[st.periodoLinha, { color: cor.ok }]}>+ {moeda(g.comissoes)} em comissões</Text>}
    </Cartao>
  );
}

export function Ganhos() {
  const { dados, erro, refresh } = useCarregar(buscarGanhos);
  const [g, c] = dados || [];
  return (
    <ScrollView contentContainerStyle={st.tela} refreshControl={refresh}>
      <Erro texto={erro} />
      <View style={st.grade}>
        <Periodo titulo="Hoje" g={g?.hoje} />
        <Periodo titulo="7 dias" g={g?.ultimos7Dias} />
        <Periodo titulo="Este mês" g={g?.mes} />
      </View>
      <Text style={st.secao}>Comissões</Text>
      {c && (
        <View style={st.grade}>
          <Cartao estilo={st.periodo}><Text style={st.periodoTitulo}>No mês</Text><Text style={st.grande}>{moeda(c.totais.mes)}</Text></Cartao>
          <Cartao estilo={st.periodo}><Text style={st.periodoTitulo}>A receber</Text><Text style={[st.grande, { color: cor.aviso }]}>{moeda(c.totais.aReceber)}</Text></Cartao>
        </View>
      )}
      {c && c.comissoes.length === 0 && <Vazio titulo="Nenhuma comissão ainda" texto="Comissões lançadas pela equipe e comissões automáticas por entrega aparecem aqui." />}
      {c?.comissoes.map(x => (
        <Cartao key={x.id}>
          <View style={st.linhaTopo}>
            <Text style={st.valor}>{moeda(x.valor)}</Text>
            <Selo texto={x.situacao === "PAGA" ? "Paga" : "A receber"} corFundo={x.situacao === "PAGA" ? "rgba(34,197,94,0.18)" : "rgba(245,165,36,0.18)"} corTexto={x.situacao === "PAGA" ? cor.ok : cor.aviso} />
          </View>
          <Text style={st.texto}>
            {x.origem === "AUTOMATICA" ? `Entrega ${x.pedidoCodigo || ""} · ${x.comercio}` : `${x.quantidadeEntregas} entrega(s) · ${x.comercio}`}
          </Text>
          <Text style={st.textoPequeno}>{dataCurta(x.referencia)}{x.descricao ? ` · ${x.descricao}` : ""}</Text>
        </Cartao>
      ))}
    </ScrollView>
  );
}

// ---------- Promoções ----------

const buscarPromocoes = () => api.get("/promocoes");

export function Promocoes() {
  const { dados, erro, refresh } = useCarregar(buscarPromocoes);
  return (
    <ScrollView contentContainerStyle={st.tela} refreshControl={refresh}>
      <Erro texto={erro} />
      {dados && dados.length === 0 && <Vazio titulo="Nenhuma promoção agora" texto="Quando a equipe ativar uma promoção, ela aparece aqui e você recebe um aviso." />}
      {(dados || []).map(p => (
        <Cartao key={p.id} estilo={{ padding: 0, overflow: "hidden" }}>
          {p.fotoUrl ? <Image source={{ uri: p.fotoUrl }} style={st.foto} resizeMode="cover" /> : null}
          <View style={{ padding: 16, gap: 6 }}>
            <Text style={st.promoTitulo}>{p.titulo}</Text>
            {p.premio && <Text style={st.premio}>🎁 {p.premio}</Text>}
            {p.descricao && <Text style={st.texto}>{p.descricao}</Text>}
            {(p.inicio || p.fim) && <Text style={st.textoPequeno}>{p.inicio ? `De ${dataCurta(p.inicio)}` : ""}{p.fim ? ` até ${dataCurta(p.fim)}` : ""}</Text>}
          </View>
        </Cartao>
      ))}
    </ScrollView>
  );
}

// ---------- Perfil ----------

const STATUS = { ATIVO: ["Ativo", cor.ok], EM_ANALISE: ["Em análise", cor.aviso], INATIVO: ["Inativo", cor.critico] };

export function Perfil({ entregador, onSair }) {
  const [rotulo, c] = STATUS[entregador?.status] || [entregador?.status, cor.texto2];
  const linhas = [
    ["E-mail", entregador?.email], ["Telefone", entregador?.telefone], ["Veículo", [VEICULOS[entregador?.veiculoTipo], entregador?.veiculoModelo, entregador?.veiculoPlaca].filter(Boolean).join(" · ")],
    ["Cidade", entregador?.cidade],
  ];
  return (
    <ScrollView contentContainerStyle={st.tela}>
      <Cartao>
        <Text style={st.nome}>{entregador?.nomeCompleto}</Text>
        <Selo texto={rotulo} corFundo="rgba(255,255,255,0.06)" corTexto={c} />
        {linhas.filter(([, v]) => v).map(([r, v]) => (
          <View key={r} style={st.perfilLinha}><Text style={st.perfilRotulo}>{r}</Text><Text style={st.texto}>{v}</Text></View>
        ))}
      </Cartao>
      <Text style={st.textoPequeno}>Para alterar seus dados, fale com a equipe da operação.</Text>
      <Botao titulo="Sair da conta" variante="perigo" onPress={onSair} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  tela: { padding: 16, gap: 12, paddingBottom: 32, maxWidth: 560, width: "100%", alignSelf: "center" },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  periodo: { flexGrow: 1, flexBasis: 150, gap: 4 },
  periodoTitulo: { color: cor.texto3, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  grande: { color: cor.texto, fontSize: 24, fontWeight: "800" },
  grandeUnidade: { fontSize: 14, color: cor.texto2, fontWeight: "600" },
  periodoLinha: { color: cor.texto2, fontSize: 14 },
  secao: { color: cor.texto2, fontSize: 13, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginTop: 6 },
  linhaTopo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  valor: { color: cor.texto, fontSize: 20, fontWeight: "800" },
  texto: { color: cor.texto2, fontSize: 15 },
  textoPequeno: { color: cor.texto3, fontSize: 13 },
  foto: { width: "100%", height: 170, backgroundColor: cor.superficie2 },
  promoTitulo: { color: cor.texto, fontSize: 19, fontWeight: "800" },
  premio: { color: cor.ok, fontSize: 15, fontWeight: "700" },
  nome: { color: cor.texto, fontSize: 22, fontWeight: "800" },
  perfilLinha: { gap: 2 },
  perfilRotulo: { color: cor.texto3, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
});
