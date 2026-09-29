// App do Entregador — Route Delivery.
// Conecta no mesmo sistema do painel ADM (src/api.js). Abas: Corridas, Ganhos, Promoções, Perfil.
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { api, carregarToken, quandoSessaoExpirar, salvarToken } from "./src/api";
import { PopupAviso } from "./src/componentes";
import { cor } from "./src/tema";
import Entrada from "./src/telas/Entrada";
import Corridas from "./src/telas/Corridas";
import { Ganhos, Perfil, Promocoes } from "./src/telas/Outras";

const ABAS = [
  { chave: "corridas", rotulo: "Corridas", icone: "🛵" },
  { chave: "ganhos", rotulo: "Ganhos", icone: "💰" },
  { chave: "promocoes", rotulo: "Promoções", icone: "🎁" },
  { chave: "perfil", rotulo: "Perfil", icone: "👤" },
];

// Pop-ups pendentes: promoções (ativada/encerrada) e comissões recebidas.
function useAvisos(logado) {
  const [fila, setFila] = useState([]);
  const vistos = useRef(new Set());
  const buscar = useCallback(async () => {
    if (!logado) return;
    try {
      const [promos, comissoes] = await Promise.all([
        api.get("/promocoes/avisos").catch(() => []),
        api.get("/comissoes/avisos").catch(() => []),
      ]);
      const novos = [
        ...promos.map(a => ({ ...a, _tipo: "promocao" })),
        ...comissoes.map(a => ({ ...a, _tipo: "comissao" })),
      ].filter(a => !vistos.current.has(`${a._tipo}:${a.avisoId}`));
      if (novos.length) setFila(f => [...f, ...novos.filter(n => !f.some(x => x._tipo === n._tipo && x.avisoId === n.avisoId))]);
    } catch {
      // sem conexão: tenta de novo no próximo ciclo
    }
  }, [logado]);
  useEffect(() => {
    buscar();
    const t = setInterval(buscar, 30000);
    return () => clearInterval(t);
  }, [buscar]);
  function fechar() {
    const a = fila[0];
    if (!a) return;
    vistos.current.add(`${a._tipo}:${a.avisoId}`);
    const caminho = a._tipo === "promocao" ? `/promocoes/avisos/${encodeURIComponent(a.avisoId)}/visto` : `/comissoes/avisos/${a.avisoId}/visto`;
    api.post(caminho).catch(() => {});
    setFila(f => f.slice(1));
  }
  return { atual: fila[0] || null, fechar };
}

function Principal({ entregador, setEntregador, onSair }) {
  const [aba, setAba] = useState("corridas");
  const { atual, fechar } = useAvisos(true);

  // Atualiza os dados do entregador (ex.: cadastro aprovado pela equipe) a cada minuto.
  useEffect(() => {
    const t = setInterval(() => api.get("/me").then(setEntregador).catch(() => {}), 60000);
    return () => clearInterval(t);
  }, [setEntregador]);

  return (
    <View style={{ flex: 1 }}>
      <View style={st.topo}>
        <Text style={st.topoTitulo}>{ABAS.find(a => a.chave === aba)?.rotulo}</Text>
        <Text style={st.topoNome} numberOfLines={1}>{entregador.nomeCompleto?.split(" ")[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        {aba === "corridas" && <Corridas entregador={entregador} setEntregador={setEntregador} />}
        {aba === "ganhos" && <Ganhos />}
        {aba === "promocoes" && <Promocoes />}
        {aba === "perfil" && <Perfil entregador={entregador} onSair={onSair} />}
      </View>
      <View style={st.abas}>
        {ABAS.map(a => (
          <Pressable key={a.chave} onPress={() => setAba(a.chave)} style={st.aba} accessibilityRole="tab" accessibilityState={{ selected: aba === a.chave }}>
            <Text style={st.abaIcone}>{a.icone}</Text>
            <Text style={[st.abaTexto, aba === a.chave && st.abaAtiva]}>{a.rotulo}</Text>
          </Pressable>
        ))}
      </View>
      <PopupAviso aviso={atual} onFechar={fechar} />
    </View>
  );
}

export default function App() {
  const [carregando, setCarregando] = useState(true);
  const [entregador, setEntregador] = useState(null);

  const sair = useCallback(async () => {
    await api.patch("/status", { online: false }).catch(() => {});
    await salvarToken(null);
    setEntregador(null);
  }, []);

  useEffect(() => {
    quandoSessaoExpirar(() => { salvarToken(null); setEntregador(null); });
    (async () => {
      try {
        if (await carregarToken()) setEntregador(await api.get("/me"));
      } catch {
        await salvarToken(null);
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={st.raiz} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        {carregando
          ? <View style={st.centro}><ActivityIndicator color={cor.primariaClara} size="large" /></View>
          : entregador
            ? <Principal entregador={entregador} setEntregador={setEntregador} onSair={sair} />
            : <Entrada onEntrou={setEntregador} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cor.fundo },
  centro: { flex: 1, alignItems: "center", justifyContent: "center" },
  topo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: cor.borda },
  topoTitulo: { color: cor.texto, fontSize: 22, fontWeight: "800" },
  topoNome: { color: cor.texto3, fontSize: 14, maxWidth: 160 },
  abas: { flexDirection: "row", borderTopWidth: 1, borderTopColor: cor.borda, backgroundColor: cor.superficie },
  aba: { flex: 1, alignItems: "center", paddingVertical: 8, gap: 2 },
  abaIcone: { fontSize: 20 },
  abaTexto: { color: cor.texto3, fontSize: 12, fontWeight: "600" },
  abaAtiva: { color: cor.primariaClara, fontWeight: "800" },
});
