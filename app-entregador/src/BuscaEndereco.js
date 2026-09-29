// Campo de endereço com busca no OpenStreetMap enquanto digita (cadastro e conta do entregador).
// Escolher uma sugestão devolve { rua, numero, bairro, cidade, cep, endereco, lat, lng }.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "./api";
import { cor } from "./tema";

export default function BuscaEndereco({ rotulo = "Endereço", valor, onChangeText, onEscolher, perto, placeholder = "Comece a digitar a rua e o número" }) {
  const [sugestoes, setSugestoes] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState(null);
  const timer = useRef(null);
  const ultima = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  function mudar(texto) {
    onChangeText(texto);
    clearTimeout(timer.current);
    const n = ++ultima.current;
    setSugestoes([]); // não deixa tocar numa sugestão de um texto antigo
    if (texto.trim().length < 3) { setSugestoes([]); setBuscando(false); return; }
    timer.current = setTimeout(async () => {
      setBuscando(true);
      setErro(null);
      try {
        const q = new URLSearchParams({ q: texto.trim(), ...(perto ? { lat: String(perto.lat), lng: String(perto.lng) } : {}) });
        const r = await api.get(`/enderecos?${q}`);
        if (n === ultima.current) setSugestoes(r);
      } catch (e) {
        if (n === ultima.current) { setSugestoes([]); setErro(e.message); }
      } finally {
        if (n === ultima.current) setBuscando(false);
      }
    }, 400);
  }

  function escolher(e) {
    clearTimeout(timer.current);
    ultima.current++;
    setSugestoes([]);
    onEscolher(e);
  }

  return (
    <View style={st.campo}>
      <Text style={st.rotulo}>{rotulo}</Text>
      <View>
        <TextInput
          value={valor}
          onChangeText={mudar}
          placeholder={placeholder}
          placeholderTextColor={cor.texto3}
          style={st.input}
          autoCorrect={false}
          accessibilityLabel={rotulo}
        />
        {buscando && <ActivityIndicator style={st.carregando} color={cor.texto3} size="small" />}
      </View>
      {erro ? <Text style={st.erro}>{erro}</Text> : null}
      {sugestoes.length > 0 && (
        <View style={st.lista}>
          {sugestoes.map(e => (
            <Pressable key={e.endereco} onPress={() => escolher(e)} style={({ pressed }) => [st.item, pressed && { backgroundColor: cor.superficie2 }]} accessibilityRole="button">
              <Text style={st.itemTitulo}>📍 {e.titulo}</Text>
              {e.subtitulo ? <Text style={st.itemSub} numberOfLines={2}>{e.subtitulo}</Text> : null}
            </Pressable>
          ))}
          <Text style={st.credito}>Endereços: © OpenStreetMap</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  campo: { gap: 6 },
  rotulo: { color: cor.texto2, fontSize: 13 },
  input: { backgroundColor: cor.superficie2, borderWidth: 1, borderColor: cor.borda, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, paddingRight: 40, color: cor.texto, fontSize: 16 },
  carregando: { position: "absolute", right: 12, top: 14 },
  erro: { color: "#fca5a5", fontSize: 13 },
  lista: { backgroundColor: cor.superficie, borderWidth: 1, borderColor: cor.borda, borderRadius: 10, overflow: "hidden" },
  item: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: cor.borda, gap: 2 },
  itemTitulo: { color: cor.texto, fontSize: 15, fontWeight: "600" },
  itemSub: { color: cor.texto3, fontSize: 13 },
  credito: { color: cor.texto3, fontSize: 11, textAlign: "right", paddingHorizontal: 10, paddingVertical: 5 },
});
