// Corridas: o "motor" da operação (online/offline, GPS, listas) e as telas Disponíveis e Em andamento.
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { api } from "../api";
import { assinarTempoReal } from "../tempoReal";
import { Botao, Campo, Cartao, Confirmar, Erro, Selo, Vazio } from "../componentes";
import { ETAPA, cor, enderecoLoja, hora, km } from "../tema";

const INTERVALO_LISTAS_MS = 30000; // reserva: o tempo real (src/tempoReal.js) atualiza em ~2 s
const INTERVALO_POSICAO_MS = 10000;
const INTERVALO_SINAL_MS = 30000; // "sinal de vida" enquanto online (sem sinal por 2 min = offline automático)

function abrirRota(lat, lng, endereco) {
  const destino = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(endereco || "");
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destino}&travelmode=driving`);
}
const ligar = tel => Linking.openURL(`tel:${String(tel).replace(/[^\d+]/g, "")}`);

// ---------- Motor da operação (usado pelo mapa, pelos atalhos e pelas listas) ----------

export function useOperacao(entregador, setEntregador) {
  const [ativos, setAtivos] = useState([]);
  const [disponiveis, setDisponiveis] = useState([]);
  const [posicao, setPosicao] = useState(null);
  const [ganhoHoje, setGanhoHoje] = useState(0);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [mudandoStatus, setMudandoStatus] = useState(false);
  const [aceitando, setAceitando] = useState(null);
  const online = !!entregador?.online;
  const ultimoEnvio = useRef(0);

  const carregar = useCallback(async () => {
    try {
      const [meus, lista] = await Promise.all([
        api.get("/pedidos?status=ATIVOS"),
        online ? api.get("/pedidos/disponiveis") : Promise.resolve([]),
      ]);
      setAtivos(meus);
      setDisponiveis(lista);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  }, [online]);

  const carregarGanho = useCallback(() => api.get("/ganhos").then(g => setGanhoHoje(g?.hoje?.ganho || 0)).catch(() => {}), []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, INTERVALO_LISTAS_MS);
    return () => clearInterval(t);
  }, [carregar]);

  useEffect(() => {
    carregarGanho();
    const t = setInterval(carregarGanho, 60000);
    return () => clearInterval(t);
  }, [carregarGanho]);

  // Tempo real: corridas novas/aceitas por outro e mudanças nas suas entregas (inclusive feitas pelo painel).
  useEffect(() => assinarTempoReal(["disponiveis", "meus"], () => { carregar(); carregarGanho(); }), [carregar, carregarGanho]);

  // Sinal de vida enquanto online: mantém o status "online" mesmo parado (o GPS só avisa quando você se move).
  useEffect(() => {
    if (!online) return;
    const t = setInterval(() => { api.post("/ping").catch(() => {}); }, INTERVALO_SINAL_MS);
    return () => clearInterval(t);
  }, [online]);

  // Posição no mapa: se a permissão já existe, mostra mesmo offline. Online, envia ao sistema (a cada 15 s).
  useEffect(() => {
    let vigia = null;
    let cancelado = false;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync().catch(() => ({ status: "undetermined" }));
      if (status !== "granted" || cancelado) return;
      vigia = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: INTERVALO_POSICAO_MS, distanceInterval: 20 },
        pos => {
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setPosicao(p);
          if (!online || Date.now() - ultimoEnvio.current < INTERVALO_POSICAO_MS) return;
          ultimoEnvio.current = Date.now();
          api.post("/localizacao", p).catch(() => {});
        }
      ).catch(() => null);
      if (cancelado) vigia?.remove();
    })();
    return () => { cancelado = true; vigia?.remove(); };
  }, [online]);

  async function alternarOnline() {
    setErro(null);
    setAviso(null);
    setMudandoStatus(true);
    try {
      let corpo = { online: !online };
      if (!online) {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === "granted") {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
          if (pos) {
            const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setPosicao(p);
            corpo = { ...corpo, ...p };
          }
        } else {
          setAviso("Sem permissão de localização: você fica online, mas sem posição no mapa.");
        }
      }
      setEntregador(await api.patch("/status", corpo));
    } catch (e) {
      setErro(e.message);
    } finally {
      setMudandoStatus(false);
    }
  }

  async function aceitar(p) {
    setAceitando(p.id);
    try {
      await api.patch(`/pedidos/${p.id}/aceitar`);
      await carregar();
      return true;
    } catch (e) {
      setErro(e.message);
      await carregar();
      return false;
    } finally {
      setAceitando(null);
    }
  }

  async function atualizarTudo() {
    await Promise.all([carregar(), carregarGanho()]);
  }

  return { ativos, disponiveis, posicao, ganhoHoje, erro, setErro, aviso, online, mudandoStatus, aceitando, alternarOnline, aceitar, atualizarTudo };
}

// ---------- Cartões ----------

function InfoLinha({ rotulo, valor, destaque }) {
  if (!valor) return null;
  return (
    <View style={st.linha}>
      <Text style={st.linhaRotulo}>{rotulo}</Text>
      <Text style={[st.linhaValor, destaque && { color: cor.texto, fontWeight: "700" }]}>{valor}</Text>
    </View>
  );
}

function EntregaAtiva({ p, onAtualizar, onErro }) {
  const [ocupado, setOcupado] = useState(false);
  const [desistir, setDesistir] = useState(false);
  const [motivo, setMotivo] = useState("");
  const etapa = ETAPA[p.status];
  const loja = p.comercio?.enderecos?.[0];
  const indoParaLoja = ["ATRIBUIDO", "NA_LOJA"].includes(p.status);

  async function avancar() {
    setOcupado(true);
    try {
      if (etapa.proxima === "ENTREGUE") await api.patch(`/pedidos/${p.id}/finalizar`);
      else await api.patch(`/pedidos/${p.id}/etapa`, { status: etapa.proxima });
      await onAtualizar();
    } catch (e) {
      onErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarDesistencia() {
    setDesistir(false);
    try {
      await api.patch(`/pedidos/${p.id}/desistir`, { motivo: motivo.trim() || undefined });
      setMotivo("");
      await onAtualizar();
    } catch (e) {
      onErro(e.message);
    }
  }

  return (
    <Cartao estilo={{ borderColor: p.status === "ATRASADO" ? cor.critico : cor.primaria }}>
      <View style={st.topoCartao}>
        <Text style={st.codigo}>{p.codigo}</Text>
        <Selo texto={etapa?.rotulo || p.status} corFundo={p.status === "ATRASADO" ? "rgba(239,68,68,0.18)" : "rgba(42,120,214,0.2)"} corTexto={p.status === "ATRASADO" ? "#fca5a5" : cor.primariaClara} />
      </View>
      <View style={[st.etapaBloco, indoParaLoja && st.etapaAtual]}>
        <Text style={st.etapaTitulo}>🏪 Coleta · {p.comercio?.nomeFantasia}</Text>
        <Text style={st.etapaTexto}>{enderecoLoja(p.comercio) || "Endereço da loja não informado"}</Text>
      </View>
      <View style={[st.etapaBloco, !indoParaLoja && st.etapaAtual]}>
        <Text style={st.etapaTitulo}>📍 Entrega · {p.clienteNome}</Text>
        <Text style={st.etapaTexto}>{p.endereco}</Text>
        {p.complemento ? <Text style={st.etapaTexto}>{p.complemento}</Text> : null}
        {p.retorno ? <Text style={[st.etapaTexto, { color: cor.aviso, fontWeight: "700" }]}>↩ Com retorno: volte à loja depois de entregar</Text> : null}
      </View>
      <InfoLinha rotulo="Distância" valor={p.distanciaKm != null ? km(p.distanciaKm) : null} />
      <InfoLinha rotulo="Pagamento" valor={p.formaPagamento} />
      <InfoLinha rotulo="Observação" valor={p.observacao} destaque />
      {etapa && <Botao titulo={etapa.botao} variante={etapa.proxima === "ENTREGUE" ? "sucesso" : "primario"} onPress={avancar} carregando={ocupado} />}
      <View style={st.acoes}>
        {indoParaLoja
          ? <Botao pequeno variante="secundario" titulo="Rota até a loja" onPress={() => abrirRota(loja?.lat, loja?.lng, enderecoLoja(p.comercio))} estilo={st.acao} />
          : <Botao pequeno variante="secundario" titulo="Rota até o cliente" onPress={() => abrirRota(p.latDestino, p.lngDestino, p.endereco)} estilo={st.acao} />}
        {indoParaLoja && p.comercio?.telefone ? <Botao pequeno variante="secundario" titulo="Ligar p/ loja" onPress={() => ligar(p.comercio.telefone)} estilo={st.acao} /> : null}
        {!indoParaLoja && p.clienteTelefone ? <Botao pequeno variante="secundario" titulo="Ligar p/ cliente" onPress={() => ligar(p.clienteTelefone)} estilo={st.acao} /> : null}
      </View>
      <Botao pequeno variante="fantasma" titulo="Desistir desta corrida" onPress={() => setDesistir(true)} />
      <Confirmar visivel={desistir} titulo="Desistir da corrida?" texto="O pedido volta para a fila e outro entregador poderá aceitar." rotuloOk="Desistir" variante="perigo" onOk={confirmarDesistencia} onCancelar={() => setDesistir(false)}>
        <Campo rotulo="Motivo (opcional)" value={motivo} onChangeText={setMotivo} placeholder="Ex.: pneu furou" />
      </Confirmar>
    </Cartao>
  );
}

function Disponivel({ p, onAceitar, ocupado }) {
  return (
    <Cartao>
      <View style={st.topoCartao}>
        <Text style={st.codigo}>{p.comercio?.nomeFantasia}</Text>
        {p.distanciaAteColetaKm != null && <Selo texto={`${km(p.distanciaAteColetaKm)} de você`} />}
      </View>
      <InfoLinha rotulo="Coleta" valor={enderecoLoja(p.comercio)} />
      <InfoLinha rotulo="Entrega" valor={p.complemento ? `${p.endereco} · ${p.complemento}` : p.endereco} />
      {p.retorno ? <InfoLinha rotulo="Retorno" valor="Sim — volta à loja depois de entregar" /> : null}
      <InfoLinha rotulo="Percurso" valor={p.distanciaKm != null ? km(p.distanciaKm) : null} />
      <InfoLinha rotulo="Pronto desde" valor={hora(p.prontoEm || p.updatedAt)} />
      <Botao titulo="Aceitar corrida" variante="sucesso" onPress={() => onAceitar(p)} carregando={ocupado} />
    </Cartao>
  );
}

// ---------- Telas ----------

function useRecarregar(fn) {
  const [atualizando, setAtualizando] = useState(false);
  return <RefreshControl refreshing={atualizando} onRefresh={async () => { setAtualizando(true); await fn(); setAtualizando(false); }} tintColor={cor.texto2} />;
}

export function ListaDisponiveis({ op, entregador, onAceitou }) {
  const refresh = useRecarregar(op.atualizarTudo);
  const emAnalise = entregador?.status === "EM_ANALISE";
  return (
    <ScrollView contentContainerStyle={st.tela} refreshControl={refresh}>
      <Erro texto={op.erro} />
      {emAnalise && <Vazio titulo="Cadastro em análise" texto="Assim que a equipe aprovar, você poderá ficar online e aceitar corridas." />}
      {!emAnalise && !op.online && (
        <Cartao>
          <Text style={st.codigo}>Você está offline</Text>
          <Text style={st.ajuda}>Fique online para ver as corridas disponíveis perto de você.</Text>
          <Botao titulo="Ficar online" variante="sucesso" onPress={op.alternarOnline} carregando={op.mudandoStatus} />
        </Cartao>
      )}
      {op.online && op.disponiveis.length === 0 && <Vazio titulo="Nenhuma corrida no momento" texto="A lista atualiza sozinha a cada 10 segundos." />}
      {op.online && op.disponiveis.map(p => (
        <Disponivel key={p.id} p={p} ocupado={op.aceitando === p.id} onAceitar={async x => { if (await op.aceitar(x)) onAceitou?.(); }} />
      ))}
    </ScrollView>
  );
}

export function ListaAndamento({ op }) {
  const refresh = useRecarregar(op.atualizarTudo);
  return (
    <ScrollView contentContainerStyle={st.tela} refreshControl={refresh}>
      <Erro texto={op.erro} />
      {op.ativos.length === 0 && <Vazio titulo="Nenhuma entrega em andamento" texto="Aceite uma corrida em Disponíveis para começar." />}
      {op.ativos.map(p => <EntregaAtiva key={p.id} p={p} onAtualizar={op.atualizarTudo} onErro={op.setErro} />)}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  tela: { padding: 16, gap: 12, paddingBottom: 120, maxWidth: 560, width: "100%", alignSelf: "center" },
  ajuda: { color: cor.texto2, fontSize: 14, lineHeight: 20 },
  topoCartao: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  codigo: { color: cor.texto, fontSize: 17, fontWeight: "800", flexShrink: 1 },
  etapaBloco: { borderLeftWidth: 3, borderLeftColor: cor.borda, paddingLeft: 10, gap: 2, opacity: 0.7 },
  etapaAtual: { borderLeftColor: cor.primariaClara, opacity: 1 },
  etapaTitulo: { color: cor.texto, fontSize: 15, fontWeight: "700" },
  etapaTexto: { color: cor.texto2, fontSize: 14 },
  linha: { flexDirection: "row", gap: 8 },
  linhaRotulo: { color: cor.texto3, fontSize: 13, width: 92 },
  linhaValor: { color: cor.texto2, fontSize: 14, flex: 1 },
  acoes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  acao: { flexGrow: 1 },
});
