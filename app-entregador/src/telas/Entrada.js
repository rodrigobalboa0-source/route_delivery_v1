// Login e auto-cadastro do entregador (o cadastro entra "em análise" até o ADM aprovar).
import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, salvarToken } from "../api";
import { Botao, Campo, Cartao, Erro } from "../componentes";
import { VEICULOS, cor } from "../tema";

function Login({ onEntrou, onCadastro }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setErro(null);
    setCarregando(true);
    try {
      const r = await api.post("/login", { email: email.trim(), senha });
      await salvarToken(r.token);
      onEntrou(r.entregador);
    } catch (e) {
      setErro(e.message === "Credenciais inválidas." ? "E-mail ou senha incorretos." : e.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Cartao>
      <Text style={st.titulo}>Entrar</Text>
      <Campo rotulo="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Campo rotulo="Senha" value={senha} onChangeText={setSenha} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={entrar} />
      <Erro texto={erro} />
      <Botao titulo="Entrar" onPress={entrar} carregando={carregando} desabilitado={!email || !senha} />
      <Botao titulo="Quero me cadastrar como entregador" variante="fantasma" onPress={onCadastro} />
    </Cartao>
  );
}

function Cadastro({ onVoltar }) {
  const [v, setV] = useState({ nomeCompleto: "", email: "", senha: "", telefone: "", cpf: "", cidade: "", veiculoTipo: "MOTO", veiculoPlaca: "" });
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const set = k => t => setV({ ...v, [k]: t });

  async function enviar() {
    setErro(null);
    setCarregando(true);
    try {
      const r = await api.post("/cadastro", { ...v, email: v.email.trim() });
      setOk(r.mensagem);
    } catch (e) {
      setErro(/Unique|unique|email/.test(e.message) ? "Este e-mail já está cadastrado." : e.message);
    } finally {
      setCarregando(false);
    }
  }

  if (ok) {
    return (
      <Cartao>
        <Text style={st.titulo}>Cadastro enviado ✓</Text>
        <Text style={st.texto}>{ok} Você poderá entrar assim que a equipe aprovar.</Text>
        <Botao titulo="Voltar para o login" onPress={onVoltar} />
      </Cartao>
    );
  }

  return (
    <Cartao>
      <Text style={st.titulo}>Cadastro de entregador</Text>
      <Campo rotulo="Nome completo *" value={v.nomeCompleto} onChangeText={set("nomeCompleto")} />
      <Campo rotulo="E-mail *" value={v.email} onChangeText={set("email")} autoCapitalize="none" keyboardType="email-address" />
      <Campo rotulo="Senha * (mínimo 6)" value={v.senha} onChangeText={set("senha")} secureTextEntry />
      <Campo rotulo="Telefone" value={v.telefone} onChangeText={set("telefone")} keyboardType="phone-pad" />
      <Campo rotulo="CPF" value={v.cpf} onChangeText={set("cpf")} keyboardType="number-pad" />
      <Campo rotulo="Cidade" value={v.cidade} onChangeText={set("cidade")} />
      <Text style={st.rotulo}>Veículo</Text>
      <View style={st.opcoes}>
        {Object.entries(VEICULOS).map(([k, r]) => (
          <Pressable key={k} onPress={() => setV({ ...v, veiculoTipo: k })} style={[st.opcao, v.veiculoTipo === k && st.opcaoAtiva]}>
            <Text style={[st.opcaoTexto, v.veiculoTipo === k && { color: "#fff" }]}>{r}</Text>
          </Pressable>
        ))}
      </View>
      {v.veiculoTipo !== "BIKE" && <Campo rotulo="Placa" value={v.veiculoPlaca} onChangeText={set("veiculoPlaca")} autoCapitalize="characters" />}
      <Erro texto={erro} />
      <Botao titulo="Enviar cadastro" onPress={enviar} carregando={carregando} desabilitado={!v.nomeCompleto || !v.email || v.senha.length < 6} />
      <Botao titulo="Já tenho conta" variante="fantasma" onPress={onVoltar} />
    </Cartao>
  );
}

export default function Entrada({ onEntrou }) {
  const [modo, setModo] = useState("login");
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={st.tela} keyboardShouldPersistTaps="handled">
        <Image source={require("../../assets/logo-route-delivery.png")} style={st.logo} resizeMode="contain" accessibilityLabel="Route Delivery" />
        <Text style={st.subtitulo}>App do entregador</Text>
        {modo === "login"
          ? <Login onEntrou={onEntrou} onCadastro={() => setModo("cadastro")} />
          : <Cadastro onVoltar={() => setModo("login")} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  tela: { flexGrow: 1, justifyContent: "center", padding: 20, gap: 14, maxWidth: 480, width: "100%", alignSelf: "center" },
  logo: { width: "86%", height: 130, alignSelf: "center" },
  subtitulo: { color: cor.texto3, textAlign: "center", fontSize: 14, marginTop: -8, marginBottom: 4, letterSpacing: 1 },
  titulo: { color: cor.texto, fontSize: 22, fontWeight: "800" },
  texto: { color: cor.texto2, fontSize: 15, lineHeight: 21 },
  rotulo: { color: cor.texto2, fontSize: 13 },
  opcoes: { flexDirection: "row", gap: 8 },
  opcao: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: cor.borda, alignItems: "center", backgroundColor: cor.superficie2 },
  opcaoAtiva: { backgroundColor: cor.primaria, borderColor: cor.primaria },
  opcaoTexto: { color: cor.texto2, fontWeight: "700" },
});
