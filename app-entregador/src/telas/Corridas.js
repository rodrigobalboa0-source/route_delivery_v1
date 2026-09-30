// Corridas: o "motor" da operação (online/offline, GPS, listas) e as telas Disponíveis e Em andamento.
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Linking, Modal, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { pararAlarme, tocarAlarme } from "../alarme";
import * as Location from "expo-location";
import { api } from "../api";
import { assinarTempoReal } from "../tempoReal";
import { Botao, Campo, Cartao, Confirmar, Erro, Selo, Vazio } from "../componentes";
import { ETAPA, cor, enderecoLoja, hora, km, moeda } from "../tema";

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
  const [novas, setNovas] = useState([]); // corridas que acabaram de aparecer (pop-up Aceitar/Recusar)
  const online = !!entregador?.online;
  const ultimoEnvio = useRef(0);
  const vistas = useRef(null); // ids já mostrados (null = primeira carga: não avisa as que já estavam lá)

  const carregar = useCallback(async () => {
    try {
      const [meus, lista] = await Promise.all([
        api.get("/pedidos?status=ATIVOS"),
        online ? api.get("/pedidos/disponiveis") : Promise.resolve([]),
      ]);
      setAtivos(meus);
      setDisponiveis(lista);
      // Corrida nova (inclusive agendada que chegou no horário): entra na fila do pop-up.
      if (online) {
        if (vistas.current) {
          const chegaram = lista.filter(p => !vistas.current.has(p.id));
          if (chegaram.length) setNovas(f => [...f, ...chegaram.filter(p => !f.some(x => x.id === p.id))]);
        }
        vistas.current = new Set([...(vistas.current || []), ...lista.map(p => p.id)]);
      } else {
        vistas.current = null;
      }
      // Some do pop-up o que já não está disponível (outro entregador aceitou, loja cancelou...).
      setNovas(f => f.filter(p => lista.some(x => x.id === p.id)));
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

  async function recusar(p) {
    setNovas(f => f.filter(x => x.id !== p.id));
    setDisponiveis(l => l.filter(x => x.id !== p.id));
    try {
      await api.post(`/pedidos/${p.id}/recusar`);
    } catch (e) {
      setErro(e.message);
    }
    carregar();
  }

  // Fecha o pop-up sem decidir (a corrida continua em Disponíveis).
  const depois = p => setNovas(f => f.filter(x => x.id !== p.id));

  async function atualizarTudo() {
    await Promise.all([carregar(), carregarGanho()]);
  }

  return {
    ativos, disponiveis, posicao, ganhoHoje, erro, setErro, aviso, online, mudandoStatus, aceitando, alternarOnline, aceitar, recusar, atualizarTudo,
    raio: entregador?.raioConfirmacaoMetros || 200,
    novaCorrida: novas[0] || null, depois,
  };
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

// Posição do GPS na hora do toque (a etapa só é aceita perto da loja / do cliente).
async function posicaoAgora() {
  const perm = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: "denied" }));
  if (perm.status !== "granted") throw new Error("Permita o acesso à localização para confirmar a etapa.");
  const pos = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("O GPS demorou para responder. Vá para um lugar aberto e tente de novo.")), 20000)),
  ]);
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, precisao: pos.coords.accuracy };
}

