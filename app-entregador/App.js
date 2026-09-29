// App do Entregador — Route Delivery.
// Home com mapa em tela cheia (online/offline e ganhos por cima), atalhos Home/Disponíveis/Em Andamento
// embaixo e menu lateral (Entregas, Mensagens, Carteira, Conta, Ajuda). Conecta no mesmo sistema do painel ADM.
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api, carregarToken, quandoSessaoExpirar, salvarToken } from "./src/api";
import { assinarTempoReal, reiniciarTempoReal } from "./src/tempoReal";
import { PopupAviso } from "./src/componentes";
import { cor, moeda } from "./src/tema";
import Mapa from "./src/mapa/Mapa";
import Entrada from "./src/telas/Entrada";
import { ListaAndamento, ListaDisponiveis, useOperacao } from "./src/telas/Corridas";
import { Carteira, Mensagens, Perfil, Promocoes, Treinamento } from "./src/telas/Outras";

const VERSAO = "v1.1.0";
const TITULOS = {
  home: "Home", disponiveis: "Disponíveis", andamento: "Em andamento", promocao: "Promoção",
  mensagens: "Mensagens", carteira: "Carteira", conta: "Conta", treinamento: "Treinamento",
};

// ---------- Pop-ups (promoções e comissões) ----------

function useAvisos() {
  const [fila, setFila] = useState([]);
  const vistos = useRef(new Set());
  const buscar = useCallback(async () => {
    const [promos, comissoes] = await Promise.all([
      api.get("/promocoes/avisos").catch(() => []),
      api.get("/comissoes/avisos").catch(() => []),
    ]);
    const novos = [...promos.map(a => ({ ...a, _tipo: "promocao" })), ...comissoes.map(a => ({ ...a, _tipo: "comissao" }))]
      .filter(a => !vistos.current.has(`${a._tipo}:${a.avisoId}`));
    if (novos.length) setFila(f => [...f, ...novos.filter(n => !f.some(x => x._tipo === n._tipo && x.avisoId === n.avisoId))]);
  }, []);
  useEffect(() => {
    buscar();
    const t = setInterval(buscar, 60000); // reserva (ex.: promoção que venceu pelo prazo)
    const sair = assinarTempoReal(["avisos"], buscar);
    return () => { clearInterval(t); sair(); };
  }, [buscar]);
  function fechar() {
    const a = fila[0];
    if (!a) return;
    vistos.current.add(`${a._tipo}:${a.avisoId}`);
    api.post(a._tipo === "promocao" ? `/promocoes/avisos/${encodeURIComponent(a.avisoId)}/visto` : `/comissoes/avisos/${a.avisoId}/visto`).catch(() => {});
    setFila(f => f.slice(1));
  }
  return { atual: fila[0] || null, fechar };
}

// ---------- Menu lateral ----------

function ItemMenu({ icone, rotulo, ativo, onPress, sub, direita }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [sub ? st.subItem : st.item, ativo && (sub ? st.subItemAtivo : st.itemAtivo), pressed && { opacity: 0.8 }]} accessibilityRole="button">
      <Feather name={icone} size={sub ? 17 : 21} color={ativo && !sub ? "#fff" : sub ? cor.texto2 : cor.texto} />
      <Text style={[sub ? st.subItemTexto : st.itemTexto, ativo && { color: "#fff" }]}>{rotulo}</Text>
      {direita}
    </Pressable>
  );
}

