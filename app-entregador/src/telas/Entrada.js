// Login e auto-cadastro do entregador (o cadastro entra "em análise" até o ADM aprovar).
import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { aparelhoAtual, api, salvarToken } from "../api";
import { Botao, Campo, Cartao, Erro } from "../componentes";
import BuscaEndereco from "../BuscaEndereco";
import { VEICULOS, cor } from "../tema";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

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
export function CamposEndereco({ e, setE, completo }) {
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
      {completo && (
        <View style={st.linha2}>
          <View style={{ flex: 3 }}><Campo rotulo="Bairro *" value={e.bairro} onChangeText={set("bairro")} /></View>
          <View style={{ flex: 2 }}><Campo rotulo="CEP *" value={e.cep} onChangeText={t => setE({ ...e, cep: mascaraCep(t) })} keyboardType="number-pad" placeholder="00000-000" /></View>
        </View>
      )}
      <Campo rotulo={completo ? "Cidade *" : "Cidade"} value={e.cidade} onChangeText={set("cidade")} />
    </>
  );
}

// ---------- Máscaras e validação do cadastro ----------
const dig = t => String(t || "").replace(/\D/g, "");
const mascaraCep = t => dig(t).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
const mascaraCpf = t => dig(t).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const mascaraData = t => dig(t).slice(0, 8).replace(/^(\d{2})(\d)/, "$1/$2").replace(/^(\d{2}\/\d{2})(\d)/, "$1/$2");
function mascaraTelefone(t) {
  const d = dig(t).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function cpfValido(v) {
  const c = dig(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
function maiorDeIdade(s) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return null;
  const [d, m, a] = s.split("/").map(Number);
  const dt = new Date(a, m - 1, d);
  if (dt.getDate() !== d || dt.getMonth() !== m - 1) return null;
  return Date.now() - dt.getTime() >= 18 * 365.25 * 864e5;
}

// Foto tirada na hora ou escolhida na galeria, reduzida e enviada como data URI JPEG.
const FOTOS = [
  { campo: "fotoUrl", rotulo: "Selfie (foto do seu rosto)", largura: 600, selfie: true },
  { campo: "fotoCnhUrl", rotulo: "CNH (aberta, frente)", largura: 1200, motorizado: true },
  { campo: "comprovanteResidenciaUrl", rotulo: "Comprovante de endereço", largura: 1200 },
  { campo: "documentoVeiculoUrl", rotulo: "Documento do veículo (CRLV)", largura: 1200, motorizado: true },
];

async function escolherFoto(origem, { largura, selfie }) {
  const opcoes = { mediaTypes: ["images"], quality: 1, cameraType: selfie ? ImagePicker.CameraType.front : ImagePicker.CameraType.back };
  let r;
  if (origem === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Permita o uso da câmera para tirar a foto (ou escolha da galeria).");
    r = await ImagePicker.launchCameraAsync(opcoes);
  } else {
    r = await ImagePicker.launchImageLibraryAsync(opcoes);
  }
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const ctx = ImageManipulator.manipulate(a.uri);
  if (!a.width || a.width > largura) ctx.resize({ width: largura });
  const img = await ctx.renderAsync();
  const salvo = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.6, base64: true });
  return `data:image/jpeg;base64,${salvo.base64}`;
}

