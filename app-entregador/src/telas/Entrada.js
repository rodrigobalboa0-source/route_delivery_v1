// Login e auto-cadastro do entregador (o cadastro entra "em análise" até o ADM aprovar).
import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { aparelhoAtual, api, salvarToken } from "../api";
import { Botao, Campo, Cartao, Erro } from "../componentes";
import BuscaEndereco from "../BuscaEndereco";
import { VEICULOS, cor } from "../tema";

function Login({ onEntrou, onCadastro, onEsqueci, emailInicial = "", aviso }) {
  const [email, setEmail] = useState(emailInicial);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    setErro(null);
    setCarregando(true);
    try {
      const r = await api.post("/login", { email: email.trim(), senha, ...(await aparelhoAtual()) });
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
      {aviso ? <View style={st.aviso}><Text style={st.avisoTexto}>{aviso}</Text></View> : null}
      <Campo rotulo="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Campo rotulo="Senha" value={senha} onChangeText={setSenha} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={entrar} />
      <Erro texto={erro} />
      <Botao titulo="Entrar" onPress={entrar} carregando={carregando} desabilitado={!email || !senha} />
      <Botao titulo="Esqueci minha senha" variante="fantasma" onPress={() => onEsqueci(email.trim())} />
      <Botao titulo="Quero me cadastrar como entregador" variante="fantasma" onPress={onCadastro} />
    </Cartao>
  );
}

// Esqueci minha senha: 1) e-mail -> código de 6 dígitos chega no e-mail; 2) código + nova senha.
function EsqueciSenha({ emailInicial = "", onVoltar }) {
  const [etapa, setEtapa] = useState("email");
  const [email, setEmail] = useState(emailInicial);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState(null);
  const [info, setInfo] = useState(null);
  const [carregando, setCarregando] = useState(false);

  async function pedirCodigo() {
    setErro(null); setCarregando(true);
    try {
      const r = await api.post("/esqueci-senha", { email: email.trim() });
      setInfo(r.devCodigo ? `${r.mensagem} (teste: ${r.devCodigo})` : r.mensagem);
      setEtapa("codigo");
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  async function redefinir() {
    setErro(null);
    if (senha !== senha2) { setErro("As duas senhas não são iguais."); return; }
    setCarregando(true);
    try {
      const r = await api.post("/redefinir-senha", { email: email.trim(), codigo, novaSenha: senha });
      onVoltar(email.trim(), r.mensagem);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Cartao>
      <Text style={st.titulo}>Esqueci minha senha</Text>
      {etapa === "email" ? (
        <>
          <Text style={st.texto}>Digite o e-mail do seu cadastro. Vamos enviar um código de 6 dígitos para você criar uma nova senha.</Text>
          <Campo rotulo="E-mail cadastrado" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" onSubmitEditing={pedirCodigo} />
          <Erro texto={erro} />
          <Botao titulo="Enviar código" onPress={pedirCodigo} carregando={carregando} desabilitado={!email.includes("@")} />
        </>
      ) : (
        <>
          {info ? <View style={st.aviso}><Text style={st.avisoTexto}>{info}</Text></View> : null}
          <Campo rotulo="Código de 6 dígitos" value={codigo} onChangeText={t => setCodigo(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} />
          <Campo rotulo="Nova senha (mínimo 6)" value={senha} onChangeText={setSenha} secureTextEntry />
          <Campo rotulo="Repita a nova senha" value={senha2} onChangeText={setSenha2} secureTextEntry onSubmitEditing={redefinir} />
          <Erro texto={erro} />
          <Botao titulo="Salvar nova senha" onPress={redefinir} carregando={carregando} desabilitado={codigo.length !== 6 || senha.length < 6 || !senha2} />
          <Botao titulo="Não recebi — enviar outro código" variante="fantasma" onPress={() => { setEtapa("email"); setCodigo(""); }} />
          <Text style={st.dica}>Ao criar a nova senha, o celular que estava conectado na sua conta é desconectado.</Text>
        </>
      )}
      <Botao titulo="Voltar para o login" variante="fantasma" onPress={() => onVoltar(email.trim())} />
    </Cartao>
  );
}

const ENDERECO_VAZIO = { busca: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", cep: "" };

// Endereço do entregador: busca no OpenStreetMap preenche rua, bairro, cidade e CEP; número e complemento editáveis.
export function CamposEndereco({ e, setE }) {
  const set = k => t => setE({ ...e, [k]: t });
  return (
    <>
      <BuscaEndereco
        rotulo="Endereço (rua e número)"
        valor={e.busca}
        onChangeText={t => setE({ ...e, busca: t, rua: t, bairro: "", cidade: e.cidade, cep: "" })}
        onEscolher={x => setE({ ...e, busca: x.endereco, rua: x.rua || x.titulo, numero: x.numero || e.numero, bairro: x.bairro || "", cidade: x.cidade || "", cep: x.cep || "" })}
      />
      <View style={st.linha2}>
        <View style={{ flex: 1 }}><Campo rotulo="Número" value={e.numero} onChangeText={set("numero")} keyboardType="number-pad" /></View>
        <View style={{ flex: 2 }}><Campo rotulo="Complemento" value={e.complemento} onChangeText={set("complemento")} placeholder="Apto, bloco…" /></View>
      </View>
      <Campo rotulo="Cidade" value={e.cidade} onChangeText={set("cidade")} />
    </>
  );
}

function Cadastro({ onVoltar }) {
  const [v, setV] = useState({ nomeCompleto: "", email: "", senha: "", telefone: "", cpf: "", veiculoTipo: "MOTO", veiculoPlaca: "" });
  const [end, setEnd] = useState(ENDERECO_VAZIO);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const set = k => t => setV({ ...v, [k]: t });

  async function enviar() {
    setErro(null);
    setCarregando(true);
    try {
      const { busca, ...endereco } = end;
      const r = await api.post("/cadastro", { ...v, ...endereco, email: v.email.trim() });
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
      <CamposEndereco e={end} setE={setEnd} />
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

export default function Entrada({ onEntrou, aviso }) {
  const [modo, setModo] = useState("login");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState(aviso || null);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={st.tela} keyboardShouldPersistTaps="handled">
        <Image source={require("../../assets/logo-route-delivery.png")} style={st.logo} resizeMode="contain" accessibilityLabel="Route Delivery" />
        <Text style={st.subtitulo}>App do entregador</Text>
        {modo === "login" && (
          <Login key={email} emailInicial={email} aviso={msg} onEntrou={onEntrou} onCadastro={() => setModo("cadastro")}
            onEsqueci={e => { setEmail(e); setMsg(null); setModo("esqueci"); }} />
        )}
        {modo === "esqueci" && <EsqueciSenha emailInicial={email} onVoltar={(e, m) => { setEmail(e || ""); setMsg(m || null); setModo("login"); }} />}
        {modo === "cadastro" && <Cadastro onVoltar={() => setModo("login")} />}
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
  linha2: { flexDirection: "row", gap: 10 },
  aviso: { backgroundColor: "rgba(42,120,214,0.15)", borderColor: "rgba(42,120,214,0.45)", borderWidth: 1, borderRadius: 10, padding: 12 },
  avisoTexto: { color: cor.texto, fontSize: 14, lineHeight: 20 },
  dica: { color: cor.texto3, fontSize: 13, lineHeight: 18 },
  opcao: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: cor.borda, alignItems: "center", backgroundColor: cor.superficie2 },
  opcaoAtiva: { backgroundColor: cor.primaria, borderColor: cor.primaria },
  opcaoTexto: { color: cor.texto2, fontWeight: "700" },
});