function MenuLateral({ aberto, tela, ir, onFechar }) {
  const [entregasAberto, setEntregasAberto] = useState(true);
  const entregas = ["disponiveis", "andamento", "promocao"].includes(tela);
  return (
    <Modal visible={aberto} transparent animationType="fade" onRequestClose={onFechar}>
      <SafeAreaProvider>
      <View style={{ flex: 1, flexDirection: "row" }}>
        <SafeAreaView style={st.menu} edges={["top", "bottom", "left"]}>
          <View style={st.menuTopo}>
            <Text style={st.menuTitulo}>Menu</Text>
            <Pressable onPress={onFechar} hitSlop={12} accessibilityLabel="Fechar menu"><Feather name="x" size={24} color={cor.texto} /></Pressable>
          </View>
          <View style={st.menuLista}>
            <ItemMenu icone="home" rotulo="Home" ativo={tela === "home"} onPress={() => ir("home")} />
            <ItemMenu
              icone="truck" rotulo="Entregas" ativo={false}
              onPress={() => setEntregasAberto(a => !a)}
              direita={<Feather name={entregasAberto ? "chevron-up" : "chevron-down"} size={18} color={cor.texto3} style={{ marginLeft: "auto" }} />}
            />
            {(entregasAberto || entregas) && (
              <View style={st.subLista}>
                <ItemMenu sub icone="map-pin" rotulo="Disponíveis" ativo={tela === "disponiveis"} onPress={() => ir("disponiveis")} />
                <ItemMenu sub icone="truck" rotulo="Em andamento" ativo={tela === "andamento"} onPress={() => ir("andamento")} />
                <ItemMenu sub icone="tag" rotulo="Promoção" ativo={tela === "promocao"} onPress={() => ir("promocao")} />
              </View>
            )}
            <ItemMenu icone="message-square" rotulo="Mensagens" ativo={tela === "mensagens"} onPress={() => ir("mensagens")} />
            <ItemMenu icone="credit-card" rotulo="Carteira" ativo={tela === "carteira"} onPress={() => ir("carteira")} />
            <ItemMenu icone="users" rotulo="Conta" ativo={tela === "conta"} onPress={() => ir("conta")} />
          </View>
          <View style={st.ajuda}>
            <Text style={st.ajudaTitulo}>Ajuda</Text>
            <Pressable style={st.ajudaBotao} onPress={() => ir("mensagens")}><Feather name="life-buoy" size={17} color={cor.texto} /><Text style={st.ajudaTexto}>Suporte</Text></Pressable>
            <Pressable style={st.ajudaBotao} onPress={() => ir("treinamento")}><Feather name="play-circle" size={17} color={cor.texto} /><Text style={st.ajudaTexto}>Treinamento</Text></Pressable>
          </View>
          <Text style={st.versao}>{VERSAO}</Text>
        </SafeAreaView>
        <Pressable style={st.menuFundo} onPress={onFechar} accessibilityLabel="Fechar menu" />
      </View>
      </SafeAreaProvider>
    </Modal>
  );
}

// ---------- Atalhos de baixo ----------

const ATALHOS = [
  { tela: "home", rotulo: "Home", icone: "home", fundo: "#fef3c7", corIcone: "#d97706", borda: "#f5c542" },
  { tela: "disponiveis", rotulo: "Disponíveis", icone: "map-pin", fundo: "#dbeafe", corIcone: "#2563eb", borda: "#60a5fa" },
  { tela: "andamento", rotulo: "Em Andamento", icone: "truck", fundo: "#dcfce7", corIcone: "#16a34a", borda: "#4ade80" },
];

