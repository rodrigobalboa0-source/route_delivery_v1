// Corridas: ficar online (envia a localização), entregas em andamento com as etapas e corridas disponíveis.
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { api } from "../api";
import { Botao, Campo, Cartao, Confirmar, Erro, Selo, Vazio } from "../componentes";
import { ETAPA, cor, enderecoLoja, hora, km } from "../tema";

const INTERVALO_LISTAS_MS = 10000;
const INTERVALO_POSICAO_MS = 15000;

function abrirRota(lat, lng, endereco) {
  const destino = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(endereco || "");
  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${destino}&travelmode=driving`);
}
const ligar = tel => Linking.openURL(`tel:${String(tel).replace(/[^\d+]/g, "")}`);

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
      <InfoLinha rotulo="Entrega" valor={p.endereco} />
      <InfoLinha rotulo="Percurso" valor={p.distanciaKm != null ? km(p.distanciaKm) : null} />
      <InfoLinha rotulo="Pronto desde" valor={hora(p.prontoEm || p.updatedAt)} />
      <Botao titulo="Aceitar corrida" variante="sucesso" onPress={() => onAceitar(p)} carregando={ocupado} />
    </Cartao>
  );
}

export default function Corridas({ entregador, setEntregador }) {
  const [ativos, setAtivos] = useState([]);
  const [disponiveis, setDisponiveis] = useState([]);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const [mudandoStatus, setMudandoStatus] = useState(false);
  const [aceitando, setAceitando] = useState(null);
  const online = !!entregador?.online;
  const emAnalise = entregador?.status === "EM_ANALISE";
  const vigia = useRef(null);
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

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, INTERVALO_LISTAS_MS);
    return () => clearInterval(t);
  }, [carregar]);

  // Enquanto online, acompanha a posição e envia ao sistema (no máximo a cada 15 s).
  useEffect(() => {
    let cancelado = false;
    async function iniciar() {
      if (!online) return;
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted" || cancelado) return;
      vigia.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: INTERVALO_POSICAO_MS, distanceInterval: 30 },
        pos => {
          if (Date.now() - ultimoEnvio.current < INTERVALO_POSICAO_MS) return;
          ultimoEnvio.current = Date.now();
          api.post("/localizacao", { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
        }
      );
    }
    iniciar();
    return () => {
      cancelado = true;
      vigia.current?.remove();
      vigia.current = null;
    };
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
          if (pos) corpo = { ...corpo, lat: pos.coords.latitude, lng: pos.coords.longitude };
        } else {
          setAviso("Sem permissão de localização: você aparece online, mas sem posição no mapa e sem corridas próximas ordenadas.");
        }
      }
      const r = await api.patch("/status", corpo);
      setEntregador(r);
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
    } catch (e) {
      setErro(e.message);
      await carregar();
    } finally {
      setAceitando(null);
    }
  }

  async function puxar() {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }

  return (
    <ScrollView contentContainerStyle={st.tela} refreshControl={<RefreshControl refreshing={atualizando} onRefresh={puxar} tintColor={cor.texto2} />}>
      <Cartao estilo={[st.statusCartao, online && { borderColor: cor.ok }]}>
        <View style={st.statusLinha}>
          <View style={[st.bolinha, { backgroundColor: online ? cor.ok : cor.texto3 }]} />
          <Text style={st.statusTexto}>{online ? "Você está online" : "Você está offline"}</Text>
        </View>
        {emAnalise
          ? <Text style={st.ajuda}>Seu cadastro está em análise. Assim que a equipe aprovar, você poderá ficar online e aceitar corridas.</Text>
          : <Text style={st.ajuda}>{online ? "Recebendo corridas próximas. Sua posição aparece no mapa da operação." : "Fique online para ver e aceitar corridas."}</Text>}
        {!emAnalise && (
          <Botao titulo={online ? "Ficar offline" : "Ficar online"} variante={online ? "secundario" : "sucesso"} onPress={alternarOnline} carregando={mudandoStatus} />
        )}
        {aviso && <Text style={st.aviso}>{aviso}</Text>}
      </Cartao>

      <Erro texto={erro} />

      {ativos.length > 0 && <Text style={st.secao}>Suas entregas ({ativos.length})</Text>}
      {ativos.map(p => <EntregaAtiva key={p.id} p={p} onAtualizar={carregar} onErro={setErro} />)}

      {online && (
        <>
          <Text style={st.secao}>Corridas disponíveis</Text>
          {disponiveis.length === 0
            ? <Vazio titulo="Nenhuma corrida no momento" texto="A lista atualiza sozinha a cada 10 segundos." />
            : disponiveis.map(p => <Disponivel key={p.id} p={p} onAceitar={aceitar} ocupado={aceitando === p.id} />)}
        </>
      )}
      {Platform.OS === "web" && <Text style={st.rodape}>Versão de teste no navegador</Text>}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  tela: { padding: 16, gap: 12, paddingBottom: 32, maxWidth: 560, width: "100%", alignSelf: "center" },
  statusCartao: { gap: 12 },
  statusLinha: { flexDirection: "row", alignItems: "center", gap: 10 },
  bolinha: { width: 12, height: 12, borderRadius: 6 },
  statusTexto: { color: cor.texto, fontSize: 19, fontWeight: "800" },
  ajuda: { color: cor.texto2, fontSize: 14, lineHeight: 20 },
  aviso: { color: cor.aviso, fontSize: 13, lineHeight: 18 },
  secao: { color: cor.texto2, fontSize: 13, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginTop: 6 },
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
  rodape: { color: cor.texto3, textAlign: "center", fontSize: 12, marginTop: 8 },
});
