// Carteira / Extrato: saldo atual, histórico de transações (Tudo ou período personalizado) e "Retirar saldo".
// Retirar saldo: escolhe saque normal ou rápido (regras do ADM), o valor, e a conta bancária (cadastra na hora se não tiver).
import { useCallback, useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { api } from "../api";
import { Botao, Campo, Erro } from "../componentes";
import { cor, moeda } from "../tema";

const dataBR = d => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const horaBR = d => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
// "DD/MM/AAAA" digitado -> Date (início do dia) ou null.
function lerData(t) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t || "");
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getDate() === Number(m[1]) ? d : null;
}
const mascaraData = t => t.replace(/\D/g, "").slice(0, 8).replace(/^(\d{2})(\d)/, "$1/$2").replace(/^(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
const valorDigitado = t => Number(String(t || "").replace(/\./g, "").replace(",", "."));

function Escolha({ opcoes, valor, onChange }) {
  return (
    <View style={st.chips}>
      {opcoes.map(([v, rotulo]) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[st.chip, valor === v && st.chipAtivo]} accessibilityRole="radio" accessibilityState={{ checked: valor === v }}>
          <Text style={[st.chipTexto, valor === v && st.chipTextoAtivo]}>{rotulo}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- Conta bancária ----------

const TIPOS_CONTA = [["CORRENTE", "Corrente"], ["POUPANCA", "Poupança"], ["PAGAMENTO", "Pagamento"]];
const TIPOS_PIX = [["CPF", "CPF"], ["CNPJ", "CNPJ"], ["EMAIL", "E-mail"], ["TELEFONE", "Telefone"], ["ALEATORIA", "Aleatória"]];

function FormConta({ conta, onSalva, onVoltar }) {
  const [v, setV] = useState(() => ({
    titular: conta?.titular || "", documento: conta?.documento || "", banco: conta?.banco || "", agencia: conta?.agencia || "",
    conta: conta?.conta || "", tipoConta: conta?.tipoConta || "CORRENTE", pixTipo: conta?.pixTipo || "CPF", pixChave: conta?.pixChave || "",
  }));
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const set = k => t => setV(x => ({ ...x, [k]: t }));
  async function salvar() {
    setErro(null); setSalvando(true);
    try { onSalva(await api.patch("/conta-bancaria", v)); } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }
  return (
    <>
      <Text style={st.modalTitulo}>{conta ? "Alterar conta bancária" : "Cadastrar conta bancária"}</Text>
      <Text style={st.modalTexto}>Conta onde você vai receber os saques. Use uma conta no seu nome.</Text>
      <Erro texto={erro} />
      <Campo rotulo="Nome do titular" value={v.titular} onChangeText={set("titular")} autoCapitalize="words" placeholder="Como está no banco" />
      <Campo rotulo="CPF ou CNPJ do titular" value={v.documento} onChangeText={t => set("documento")(t.replace(/\D/g, "").slice(0, 14))} keyboardType="number-pad" placeholder="Só números" />
      <Campo rotulo="Banco" value={v.banco} onChangeText={set("banco")} placeholder="Ex.: Nubank, Caixa, 260" />
      <View style={st.linhaCampos}>
        <View style={{ flex: 1 }}><Campo rotulo="Agência" value={v.agencia} onChangeText={t => set("agencia")(t.replace(/[^\d-]/g, ""))} keyboardType="number-pad" placeholder="0001" /></View>
        <View style={{ flex: 1.4 }}><Campo rotulo="Conta com dígito" value={v.conta} onChangeText={t => set("conta")(t.replace(/[^\dxX-]/g, ""))} keyboardType="number-pad" placeholder="12345-6" /></View>
      </View>
      <Text style={st.rotulo}>Tipo de conta</Text>
      <Escolha opcoes={TIPOS_CONTA} valor={v.tipoConta} onChange={set("tipoConta")} />
      <Text style={st.rotulo}>Chave PIX (opcional, agiliza o pagamento)</Text>
      <Escolha opcoes={TIPOS_PIX} valor={v.pixTipo} onChange={set("pixTipo")} />
      <Campo value={v.pixChave} onChangeText={set("pixChave")} autoCapitalize="none" placeholder="Sua chave PIX" />
      <View style={st.botoes}>
        {onVoltar && <Botao titulo="Voltar" variante="secundario" onPress={onVoltar} estilo={{ flex: 1 }} />}
        <Botao titulo="Salvar conta" onPress={salvar} carregando={salvando} estilo={{ flex: 1.4 }} />
      </View>
    </>
  );
}

const TIPO_CONTA_TEXTO = { CORRENTE: "Conta corrente", POUPANCA: "Poupança", PAGAMENTO: "Conta de pagamento" };

// ---------- Retirar saldo ----------

function RetirarSaldo({ dados, onFechar, onFeito }) {
  const [conta, setConta] = useState(dados.conta);
  const [editandoConta, setEditandoConta] = useState(!dados.conta);
  const [tipo, setTipo] = useState(dados.saques.NORMAL.pode || !dados.saques.RAPIDO.pode ? "NORMAL" : "RAPIDO");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(null);
  const regra = dados.saques[tipo];
  const maximo = Math.min(dados.saldo, regra.limitePorSolicitacao ?? Infinity);

  async function sacar() {
    setErro(null);
    const n = valorDigitado(valor);
    if (!(n > 0)) { setErro("Informe o valor do saque."); return; }
    if (n > dados.saldo + 1e-9) { setErro(`Saldo insuficiente (disponível: ${moeda(dados.saldo)}).`); return; }
    setEnviando(true);
    try { setFeito(await api.post("/saques", { tipo, valor: n })); } catch (e) { setErro(e.message); } finally { setEnviando(false); }
  }

  let conteudo;
  if (feito) {
    conteudo = (
      <>
        <View style={st.feitoIcone}><Feather name="check" size={30} color={cor.ok} /></View>
        <Text style={[st.modalTitulo, { textAlign: "center" }]}>Saque solicitado!</Text>
        <Text style={[st.modalTexto, { textAlign: "center" }]}>{moeda(feito.liquido ?? feito.valor)} vão para a sua conta assim que a equipe confirmar o pagamento{feito.valorTaxa ? ` (taxa de ${moeda(feito.valorTaxa)})` : ""}. Você recebe um aviso no celular.</Text>
        <Botao titulo="Entendi" onPress={onFeito} />
      </>
    );
  } else if (editandoConta) {
    conteudo = <FormConta conta={conta} onVoltar={conta ? () => setEditandoConta(false) : onFechar} onSalva={c => { setConta(c); setEditandoConta(false); }} />;
  } else {
    conteudo = (
      <>
        <Text style={st.modalTitulo}>Retirar saldo</Text>
        <View style={st.saldoModal}>
          <Text style={st.saldoRotulo}>SALDO DISPONÍVEL</Text>
          <Text style={st.saldoModalValor}>{moeda(dados.saldo)}</Text>
        </View>
        <Text style={st.rotulo}>Tipo de saque</Text>
        <Escolha opcoes={[["NORMAL", "Saque normal"], ["RAPIDO", "Saque rápido"]]} valor={tipo} onChange={t => { setTipo(t); setErro(null); }} />
        <Text style={st.regra}>
          {regra.limitePorSolicitacao != null ? `Até ${moeda(regra.limitePorSolicitacao)} por saque · ` : ""}
          {regra.feitosHoje} de {regra.maxSolicitacoesDia} pedido(s) hoje
        </Text>
        {regra.taxaPercentual > 0 && <Text style={st.regra}>Taxa deste saque: {String(regra.taxaPercentual).replace(".", ",")}% do valor</Text>}
        {!regra.pode && <Text style={[st.regra, { color: cor.aviso }]}>⚠ {regra.motivo}</Text>}
        <Campo rotulo="Valor (R$)" value={valor} onChangeText={t => setValor(t.replace(/[^\d,]/g, ""))} keyboardType="decimal-pad" placeholder="0,00" />
        {regra.taxaPercentual > 0 && valorDigitado(valor) > 0 && (
          <Text style={st.regra}>
            Taxa {moeda(Math.round(valorDigitado(valor) * regra.taxaPercentual) / 100)} · você recebe {moeda(valorDigitado(valor) - Math.round(valorDigitado(valor) * regra.taxaPercentual) / 100)}
          </Text>
        )}
        {maximo > 0 && <Botao pequeno variante="fantasma" titulo={`Sacar ${moeda(maximo)}${maximo < dados.saldo ? " (máximo por saque)" : " (tudo)"}`} onPress={() => setValor(maximo.toFixed(2).replace(".", ","))} />}
        <Text style={st.rotulo}>Receber em</Text>
        <View style={st.contaCaixa}>
          <Feather name="credit-card" size={18} color={cor.primariaClara} />
          <View style={{ flex: 1 }}>
            <Text style={st.contaTexto}>{conta.banco} · Ag. {conta.agencia} · {conta.conta}</Text>
            <Text style={st.contaSub}>{TIPO_CONTA_TEXTO[conta.tipoConta]} · {conta.titular}{conta.pixChave ? ` · PIX ${conta.pixChave}` : ""}</Text>
          </View>
          <Pressable onPress={() => setEditandoConta(true)} accessibilityRole="button"><Text style={st.link}>Alterar</Text></Pressable>
        </View>
        <Erro texto={erro} />
        <View style={st.botoes}>
          <Botao titulo="Cancelar" variante="secundario" onPress={onFechar} estilo={{ flex: 1 }} />
          <Botao titulo="Confirmar saque" variante="sucesso" onPress={sacar} carregando={enviando} desabilitado={!regra.pode || dados.saldo <= 0} estilo={{ flex: 1.4 }} />
        </View>
      </>
    );
  }

  return (
    <Modal visible transparent animationType="slide" supportedOrientations={["portrait", "landscape"]} onRequestClose={onFechar}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.modalFundo}>
        <ScrollView style={st.modal} contentContainerStyle={{ padding: 20, gap: 10 }} keyboardShouldPersistTaps="handled">
          {conteudo}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------- Tela ----------

export function Carteira() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const [filtro, setFiltro] = useState("tudo");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [retirar, setRetirar] = useState(false);

  const carregar = useCallback(async () => {
    try { setDados(await api.get("/carteira")); setErro(null); } catch (e) { setErro(e.message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const inicio = lerData(de), fim = lerData(ate);
  const lista = (dados?.movimentos || []).filter(m => {
    if (filtro !== "personalizado") return true;
    const t = new Date(m.data);
    if (inicio && t < inicio) return false;
    if (fim && t >= new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() + 1)) return false;
    return true;
  });

  return (
    <ScrollView
      contentContainerStyle={st.tela}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={async () => { setAtualizando(true); await carregar(); setAtualizando(false); }} tintColor={cor.texto2} />}
    >
      <View style={st.topo}>
        <View style={[st.titulo, { flex: 1, minWidth: 0 }]}>
          <Feather name="credit-card" size={22} color={cor.texto} />
          <Text style={[st.tituloTexto, { flexShrink: 1 }]}>Carteira / Extrato</Text>
        </View>
        <Pressable onPress={() => setRetirar(true)} disabled={!dados} style={({ pressed }) => [st.retirar, (!dados || pressed) && { opacity: 0.7 }]} accessibilityRole="button">
          <Feather name="repeat" size={16} color="#fff" />
          <Text style={st.retirarTexto}>Retirar saldo</Text>
        </Pressable>
      </View>
      <Erro texto={erro} />

      <View style={st.saldo}>
        <Text style={st.saldoRotulo}>SALDO ATUAL</Text>
        <Text style={st.saldoValor}>{dados ? moeda(dados.saldo) : "…"}</Text>
      </View>

      <View style={st.titulo}>
        <Feather name="repeat" size={18} color={cor.texto} style={{ transform: [{ rotate: "90deg" }] }} />
        <Text style={st.subtitulo}>Histórico de Transações</Text>
      </View>

      <View style={st.filtros}>
        <View style={st.chips}>
          <Pressable onPress={() => setFiltro("tudo")} style={[st.chip, filtro === "tudo" && st.chipAtivo]}><Text style={[st.chipTexto, filtro === "tudo" && st.chipTextoAtivo]}>Tudo</Text></Pressable>
          <Pressable onPress={() => setFiltro("personalizado")} style={[st.chip, st.chipIcone, filtro === "personalizado" && st.chipAtivo]}>
            <Feather name="calendar" size={14} color={filtro === "personalizado" ? "#fff" : cor.texto2} />
            <Text style={[st.chipTexto, filtro === "personalizado" && st.chipTextoAtivo]}>Personalizado</Text>
          </Pressable>
        </View>
        {filtro === "personalizado" && (
          <View style={st.linhaCampos}>
            <View style={{ flex: 1 }}><Campo rotulo="De" value={de} onChangeText={t => setDe(mascaraData(t))} keyboardType="number-pad" placeholder="DD/MM/AAAA" /></View>
            <View style={{ flex: 1 }}><Campo rotulo="Até" value={ate} onChangeText={t => setAte(mascaraData(t))} keyboardType="number-pad" placeholder="DD/MM/AAAA" /></View>
          </View>
        )}
      </View>

      <View style={st.tabela}>
        <View style={[st.linha, st.cabecalho]}>
          <Text style={[st.colData, st.cabTexto]}>Data</Text>
          <Text style={[st.colDesc, st.cabTexto]}>Descrição</Text>
          <Text style={[st.colValor, st.cabTexto]}>Valor</Text>
        </View>
        {dados && lista.length === 0 && <Text style={st.vazio}>Nenhuma transação {filtro === "personalizado" ? "neste período" : "ainda"}.</Text>}
        {lista.map(m => (
          <View key={m.id} style={st.linha}>
            <Text style={st.colData}>{dataBR(m.data)} <Text style={st.hora}>{horaBR(m.data)}</Text></Text>
            <View style={st.colDesc}>
              <Text style={st.desc}>{m.descricao}</Text>
              {m.status === "PENDENTE" && <Text style={st.pendente}>em análise</Text>}
              {m.bonusDinamico > 0 ? <Text style={st.dinamico}>⚡ inclui preço dinâmico +{moeda(m.bonusDinamico)}</Text> : null}
              {m.tipo === "SAQUE" && m.status !== "RECUSADO" && /taxa/.test(m.detalhe || "") ? <Text style={st.detalhe}>{m.detalhe.split(" · ").slice(-1)[0]}</Text> : null}
              {m.status === "RECUSADO" && m.detalhe ? <Text style={st.detalhe} numberOfLines={2}>{m.detalhe}</Text> : null}
            </View>
            {m.status === "RECUSADO"
              ? <Text style={[st.colValor, st.valorRiscado]}>{moeda(m.valorOriginal)}</Text>
              : <Text style={[st.colValor, { color: m.valor >= 0 ? cor.ok : cor.critico }]}>{m.valor >= 0 ? "+ " : "- "}{moeda(Math.abs(m.valor))}</Text>}
          </View>
        ))}
      </View>

      {retirar && dados && <RetirarSaldo dados={dados} onFechar={() => setRetirar(false)} onFeito={() => { setRetirar(false); carregar(); }} />}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  tela: { padding: 16, gap: 14, paddingBottom: 140, maxWidth: 640, width: "100%", alignSelf: "center" },
  topo: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  titulo: { flexDirection: "row", alignItems: "center", gap: 8 },
  tituloTexto: { color: cor.texto, fontSize: 20, fontWeight: "800" },
  subtitulo: { color: cor.texto, fontSize: 18, fontWeight: "700" },
  retirar: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: cor.primaria, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 10, flexShrink: 0 },
  retirarTexto: { color: "#fff", fontWeight: "700", fontSize: 15 },
  saldo: { backgroundColor: cor.superficie, borderRadius: 12, borderWidth: 1, borderColor: cor.borda, padding: 20, gap: 6 },
  saldoRotulo: { color: cor.texto3, fontSize: 13, fontWeight: "700", letterSpacing: 0.5 },
  saldoValor: { color: cor.texto, fontSize: 32, fontWeight: "800" },
  filtros: { backgroundColor: cor.superficie, borderRadius: 12, borderWidth: 1, borderColor: cor.borda, padding: 12, gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: cor.borda, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: cor.superficie2 },
  chipIcone: { flexDirection: "row", alignItems: "center", gap: 6 },
  chipAtivo: { backgroundColor: cor.primaria, borderColor: cor.primaria },
  chipTexto: { color: cor.texto2, fontWeight: "600" },
  chipTextoAtivo: { color: "#fff" },
  tabela: { backgroundColor: cor.superficie, borderRadius: 12, borderWidth: 1, borderColor: cor.borda, overflow: "hidden" },
  linha: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: 1, borderTopColor: cor.borda },
  cabecalho: { backgroundColor: cor.superficie2, borderTopWidth: 0 },
  cabTexto: { color: cor.texto2, fontWeight: "700" },
  colData: { width: 108, color: cor.texto2, fontSize: 13 },
  hora: { color: cor.texto3, fontSize: 11 },
  colDesc: { flex: 1 },
  desc: { color: cor.texto, fontSize: 14 },
  detalhe: { color: cor.texto3, fontSize: 11 },
  pendente: { color: cor.aviso, fontSize: 11, fontWeight: "700" },
  dinamico: { color: cor.aviso, fontSize: 11, fontWeight: "700" },
  colValor: { width: 104, textAlign: "right", fontWeight: "700", fontSize: 14 },
  valorRiscado: { color: cor.texto3, textDecorationLine: "line-through" },
  vazio: { color: cor.texto3, textAlign: "center", padding: 24 },
  modalFundo: { flex: 1, backgroundColor: "rgba(3,8,18,0.75)", justifyContent: "center", padding: 14 },
  modal: { backgroundColor: cor.superficie, borderRadius: 16, borderWidth: 1, borderColor: cor.borda, maxWidth: 520, width: "100%", alignSelf: "center", flexGrow: 0, maxHeight: "100%" },
  modalTitulo: { color: cor.texto, fontSize: 19, fontWeight: "800" },
  modalTexto: { color: cor.texto2, fontSize: 14, lineHeight: 20 },
  saldoModal: { backgroundColor: cor.superficie2, borderRadius: 10, padding: 12, gap: 2 },
  saldoModalValor: { color: cor.texto, fontSize: 24, fontWeight: "800" },
  rotulo: { color: cor.texto2, fontSize: 13, fontWeight: "600", marginTop: 4 },
  regra: { color: cor.texto3, fontSize: 12 },
  contaCaixa: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: cor.borda, borderRadius: 10, padding: 12 },
  contaTexto: { color: cor.texto, fontWeight: "600" },
  contaSub: { color: cor.texto3, fontSize: 12 },
  link: { color: cor.primariaClara, fontWeight: "700" },
  botoes: { flexDirection: "row", gap: 10, marginTop: 6 },
  linhaCampos: { flexDirection: "row", gap: 10 },
  feitoIcone: { alignSelf: "center", width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(34,197,94,0.15)", alignItems: "center", justifyContent: "center" },
});