function Atalhos({ tela, ir, contagem }) {
  return (
    <View style={[st.atalhos, { pointerEvents: "box-none" }]}>
      {ATALHOS.map(a => (
        <Pressable key={a.tela} onPress={() => ir(a.tela)} style={[st.atalho, tela === a.tela && { borderColor: a.borda, borderWidth: 2 }]} accessibilityRole="button" accessibilityState={{ selected: tela === a.tela }}>
          <View style={[st.atalhoIcone, { backgroundColor: a.fundo }]}>
            <Feather name={a.icone} size={20} color={a.corIcone} />
            {contagem[a.tela] > 0 && <View style={st.contador}><Text style={st.contadorTexto}>{contagem[a.tela]}</Text></View>}
          </View>
          <Text style={st.atalhoTexto}>{a.rotulo}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- Tela principal ----------

function Principal({ entregador, setEntregador, onSair }) {
  const [tela, setTela] = useState("home");
  const [menu, setMenu] = useState(false);
  const [recentralizar, setRecentralizar] = useState(0);
  const op = useOperacao(entregador, setEntregador);
  const { atual, fechar } = useAvisos();
  const ir = t => { setTela(t); setMenu(false); };

  useEffect(() => {
    const atualizar = () => api.get("/me").then(setEntregador).catch(() => {});
    const t = setInterval(atualizar, 60000);
    // Status da conta ao vivo: aprovação, bloqueio, offline automático por falta de sinal...
    const sair = assinarTempoReal(["eu"], atualizar);
    return () => { clearInterval(t); sair(); };
  }, [setEntregador]);

  // No mapa: lojas das corridas disponíveis e, nas entregas em andamento, a loja ou o cliente (conforme a etapa).
  const marcadores = [
    ...op.disponiveis.map(p => { const e = p.comercio?.enderecos?.[0]; return e?.lat != null ? { id: `d-${p.id}`, tipo: "loja", lat: e.lat, lng: e.lng, titulo: p.comercio.nomeFantasia } : null; }),
    ...op.ativos.map(p => {
      if (["ATRIBUIDO", "NA_LOJA"].includes(p.status)) { const e = p.comercio?.enderecos?.[0]; return e?.lat != null ? { id: `a-${p.id}`, tipo: "loja", lat: e.lat, lng: e.lng, titulo: p.comercio.nomeFantasia } : null; }
      return p.latDestino != null ? { id: `a-${p.id}`, tipo: "cliente", lat: p.latDestino, lng: p.lngDestino, titulo: p.clienteNome } : null;
    }),
  ].filter(Boolean);

  return (
    <View style={{ flex: 1, backgroundColor: cor.fundo }}>
      <View style={st.topo}>
        <Pressable onPress={() => setMenu(true)} hitSlop={10} accessibilityLabel="Abrir menu"><Feather name="menu" size={26} color="#fff" /></Pressable>
        <Image source={require("./assets/logo-route-delivery.png")} style={st.topoLogo} resizeMode="contain" accessibilityLabel="Route Delivery" />
        <View style={{ flex: 1 }} />
        <Text style={st.ola} numberOfLines={1}>Olá, {entregador.nomeCompleto?.split(" ")[0]}</Text>
        <Pressable onPress={onSair} style={st.sair} accessibilityRole="button"><Text style={st.sairTexto}>Sair</Text></Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {tela === "home" ? (
          <>
            <Mapa posicao={op.posicao} entregador={entregador} online={op.online} marcadores={marcadores} recentralizar={recentralizar} />
            <View style={[st.sobreMapa, { pointerEvents: "box-none" }]}>
              {entregador.status === "EM_ANALISE" ? (
                <View style={[st.pilula, { backgroundColor: "#92400e" }]}><Feather name="clock" size={18} color="#fff" /><Text style={st.pilulaTexto}>Em análise</Text></View>
              ) : (
                <Pressable onPress={op.alternarOnline} disabled={op.mudandoStatus} style={[st.pilula, { backgroundColor: op.online ? "#16a34a" : "#334155" }]} accessibilityRole="switch" accessibilityState={{ checked: op.online }}>
                  {op.mudandoStatus ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="power" size={18} color="#fff" />}
                  <Text style={st.pilulaTexto}>{op.online ? "Online" : "Offline"}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => ir("carteira")} style={st.ganhos} accessibilityRole="button">
                <Text style={st.ganhosRotulo}>GANHOS</Text>
                <Text style={st.ganhosValor}>{moeda(op.ganhoHoje)}</Text>
              </Pressable>
            </View>
            {(op.aviso || op.erro) && <View style={st.avisoMapa}><Text style={st.avisoMapaTexto}>{op.aviso || op.erro}</Text></View>}
            {op.posicao && (
              <Pressable onPress={() => setRecentralizar(n => n + 1)} style={st.centralizar} accessibilityLabel="Centralizar no meu local">
                <Feather name="navigation" size={20} color="#1e293b" />
              </Pressable>
            )}
          </>
        ) : (
          <View style={{ flex: 1 }}>
            <Text style={st.tituloTela}>{TITULOS[tela]}</Text>
            {tela === "disponiveis" && <ListaDisponiveis op={op} entregador={entregador} onAceitou={() => setTela("andamento")} />}
            {tela === "andamento" && <ListaAndamento op={op} />}
            {tela === "promocao" && <Promocoes />}
            {tela === "mensagens" && <Mensagens />}
            {tela === "carteira" && <Carteira />}
            {tela === "conta" && <Perfil entregador={entregador} onSair={onSair} />}
            {tela === "treinamento" && <Treinamento />}
          </View>
        )}
        {tela !== "mensagens" && <Atalhos tela={tela} ir={ir} contagem={{ disponiveis: op.disponiveis.length, andamento: op.ativos.length }} />}
      </View>

      <MenuLateral aberto={menu} tela={tela} ir={ir} onFechar={() => setMenu(false)} />
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
    reiniciarTempoReal();
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
  raiz: { flex: 1, backgroundColor: "#0f172a" },
  centro: { flex: 1, alignItems: "center", justifyContent: "center" },
  // topo
  topo: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#0f172a" },
  topoLogo: { width: 96, height: 30 },
  ola: { color: "#e2e8f0", fontSize: 15, maxWidth: 150 },
  sair: { backgroundColor: "#1e293b", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  sairTexto: { color: "#fff", fontSize: 15, fontWeight: "600" },
  // sobre o mapa
  sobreMapa: { position: "absolute", zIndex: 10, top: 14, left: 14, right: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  pilula: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, borderWidth: 2, borderColor: "rgba(255,255,255,0.18)", shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  pilulaTexto: { color: "#fff", fontSize: 18, fontWeight: "700" },
  ganhos: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 18, paddingVertical: 9, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  ganhosRotulo: { color: "#475569", fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  ganhosValor: { color: "#0f172a", fontSize: 20, fontWeight: "800" },
  avisoMapa: { position: "absolute", zIndex: 10, top: 80, left: 14, right: 14, backgroundColor: "rgba(15,23,42,0.92)", borderRadius: 10, padding: 10 },
  avisoMapaTexto: { color: "#fcd34d", fontSize: 13 },
  centralizar: { position: "absolute", zIndex: 10, right: 16, bottom: 118, width: 46, height: 46, borderRadius: 23, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, elevation: 5 },
  tituloTela: { color: cor.texto, fontSize: 22, fontWeight: "800", paddingHorizontal: 18, paddingTop: 16 },
  // atalhos
  atalhos: { position: "absolute", zIndex: 10, left: 12, right: 12, bottom: 12, flexDirection: "row", gap: 10 },
  atalho: { flex: 1, backgroundColor: "#fff", borderRadius: 14, paddingVertical: 10, alignItems: "center", gap: 6, borderWidth: 1, borderColor: "#e2e8f0", shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 5 },
  atalhoIcone: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  atalhoTexto: { color: "#0f172a", fontSize: 13, fontWeight: "700" },
  contador: { position: "absolute", top: -4, right: -8, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 5, borderWidth: 2, borderColor: "#fff" },
  contadorTexto: { color: "#fff", fontSize: 11, fontWeight: "800" },
  // menu lateral
  menu: { width: "72%", maxWidth: 320, backgroundColor: "#0f172a", borderRightWidth: 1, borderRightColor: "#1e293b" },
  menuFundo: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  menuTopo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  menuTitulo: { color: "#fff", fontSize: 20, fontWeight: "800" },
  menuLista: { flex: 1, padding: 16, gap: 6 },
  item: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10 },
  itemAtivo: { backgroundColor: "#0ea5e9" },
  itemTexto: { color: cor.texto, fontSize: 17, fontWeight: "600" },
  subLista: { marginLeft: 12, borderLeftWidth: 1, borderLeftColor: "#334155", paddingLeft: 8, gap: 2 },
  subItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8 },
  subItemAtivo: { backgroundColor: "#1e293b" },
  subItemTexto: { color: cor.texto2, fontSize: 15 },
  ajuda: { borderTopWidth: 1, borderTopColor: "#1e293b", padding: 16, gap: 8 },
  ajudaTitulo: { color: cor.texto2, fontSize: 14 },
  ajudaBotao: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#1e293b", paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10 },
  ajudaTexto: { color: cor.texto, fontSize: 15, fontWeight: "600" },
  versao: { color: cor.texto3, textAlign: "center", paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#1e293b" },
});