function EntregaAtiva({ p, onAtualizar, onErro }) {
  const [ocupado, setOcupado] = useState(false);
  const etapa = ETAPA[p.status];
  const loja = p.comercio?.enderecos?.[0];
  const indoParaLoja = ["ATRIBUIDO", "NA_LOJA"].includes(p.status);

  const [pedirCodigo, setPedirCodigo] = useState(false);
  const [codigoEntrega, setCodigoEntrega] = useState("");

  async function avancar(codigo) {
    // iFood: finalizar exige o código de entrega que o cliente informa.
    if (etapa.proxima === "ENTREGUE" && p.exigeCodigoEntrega && !codigo) { setPedirCodigo(true); return; }
    setPedirCodigo(false);
    setOcupado(true);
    try {
      const local = await posicaoAgora();
      if (etapa.proxima === "ENTREGUE") await api.patch(`/pedidos/${p.id}/finalizar`, { ...local, ...(codigo ? { codigoEntrega: codigo } : {}) });
      else await api.patch(`/pedidos/${p.id}/etapa`, { status: etapa.proxima, ...local });
      await onAtualizar();
    } catch (e) {
      // iFood passou a exigir o código de entrega: abre o campo do código (ou avisa que o código está errado).
      if (e.dados?.codigo === "CODIGO_ENTREGA") {
        setPedirCodigo(true);
        if (codigo) onErro(e.message);
      } else onErro(e.message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Cartao estilo={{ borderColor: p.status === "ATRASADO" ? cor.critico : cor.primaria }}>
      <View style={st.topoCartao}>
        <Text style={st.codigo}>{p.codigo}{p.codigoExterno ? <Text style={st.externo}>  {p.codigoExterno}</Text> : null}</Text>
        {p.status !== "ATRIBUIDO" && (
          <Selo texto={etapa?.rotulo || p.status} corFundo={p.status === "ATRASADO" ? "rgba(239,68,68,0.18)" : "rgba(42,120,214,0.2)"} corTexto={p.status === "ATRASADO" ? "#fca5a5" : cor.primariaClara} />
        )}
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
      <Ganho p={p} />
      <Km p={p} />
      <InfoLinha rotulo="Pagamento" valor={p.formaPagamento} />
      {p.codigoLoja ? <Text style={st.avisoCodigo}>🔒 Para finalizar, peça ao cliente os 4 últimos números do telefone dele.</Text> : null}
      {/* Observação da loja: só aparece quando a loja escreveu alguma. */}
      {p.observacao?.trim() ? (
        <View style={st.obs}>
          <Text style={st.obsTitulo}>📝 Observação da loja</Text>
          <Text style={st.obsTexto}>{p.observacao.trim()}</Text>
        </View>
      ) : null}
      {etapa && <Botao titulo={etapa.botao} variante={etapa.proxima === "ENTREGUE" ? "sucesso" : "primario"} onPress={() => avancar()} carregando={ocupado} />}
      <Confirmar
        visivel={pedirCodigo}
        titulo={p.codigoLoja ? "Código de entrega" : "Código de entrega do iFood"}
        texto={p.codigoLoja
          ? "Peça ao cliente os 4 últimos números do telefone dele e digite abaixo."
          : "Peça ao cliente o código de entrega que aparece no app do iFood dele e digite abaixo."}
        rotuloOk="Finalizar entrega"
        variante="sucesso"
        onOk={() => avancar(codigoEntrega.trim())}
        onCancelar={() => setPedirCodigo(false)}
      >
        <Campo rotulo={p.codigoLoja ? "4 últimos números do telefone" : "Código"} value={codigoEntrega} onChangeText={t => setCodigoEntrega(t.replace(/\D/g, "").slice(0, p.codigoLoja ? 4 : 8))} keyboardType="number-pad" autoFocus placeholder="Ex.: 1234" />
      </Confirmar>
      <View style={st.acoes}>
        {indoParaLoja
          ? <Botao pequeno variante="secundario" titulo="Rota até a loja" onPress={() => abrirRota(loja?.lat, loja?.lng, enderecoLoja(p.comercio))} estilo={st.acao} />
          : <Botao pequeno variante="secundario" titulo="Rota até o cliente" onPress={() => abrirRota(p.latDestino, p.lngDestino, p.endereco)} estilo={st.acao} />}
        {indoParaLoja && p.comercio?.telefone ? <Botao pequeno variante="secundario" titulo="Ligar p/ loja" onPress={() => ligar(p.comercio.telefone)} estilo={st.acao} /> : null}
        {!indoParaLoja && p.clienteTelefone ? <Botao pequeno variante="secundario" titulo="Ligar p/ cliente" onPress={() => ligar(p.clienteTelefone)} estilo={st.acao} /> : null}
      </View>
    </Cartao>
  );
}

// "Você ganha R$ 8,50" (comissão da tabela, padrão do veículo ou repasse fixo; com o adicional de retorno).
function Ganho({ p }) {
  if (p.ganhoEntregador == null) return null;
  return (
    <View style={st.ganho}>
      <Text style={st.ganhoRotulo}>Você ganha</Text>
      <Text style={st.ganhoValor}>{moeda(p.ganhoEntregador)}</Text>
    </View>
  );
}

// Km da entrega: só da loja até o cliente (rota calculada; sem ela, estimativa marcada com ≈).
function Km({ p }) {
  const entrega = p.kmEntrega ?? p.distanciaKm ?? null;
  if (entrega == null) {
    return (
      <View style={st.kmItem}>
        <Text style={st.kmValor}>— km</Text>
        <Text style={st.kmRotulo}>endereço do cliente sem localização no mapa</Text>
      </View>
    );
  }
  return (
    <View style={st.kmItem}>
      <Text style={st.kmValor}>{p.kmEstimado ? "≈ " : ""}{km(entrega)}</Text>
      <Text style={st.kmRotulo}>da loja até o cliente{p.kmEstimado ? " (aprox.)" : ""}</Text>
    </View>
  );
}

// Foto (logo) da loja; sem foto, a inicial do nome.
function FotoLoja({ comercio, tamanho = 48 }) {
  const estilo = { width: tamanho, height: tamanho, borderRadius: tamanho / 4 };
  if (comercio?.fotoUrl) return <Image source={{ uri: comercio.fotoUrl }} style={[st.fotoLoja, estilo]} resizeMode="cover" accessibilityLabel={`Foto de ${comercio.nomeFantasia}`} />;
  return (
    <View style={[st.fotoLoja, st.fotoLojaVazia, estilo]}>
      <Text style={st.fotoLojaInicial}>{(comercio?.nomeFantasia || "?").trim()[0]?.toUpperCase()}</Text>
    </View>
  );
}

function TopoLoja({ p }) {
  return (
    <View style={st.topoLoja}>
      <FotoLoja comercio={p.comercio} />
      <Text style={[st.codigo, { flex: 1 }]} numberOfLines={2}>{p.comercio?.nomeFantasia}</Text>
    </View>
  );
}

function DadosCorrida({ p }) {
  return (
    <>
      <Ganho p={p} />
      <Km p={p} />
      <InfoLinha rotulo="Coleta" valor={enderecoLoja(p.comercio)} />
      <InfoLinha rotulo="Entrega" valor={p.complemento ? `${p.endereco} · ${p.complemento}` : p.endereco} />
      {p.retorno ? <InfoLinha rotulo="Retorno" valor="Sim — volta à loja depois de entregar" destaque /> : null}
      {p.agendadoPara ? <InfoLinha rotulo="Agendada" valor={`para ${hora(p.agendadoPara)}`} /> : null}
    </>
  );
}

function Disponivel({ p, onAceitar, onRecusar, ocupado }) {
  return (
    <Cartao>
      <TopoLoja p={p} />
      <DadosCorrida p={p} />
      <View style={st.acoes}>
        <Botao titulo="Recusar" variante="perigo" onPress={() => onRecusar(p)} estilo={{ flex: 1 }} />
        <Botao titulo="Aceitar corrida" variante="sucesso" onPress={() => onAceitar(p)} carregando={ocupado} estilo={{ flex: 2 }} />
      </View>
    </Cartao>
  );
}

// Pop-up "Nova corrida" (qualquer tela): Aceitar ou Recusar. Fecha sozinho em 45 s (continua em Disponíveis).
export function PopupCorrida({ op, onAceitou }) {
  const p = op.novaCorrida;
  const [resta, setResta] = useState(45);
  // Alarme tocando enquanto o aviso estiver aberto (para ao aceitar, recusar, "decidir depois" ou em 45 s).
  useEffect(() => {
    if (!p) return;
    tocarAlarme();
    return () => pararAlarme();
  }, [p?.id]);
  useEffect(() => {
    if (!p) return;
    setResta(45);
    const t = setInterval(() => setResta(s => {
      if (s <= 1) { clearInterval(t); op.depois(p); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => op.depois(p)}>
      <View style={st.popFundo}>
        <View style={st.pop}>
          <View style={st.popFaixa}><Text style={st.popFaixaTexto}>🔔 Nova corrida{p.agendadoPara ? " (agendada)" : ""}</Text><Text style={st.popTempo}>{resta}s</Text></View>
          <View style={{ padding: 18, gap: 10 }}>
            <TopoLoja p={p} />
            <DadosCorrida p={p} />
            <View style={st.acoes}>
              <Botao titulo="Recusar" variante="perigo" onPress={() => op.recusar(p)} estilo={{ flex: 1 }} />
              <Botao titulo="Aceitar" variante="sucesso" carregando={op.aceitando === p.id} estilo={{ flex: 2 }}
                onPress={async () => { const ok = await op.aceitar(p); op.depois(p); if (ok) onAceitou?.(); }} />
            </View>
            <Botao pequeno variante="fantasma" titulo="Decidir depois" onPress={() => op.depois(p)} />
          </View>
        </View>
      </View>
    </Modal>
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
        <Disponivel key={p.id} p={p} ocupado={op.aceitando === p.id} onRecusar={op.recusar} onAceitar={async x => { if (await op.aceitar(x)) onAceitou?.(); }} />
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
  distancia: { color: cor.aviso, fontSize: 14, fontWeight: "600" },
  externo: { color: "#ea1d2c", fontSize: 14, fontWeight: "800" },
  kmItem: { backgroundColor: cor.superficie2, borderRadius: 10, paddingVertical: 8, alignItems: "center", borderWidth: 1, borderColor: cor.primariaClara },
  topoLoja: { flexDirection: "row", alignItems: "center", gap: 12 },
  fotoLoja: { backgroundColor: cor.superficie2, borderWidth: 1, borderColor: cor.borda },
  fotoLojaVazia: { alignItems: "center", justifyContent: "center" },
  fotoLojaInicial: { color: cor.texto, fontSize: 20, fontWeight: "800" },
  obs: { backgroundColor: "rgba(245,165,36,0.12)", borderColor: "rgba(245,165,36,0.45)", borderWidth: 1, borderRadius: 10, padding: 10, gap: 3 },
  obsTitulo: { color: cor.aviso, fontSize: 13, fontWeight: "800" },
  obsTexto: { color: cor.texto, fontSize: 15, lineHeight: 21 },
  avisoCodigo: { color: cor.texto2, fontSize: 13, lineHeight: 18 },
  kmValor: { color: cor.texto, fontSize: 17, fontWeight: "800" },
  kmRotulo: { color: cor.texto3, fontSize: 12 },
  ganho: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.4)", borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  ganhoRotulo: { color: cor.texto2, fontSize: 14, fontWeight: "600" },
  ganhoValor: { color: cor.ok, fontSize: 20, fontWeight: "800" },
  popFundo: { flex: 1, backgroundColor: "rgba(3,8,18,0.75)", justifyContent: "flex-end", padding: 14 },
  pop: { backgroundColor: cor.superficie, borderRadius: 18, borderWidth: 2, borderColor: cor.ok, overflow: "hidden", maxWidth: 520, width: "100%", alignSelf: "center" },
  popFaixa: { backgroundColor: cor.ok, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  popFaixaTexto: { color: "#04210f", fontSize: 17, fontWeight: "800" },
  popTempo: { color: "#04210f", fontSize: 14, fontWeight: "700" },
});
