// Componentes visuais reutilizados pelas telas do app.
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { cor } from "./tema";

export function Botao({ titulo, onPress, variante = "primario", desabilitado, carregando, pequeno, estilo }) {
  const v = VARIANTES[variante] || VARIANTES.primario;
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado || carregando}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.botao, pequeno && s.botaoPequeno, { backgroundColor: v.fundo, borderColor: v.borda },
        (desabilitado || carregando) && { opacity: 0.5 }, pressed && { opacity: 0.8 }, estilo,
      ]}
    >
      {carregando ? <ActivityIndicator color={v.texto} /> : <Text style={[s.botaoTexto, pequeno && s.botaoTextoPequeno, { color: v.texto }]}>{titulo}</Text>}
    </Pressable>
  );
}
const VARIANTES = {
  primario: { fundo: cor.primaria, borda: cor.primaria, texto: "#fff" },
  sucesso: { fundo: cor.ok, borda: cor.ok, texto: "#04210f" },
  perigo: { fundo: "transparent", borda: cor.critico, texto: cor.critico },
  secundario: { fundo: cor.superficie2, borda: cor.borda, texto: cor.texto },
  fantasma: { fundo: "transparent", borda: "transparent", texto: cor.primariaClara },
};

export function Campo({ rotulo, ...props }) {
  return (
    <View style={s.campo}>
      {rotulo && <Text style={s.campoRotulo}>{rotulo}</Text>}
      <TextInput placeholderTextColor={cor.texto3} style={s.input} {...props} />
    </View>
  );
}

export function Cartao({ children, estilo }) {
  return <View style={[s.cartao, estilo]}>{children}</View>;
}

export function Selo({ texto, corFundo = cor.superficie2, corTexto = cor.texto2 }) {
  return <View style={[s.selo, { backgroundColor: corFundo }]}><Text style={[s.seloTexto, { color: corTexto }]}>{texto}</Text></View>;
}

export function Erro({ texto }) {
  if (!texto) return null;
  return <View style={s.erro}><Text style={s.erroTexto}>{texto}</Text></View>;
}

export function Vazio({ titulo, texto }) {
  return (
    <View style={s.vazio}>
      <Text style={s.vazioTitulo}>{titulo}</Text>
      {texto && <Text style={s.vazioTexto}>{texto}</Text>}
    </View>
  );
}

// Janela de confirmação que funciona igual no celular e no navegador (Alert não funciona na web).
export function Confirmar({ visivel, titulo, texto, rotuloOk = "Confirmar", variante = "primario", onOk, onCancelar, children }) {
  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onCancelar}>
      <View style={s.fundoModal}>
        <View style={s.modal}>
          <Text style={s.modalTitulo}>{titulo}</Text>
          {texto && <Text style={s.modalTexto}>{texto}</Text>}
          {children}
          <View style={s.modalBotoes}>
            <Botao titulo="Voltar" variante="secundario" onPress={onCancelar} estilo={{ flex: 1 }} />
            <Botao titulo={rotuloOk} variante={variante} onPress={onOk} estilo={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Pop-up de aviso (promoção ativada/encerrada, comissão recebida).
export function PopupAviso({ aviso, onFechar }) {
  if (!aviso) return null;
  const foto = aviso.promocao?.fotoUrl;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFechar}>
      <View style={s.fundoModal}>
        <View style={[s.modal, { padding: 0, overflow: "hidden" }]}>
          {foto ? <Image source={{ uri: foto }} style={s.popupFoto} resizeMode="cover" /> : <View style={s.popupFaixa} />}
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ padding: 20, gap: 8 }}>
            <Text style={s.popupTitulo}>{aviso.titulo}</Text>
            {aviso.promocao?.titulo && <Text style={s.popupSub}>{aviso.promocao.titulo}</Text>}
            <Text style={s.modalTexto}>{aviso.mensagem}</Text>
            {aviso.promocao?.premio && <Text style={s.popupPremio}>🎁 {aviso.promocao.premio}</Text>}
          </ScrollView>
          <View style={{ padding: 16, paddingTop: 0 }}>
            <Botao titulo="Entendi" onPress={onFechar} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export const s = StyleSheet.create({
  botao: { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  botaoPequeno: { minHeight: 38, paddingHorizontal: 12, borderRadius: 10 },
  botaoTexto: { fontSize: 16, fontWeight: "700" },
  botaoTextoPequeno: { fontSize: 14 },
  campo: { gap: 6 },
  campoRotulo: { color: cor.texto2, fontSize: 13 },
  input: { backgroundColor: cor.superficie2, borderWidth: 1, borderColor: cor.borda, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: cor.texto, fontSize: 16 },
  cartao: { backgroundColor: cor.superficie, borderRadius: 16, borderWidth: 1, borderColor: cor.borda, padding: 16, gap: 10 },
  selo: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  seloTexto: { fontSize: 12, fontWeight: "700" },
  erro: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.4)", borderWidth: 1, borderRadius: 10, padding: 12 },
  erroTexto: { color: "#fca5a5", fontSize: 14 },
  vazio: { alignItems: "center", padding: 28, gap: 6 },
  vazioTitulo: { color: cor.texto, fontSize: 16, fontWeight: "700", textAlign: "center" },
  vazioTexto: { color: cor.texto3, fontSize: 14, textAlign: "center" },
  fundoModal: { flex: 1, backgroundColor: "rgba(3,8,18,0.72)", justifyContent: "center", padding: 22 },
  modal: { backgroundColor: cor.superficie, borderRadius: 18, padding: 20, gap: 12, borderWidth: 1, borderColor: cor.borda, maxWidth: 440, width: "100%", alignSelf: "center" },
  modalTitulo: { color: cor.texto, fontSize: 19, fontWeight: "800" },
  modalTexto: { color: cor.texto2, fontSize: 15, lineHeight: 21 },
  modalBotoes: { flexDirection: "row", gap: 10, marginTop: 4 },
  popupFoto: { width: "100%", height: 170, backgroundColor: cor.superficie2 },
  popupFaixa: { height: 8, backgroundColor: cor.primaria },
  popupTitulo: { color: cor.texto, fontSize: 22, fontWeight: "800" },
  popupSub: { color: cor.primariaClara, fontSize: 16, fontWeight: "700" },
  popupPremio: { color: cor.ok, fontSize: 15, fontWeight: "700" },
});
