// App do Entregador — Route Delivery.
// Home com mapa em tela cheia (online/offline e ganhos por cima), atalhos Home/Disponíveis/Em Andamento
// embaixo e menu lateral (Entregas, Mensagens, Carteira, Conta, Ajuda). Conecta no mesmo sistema do painel ADM.
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api, carregarToken, quandoSessaoExpirar, salvarToken } from "./src/api";
import { assinarTempoReal, reiniciarTempoReal } from "./src/tempoReal";
import { Confirmar, PopupAviso } from "./src/componentes";
import { cor, moeda } from "./src/tema";
import Mapa from "./src/mapa/Mapa";
import Entrada from "./src/telas/Entrada";
import { registrarPush, useToqueNotificacao } from "./src/notificacoes";
import { pararRastreioFundo } from "./src/localizacaoFundo"; // também registra a tarefa de localização em segundo plano
import { ListaAndamento, ListaDisponiveis, PopupCorrida, useOperacao } from "./src/telas/Corridas";
import { Mensagens, Perfil, Promocoes, Treinamento } from "./src/telas/Outras";
import { Carteira } from "./src/telas/Carteira";
import Ranking from "./src/telas/Ranking";

const VERSAO = "v1.5.0";
const TITULOS = {
  home: "Home", disponiveis: "Disponíveis", andamento: "Em andamento", promocao: "Promoção",
  mensagens: "Mensagens", carteira: "Carteira", conta: "Conta", treinamento: "Treinamento", ranking: "Ranking",
};

// Atualização automática (EAS Update): ao abrir o app e ao voltar para ele, baixa a versão nova
// publicada e reinicia sozinho — o entregador não precisa instalar nada. (No navegador, o Vercel já serve a última versão.)
function useAtualizacaoAutomatica() {
  useEffect(() => {
    if (Platform.OS === "web" || __DEV__) return;
    let Updates;
    try { Updates = require("expo-updates"); } catch { return; }
    if (!Updates?.isEnabled) return;
    let verificando = false;
    const verificar = async () => {
      if (verificando) return;
      verificando = true;
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // sem internet ou servidor fora: tenta de novo na próxima vez
      } finally {
        verificando = false;
      }
    };
    verificar();
    const sub = AppState.addEventListener("change", s => { if (s === "active") verificar(); });
    const t = setInterval(verificar, 30 * 60 * 1000);
    return () => { sub.remove(); clearInterval(t); };
  }, []);
}

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
            <ItemMenu icone="award" rotulo="Ranking" ativo={tela === "ranking"} onPress={() => ir("ranking")} />
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

// Celular deitado: barra baixa (ícone ao lado do texto) para não cobrir as corridas.
function Atalhos({ tela, ir, contagem }) {
  const { width, height } = useWindowDimensions();
  const deitado = width > height;
  return (
    <View style={[st.atalhos, deitado && st.atalhosDeitado, { pointerEvents: "box-none" }]}>
      {ATALHOS.map(a => (
        <Pressable key={a.tela} onPress={() => ir(a.tela)} style={[st.atalho, deitado && st.atalhoDeitado, tela === a.tela && { borderColor: a.borda, borderWidth: 2 }]} accessibilityRole="button" accessibilityState={{ selected: tela === a.tela }}>
          <View style={[st.atalhoIcone, deitado && st.atalhoIconeDeitado, { backgroundColor: a.fundo }]}>
            <Feather name={a.icone} size={deitado ? 16 : 20} color={a.corIcone} />
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
  const ir = useCallback(t => { setTela(t); setMenu(false); }, []);
  useToqueNotificacao(ir);

  // Notificações no celular (novas corridas, promoções e taxas): registra este aparelho ao entrar.
  useEffect(() => { registrarPush(); }, []);

  useEffect(() => {
    const atualizar = () => api.get("/me").then(setEntregador).catch(() => {});
    atualizar();
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
            {/* A Carteira tem o próprio cabeçalho ("Carteira / Extrato" + Retirar saldo). */}
            {tela !== "carteira" && <Text style={st.tituloTela}>{TITULOS[tela]}</Text>}
            {tela === "disponiveis" && <ListaDisponiveis op={op} entregador={entregador} onAceitou={() => setTela("andamento")} />}
            {tela === "andamento" && <ListaAndamento op={op} />}
            {tela === "promocao" && <Promocoes />}
            {tela === "mensagens" && <Mensagens />}
            {tela === "carteira" && <Carteira />}
            {tela === "conta" && <Perfil entregador={entregador} setEntregador={setEntregador} onSair={onSair} localizacao={op.localizacao} onPermitirTempoTodo={op.permitirTempoTodo} />}
            {tela === "treinamento" && <Treinamento />}
            {tela === "ranking" && <Ranking />}
          </View>
        )}
        {tela !== "mensagens" && <Atalhos tela={tela} ir={ir} contagem={{ disponiveis: op.ofertas.length, andamento: op.ativos.length }} />}
      </View>

      <MenuLateral aberto={menu} tela={tela} ir={ir} onFechar={() => setMenu(false)} />
      <PopupAviso aviso={atual} onFechar={fechar} />
      <Confirmar
        visivel={!atual && op.pedirTempoTodo}
        titulo="Permitir localização o tempo todo"
        texto={"Para a loja e a equipe acompanharem suas entregas mesmo com o app minimizado ou a tela bloqueada, o Route Entregador usa sua localização em segundo plano enquanto você está online.\n\nNa próxima tela, toque em Localização › “Permitir o tempo todo”. Ao ficar offline, o envio para."}
        rotuloOk="Permitir o tempo todo"
        onOk={op.permitirTempoTodo}
        onCancelar={op.agoraNaoTempoTodo}
      />
      {!atual && !menu && <PopupCorrida op={op} onAceitou={() => setTela("andamento")} />}
    </View>
  );
}

export default function App() {
  const [carregando, setCarregando] = useState(true);
  const [entregador, setEntregador] = useState(null);
  const [aviso, setAviso] = useState(null); // motivo de ter voltado ao login (ex.: conta aberta em outro celular)
  useAtualizacaoAutomatica();

  // Sair: fica offline e libera este celular (a conta pode entrar em outro aparelho).
  const sair = useCallback(async () => {
    await pararRastreioFundo();
    await api.post("/sair").catch(() => {});
    await salvarToken(null);
    reiniciarTempoReal();
    setAviso(null);
    setEntregador(null);
  }, []);

  useEffect(() => {
    quandoSessaoExpirar(msg => { pararRastreioFundo(); salvarToken(null); reiniciarTempoReal(); setAviso(msg || null); setEntregador(null); });
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
            : <Entrada onEntrou={e => { setAviso(null); setEntregador(e); }} aviso={aviso} />}
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
  atalhosDeitado: { bottom: 8, gap: 8 },
  atalhoDeitado: { flexDirection: "row", justifyContent: "center", paddingVertical: 6, gap: 8, borderRadius: 12 },
  atalhoIconeDeitado: { width: 30, height: 30, borderRadius: 15 },
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