function FotoDocumento({ def, valor, onChange, onErro }) {
  const [ocupado, setOcupado] = useState(false);
  async function pegar(origem) {
    onErro(null);
    setOcupado(true);
    try {
      const uri = await escolherFoto(origem, def);
      if (uri) onChange(uri);
    } catch (e) {
      onErro(e.message || "Não foi possível carregar a foto.");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <View style={[st.foto, !valor && st.fotoPendente]}>
      {valor
        ? <Image source={{ uri: valor }} style={[st.fotoMini, def.selfie && { borderRadius: 32 }]} />
        : <View style={[st.fotoMini, st.fotoVazia, def.selfie && { borderRadius: 32 }]}><Text style={st.fotoVaziaTexto}>{def.selfie ? "🙂" : "📄"}</Text></View>}
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={st.fotoRotulo}>{def.rotulo} *</Text>
        <Text style={[st.fotoStatus, valor && { color: cor.ok }]}>{ocupado ? "Carregando…" : valor ? "✓ Foto adicionada" : "Obrigatório"}</Text>
        <View style={st.linha2}>
          <Botao pequeno variante="secundario" titulo="📷 Câmera" onPress={() => pegar("camera")} desabilitado={ocupado} estilo={{ flex: 1 }} />
          <Botao pequeno variante="secundario" titulo="🖼 Galeria" onPress={() => pegar("galeria")} desabilitado={ocupado} estilo={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

const CADASTRO_VAZIO = {
  nomeCompleto: "", email: "", senha: "", senha2: "", telefone: "", cpf: "", dataNascimento: "",
  veiculoTipo: "MOTO", veiculoModelo: "", veiculoPlaca: "", veiculoAno: "",
  fotoUrl: "", fotoCnhUrl: "", comprovanteResidenciaUrl: "", documentoVeiculoUrl: "",
};

// Lista o que ainda falta; o servidor valida de novo.
function faltandoNoCadastro(v, end) {
  const f = [];
  const motorizado = v.veiculoTipo !== "BIKE";
  if (v.nomeCompleto.trim().split(/\s+/).length < 2) f.push("nome e sobrenome");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) f.push("e-mail válido");
  if (v.senha.length < 6) f.push("senha com 6 caracteres ou mais");
  else if (v.senha !== v.senha2) f.push("as duas senhas iguais");
  if (![10, 11].includes(dig(v.telefone).length)) f.push("telefone com DDD");
  if (!cpfValido(v.cpf)) f.push("CPF válido");
  const idade = maiorDeIdade(v.dataNascimento);
  if (idade === null) f.push("data de nascimento (dd/mm/aaaa)");
  else if (!idade) f.push("idade mínima de 18 anos");
  if (!end.rua.trim()) f.push("rua");
  if (!end.numero.trim()) f.push("número do endereço");
  if (!end.bairro.trim()) f.push("bairro");
  if (!end.cidade.trim()) f.push("cidade");
  if (dig(end.cep).length !== 8) f.push("CEP");
  if (motorizado) {
    if (!v.veiculoModelo.trim()) f.push("modelo do veículo");
    if (!/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/i.test(v.veiculoPlaca.trim())) f.push("placa válida");
    if (!/^(19[5-9]\d|20\d{2})$/.test(v.veiculoAno.trim())) f.push("ano do veículo");
  }
  FOTOS.forEach(d => { if ((!d.motorizado || motorizado) && !v[d.campo]) f.push(d.rotulo.replace(/ \(.*\)/, "").toLowerCase()); });
  return f;
}

function Cadastro({ onVoltar }) {
  const [v, setV] = useState(CADASTRO_VAZIO);
  const [end, setEnd] = useState(ENDERECO_VAZIO);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const set = k => t => setV(a => ({ ...a, [k]: t }));
  const motorizado = v.veiculoTipo !== "BIKE";

  async function enviar() {
    const faltando = faltandoNoCadastro(v, end);
    if (faltando.length) { setErro(`Complete o cadastro: ${faltando.join(", ")}.`); return; }
    setErro(null);
    setCarregando(true);
    try {
      const { busca, ...endereco } = end;
      const { senha2, ...dados } = v;
      if (!motorizado) Object.assign(dados, { veiculoModelo: "", veiculoPlaca: "", veiculoAno: "", fotoCnhUrl: "", documentoVeiculoUrl: "" });
      const r = await api.post("/cadastro", { ...dados, ...endereco, email: v.email.trim(), veiculoPlaca: dados.veiculoPlaca.trim().toUpperCase() });
      setOk(r.mensagem);
    } catch (e) {
      setErro(/Unique|unique/.test(e.message) ? "Este e-mail já está cadastrado." : e.message);
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
      <Text style={st.dica}>Todos os campos com * são obrigatórios. A equipe confere os documentos antes de liberar seu acesso.</Text>

      <Text style={st.secao}>Dados pessoais</Text>
      <Campo rotulo="Nome completo *" value={v.nomeCompleto} onChangeText={set("nomeCompleto")} autoCapitalize="words" />
      <View style={st.linha2}>
        <View style={{ flex: 1 }}><Campo rotulo="CPF *" value={v.cpf} onChangeText={t => set("cpf")(mascaraCpf(t))} keyboardType="number-pad" placeholder="000.000.000-00" /></View>
        <View style={{ flex: 1 }}><Campo rotulo="Nascimento *" value={v.dataNascimento} onChangeText={t => set("dataNascimento")(mascaraData(t))} keyboardType="number-pad" placeholder="dd/mm/aaaa" /></View>
      </View>
      <Campo rotulo="Telefone (WhatsApp) *" value={v.telefone} onChangeText={t => set("telefone")(mascaraTelefone(t))} keyboardType="phone-pad" placeholder="(00) 00000-0000" />

      <Text style={st.secao}>Acesso ao app</Text>
      <Campo rotulo="E-mail *" value={v.email} onChangeText={set("email")} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
      <Campo rotulo="Senha * (mínimo 6)" value={v.senha} onChangeText={set("senha")} secureTextEntry />
      <Campo rotulo="Repita a senha *" value={v.senha2} onChangeText={set("senha2")} secureTextEntry />

      <Text style={st.secao}>Endereço</Text>
      <CamposEndereco e={end} setE={setEnd} completo />

      <Text style={st.secao}>Veículo</Text>
      <View style={st.opcoes}>
        {Object.entries(VEICULOS).map(([k, r]) => (
          <Pressable key={k} onPress={() => setV(a => ({ ...a, veiculoTipo: k }))} style={[st.opcao, v.veiculoTipo === k && st.opcaoAtiva]}>
            <Text style={[st.opcaoTexto, v.veiculoTipo === k && { color: "#fff" }]}>{r}</Text>
          </Pressable>
        ))}
      </View>
      {motorizado && (
        <>
          <Campo rotulo="Modelo *" value={v.veiculoModelo} onChangeText={set("veiculoModelo")} placeholder="Ex.: Honda CG 160" />
          <View style={st.linha2}>
            <View style={{ flex: 3 }}><Campo rotulo="Placa *" value={v.veiculoPlaca} onChangeText={t => set("veiculoPlaca")(t.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8))} autoCapitalize="characters" placeholder="ABC1D23" /></View>
            <View style={{ flex: 2 }}><Campo rotulo="Ano *" value={v.veiculoAno} onChangeText={t => set("veiculoAno")(dig(t).slice(0, 4))} keyboardType="number-pad" placeholder="2020" /></View>
          </View>
        </>
      )}

      <Text style={st.secao}>Fotos e documentos</Text>
      {FOTOS.filter(d => motorizado || !d.motorizado).map(d => (
        <FotoDocumento key={d.campo} def={d} valor={v[d.campo]} onChange={set(d.campo)} onErro={setErro} />
      ))}

      <Erro texto={erro} />
      <Botao titulo="Enviar cadastro" onPress={enviar} carregando={carregando} />
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
  secao: { color: cor.texto, fontSize: 15, fontWeight: "800", marginTop: 6 },
  foto: { flexDirection: "row", gap: 12, alignItems: "center", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: cor.borda, backgroundColor: cor.superficie2 },
  fotoPendente: { borderStyle: "dashed" },
  fotoMini: { width: 64, height: 64, borderRadius: 8 },
  fotoVazia: { alignItems: "center", justifyContent: "center", backgroundColor: cor.superficie, borderWidth: 1, borderColor: cor.borda },
  fotoVaziaTexto: { fontSize: 26 },
  fotoRotulo: { color: cor.texto, fontSize: 14, fontWeight: "700" },
  fotoStatus: { color: cor.texto3, fontSize: 12 },
});
