// Telas do menu: Carteira, Mensagens, Treinamento, Promoções e Conta.
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { api } from "../api";
import { assinarTempoReal } from "../tempoReal";
import { Botao, Cartao, Erro, Selo, Vazio } from "../componentes";
import { VEICULOS, cor, dataCurta, km, moeda } from "../tema";
import { CamposEndereco } from "./Entrada";

function useCarregar(fn) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const carregar = useCallback(async () => {
    try { setDados(await fn()); setErro(null); } catch (e) { setErro(e.message); }
  }, [fn]);
  useEffect(() => { carregar(); }, [carregar]);
  const puxar = async () => { setAtualizando(true); await carregar(); setAtualizando(false); };
  return { dados, erro, refresh: <RefreshControl refreshing={atualizando} onRefresh={puxar} tintColor={cor.texto2} /> };
}

// ---------- Ganhos ----------

const buscarGanhos = () => Promise.all([api.get("/ganhos"), api.get("/comissoes")]);
const buscarRegras = () => api.get("/saque/regras");

function Periodo({ titulo, g }) {
  return (
    <Cartao estilo={st.periodo}>
      <Text style={st.periodoTitulo}>{titulo}</Text>
      <Text style={st.grande}>{moeda(g?.ganho || 0)}</Text>
      <Text style={st.periodoLinha}>{g?.entregas ?? 0} entrega(s) · {km(g?.distanciaKm || 0)}</Text>
      {g?.comissoes > 0 && <Text style={[st.periodoLinha, { color: cor.ok }]}>inclui {moeda(g.comissoes)} em comissões</Text>}
    </Cartao>
  );
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function textoRegra(r) {
  if (!r) return "—";
  const partes = [
    r.limitePorSolicitacao ? `até ${moeda(r.limitePorSolicitacao)} por pedido` : "sem limite de valor",
    `${r.maxSolicitacoesDia} por dia`,
    r.datasEspecificas?.length ? `nas datas: ${r.datasEspecificas.join(", ")}` : r.diasPermitidos?.length ? `dias: ${r.diasPermitidos.map(d => DIAS[d]).join(", ")}` : "todos os dias",
  ];
  return partes.join(" · ");
}

export function Carteira() {
  const { dados, erro, refresh } = useCarregar(buscarGanhos);
  const { dados: regras } = useCarregar(buscarRegras);
  const [g, c] = dados || [];
  return (
    <ScrollView contentContainerStyle={st.tela} refreshControl={refresh}>
      <Erro texto={erro} />
      {g && (
        <Cartao estilo={{ borderColor: cor.primaria }}>
          <Text style={st.periodoTitulo}>Ganhos de hoje</Text>
          <Text style={[st.grande, { fontSize: 30 }]}>{moeda(g.hoje.ganho)}</Text>
          <Text style={st.periodoLinha}>{moeda(g.hoje.porEntregas)} pelas entregas · {moeda(g.hoje.comissoes)} em comissões</Text>
          <Text style={st.periodoLinha}>{g.hoje.entregas} entrega(s) hoje · {km(g.hoje.distanciaKm || 0)} rodados nas entregas</Text>
        </Cartao>
      )}
      <View style={st.grade}>
        <Periodo titulo="7 dias" g={g?.ultimos7Dias} />
        <Periodo titulo="Este mês" g={g?.mes} />
      </View>
      {g?.ultimas?.length > 0 && (
        <>
          <Text style={st.secao}>Últimas entregas</Text>
          <Cartao>
            {g.ultimas.map(u => (
              <View key={u.id} style={st.entregaLinha}>
                <View style={{ flex: 1 }}>
                  <Text style={st.texto} numberOfLines={1}>{u.comercio}</Text>
                  <Text style={st.textoPequeno}>{dataCurta(u.entregueEm)} · {u.codigo}</Text>
                </View>
                <Text style={st.entregaKm}>{u.distanciaKm != null ? km(u.distanciaKm) : "— km"}</Text>
                <Text style={st.entregaGanho}>{moeda(u.ganho)}</Text>
              </View>
            ))}
          </Cartao>
        </>
      )}
      <Text style={st.secao}>Comissões</Text>
      {c && (
        <View style={st.grade}>
          <Cartao estilo={st.periodo}><Text style={st.periodoTitulo}>No mês</Text><Text style={st.grande}>{moeda(c.totais.mes)}</Text></Cartao>
          <Cartao estilo={st.periodo}><Text style={st.periodoTitulo}>A receber</Text><Text style={[st.grande, { color: cor.aviso }]}>{moeda(c.totais.aReceber)}</Text></Cartao>
        </View>
      )}
      {c && c.comissoes.length === 0 && <Vazio titulo="Nenhuma comissão ainda" texto="Comissões lançadas pela equipe e comissões automáticas por entrega aparecem aqui." />}
      {c?.comissoes.map(x => (
        <Cartao key={x.id}>
          <View style={st.linhaTopo}>
            <Text style={st.valor}>{moeda(x.valor)}</Text>
            <Selo texto={x.situacao === "PAGA" ? "Paga" : "A receber"} corFundo={x.situacao === "PAGA" ? "rgba(34,197,94,0.18)" : "rgba(245,165,36,0.18)"} corTexto={x.situacao === "PAGA" ? cor.ok : cor.aviso} />
          </View>
          <Text style={st.texto}>
            {x.origem === "AUTOMATICA" ? `Entrega ${x.pedidoCodigo || ""} · ${x.comercio}` : `${x.quantidadeEntregas} entrega(s) · ${x.comercio}`}
          </Text>
          <Text style={st.textoPequeno}>{dataCurta(x.referencia)}{x.descricao ? ` · ${x.descricao}` : ""}</Text>
        </Cartao>
      ))}
      {regras && (
        <>
          <Text style={st.secao}>Regras de saque</Text>
          <Cartao>
            <Text style={st.valor}>Saque normal</Text>
            <Text style={st.texto}>{textoRegra(regras.normal)}</Text>
            <Text style={[st.valor, { marginTop: 6 }]}>Saque rápido</Text>
            <Text style={st.texto}>{textoRegra(regras.rapido)}</Text>
            <Text style={st.textoPequeno}>Os pagamentos são feitos pela equipe no acerto. Dúvidas? Fale em Mensagens.</Text>
          </Cartao>
        </>
      )}
    </ScrollView>
  );
}

// ---------- Mensagens (conversa com a equipe; ela responde pelo painel em Mensagens) ----------

export function Mensagens() {
  const [lista, setLista] = useState(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const rolar = useRef(null);

  const carregar = useCallback(() => api.get("/mensagens").then(l => { setLista(l); setErro(null); }).catch(e => setErro(e.message)), []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30000); // reserva
    const sair = assinarTempoReal(["mensagens"], carregar); // resposta da equipe em ~2 s
    return () => { clearInterval(t); sair(); };
  }, [carregar]);

  async function enviar() {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true);
    try {
      const m = await api.post("/mensagens", { texto: t });
      setLista(l => [...(l || []), m]);
      setTexto("");
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView ref={rolar} contentContainerStyle={[st.tela, { paddingBottom: 16 }]} onContentSizeChange={() => rolar.current?.scrollToEnd({ animated: false })}>
        <Erro texto={erro} />
        {lista && lista.length === 0 && <Vazio titulo="Fale com a equipe" texto="Mande sua dúvida ou avise algum problema. A equipe responde por aqui." />}
        {(lista || []).map(m => (
          <View key={m.id} style={[st.balao, m.minha ? st.balaoMeu : st.balaoEquipe]}>
            {!m.minha && <Text style={st.balaoAutor}>Equipe Route</Text>}
            <Text style={st.balaoTexto}>{m.texto}</Text>
            <Text style={st.balaoHora}>{dataCurta(m.createdAt)} {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={st.escrever}>
        <TextInput value={texto} onChangeText={setTexto} placeholder="Escreva uma mensagem" placeholderTextColor={cor.texto3} style={st.escreverInput} multiline />
        <Pressable onPress={enviar} disabled={enviando || !texto.trim()} style={[st.enviar, (!texto.trim() || enviando) && { opacity: 0.5 }]} accessibilityLabel="Enviar">
          <Feather name="send" size={20} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------- Treinamento ----------

const DICAS = [
  ["power", "Fique online", "Toque no botão Offline no mapa. O app pede sua localização para mostrar corridas perto de você."],
  ["map-pin", "Aceite uma corrida", "Em Disponíveis aparecem os pedidos prontos. Veja a loja, o destino e a distância e toque em Aceitar."],
  ["truck", "Siga as etapas", "Em Andamento: Cheguei na loja → Saí para entrega → Cheguei no cliente → Finalizar entrega. A equipe acompanha tudo no painel."],
  ["navigation", "Use a rota", "O botão Rota abre o Google Maps já com o destino. Você também pode ligar para a loja ou o cliente."],
  ["credit-card", "Acompanhe seus ganhos", "O cartão Ganhos mostra o valor de hoje. Na Carteira ficam os ganhos da semana, do mês e as comissões."],
  ["message-square", "Precisa de ajuda?", "Use Suporte ou Mensagens para falar com a equipe da operação."],
];

export function Treinamento() {
  return (
    <ScrollView contentContainerStyle={st.tela}>
      {DICAS.map(([icone, titulo, texto], i) => (
        <Cartao key={titulo} estilo={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
          <View style={st.dicaIcone}><Feather name={icone} size={20} color={cor.primariaClara} /></View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={st.valor}>{i + 1}. {titulo}</Text>
            <Text style={st.texto}>{texto}</Text>
          </View>
        </Cartao>
      ))}
    </ScrollView>
  );
}

// ---------- Promoções ----------

const buscarPromocoes = () => api.get("/promocoes");

export function Promocoes() {
  const { dados, erro, refresh } = useCarregar(buscarPromocoes);
  return (
    <ScrollView contentContainerStyle={st.tela} refreshControl={refresh}>
      <Erro texto={erro} />
      {dados && dados.length === 0 && <Vazio titulo="Nenhuma promoção agora" texto="Quando a equipe ativar uma promoção, ela aparece aqui e você recebe um aviso." />}
      {(dados || []).map(p => (
        <Cartao key={p.id} estilo={{ padding: 0, overflow: "hidden" }}>
          {p.fotoUrl ? <Image source={{ uri: p.fotoUrl }} style={st.foto} resizeMode="cover" /> : null}
          <View style={{ padding: 16, gap: 6 }}>
            <Text style={st.promoTitulo}>{p.titulo}</Text>
            {p.premio && <Text style={st.premio}>🎁 {p.premio}</Text>}
            {p.descricao && <Text style={st.texto}>{p.descricao}</Text>}
            {(p.inicio || p.fim) && <Text style={st.textoPequeno}>{p.inicio ? `De ${dataCurta(p.inicio)}` : ""}{p.fim ? ` até ${dataCurta(p.fim)}` : ""}</Text>}
          </View>
        </Cartao>
      ))}
    </ScrollView>
  );
}

// ---------- Perfil ----------

const STATUS = { ATIVO: ["Ativo", cor.ok], EM_ANALISE: ["Em análise", cor.aviso], INATIVO: ["Inativo", cor.critico] };

function textoEndereco(e) {
  return [e?.rua && `${e.rua}${e.numero ? `, ${e.numero}` : ""}`, e?.complemento, e?.bairro, e?.cidade, e?.cep].filter(Boolean).join(" - ");
}

function MeuEndereco({ entregador, setEntregador }) {
  const [editando, setEditando] = useState(false);
  const [e, setE] = useState(null);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  function abrir() {
    const x = entregador || {};
    setE({ busca: [x.rua, x.numero].filter(Boolean).join(", "), rua: x.rua || "", numero: x.numero || "", complemento: x.complemento || "", bairro: x.bairro || "", cidade: x.cidade || "", cep: x.cep || "" });
    setErro(null);
    setEditando(true);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const { busca, ...dados } = e;
      setEntregador(await api.patch("/endereco", dados));
      setEditando(false);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao>
      <Text style={st.secao}>Meu endereço</Text>
      {editando ? (
        <>
          <CamposEndereco e={e} setE={setE} />
          <Erro texto={erro} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Botao titulo="Cancelar" variante="secundario" onPress={() => setEditando(false)} estilo={{ flex: 1 }} />
            <Botao titulo="Salvar" onPress={salvar} carregando={salvando} desabilitado={!e.rua?.trim()} estilo={{ flex: 1 }} />
          </View>
        </>
      ) : (
        <>
          <Text style={st.texto}>{textoEndereco(entregador) || "Nenhum endereço cadastrado."}</Text>
          <Botao pequeno variante="secundario" titulo={entregador?.rua ? "Alterar endereço" : "Cadastrar endereço"} onPress={abrir} />
        </>
      )}
    </Cartao>
  );
}

export function Perfil({ entregador, setEntregador, onSair }) {
  const [rotulo, c] = STATUS[entregador?.status] || [entregador?.status, cor.texto2];
  const linhas = [
    ["E-mail", entregador?.email], ["Telefone", entregador?.telefone], ["Veículo", [VEICULOS[entregador?.veiculoTipo], entregador?.veiculoModelo, entregador?.veiculoPlaca].filter(Boolean).join(" · ")],
  ];
  return (
    <ScrollView contentContainerStyle={st.tela} keyboardShouldPersistTaps="handled">
      <Cartao>
        <Text style={st.nome}>{entregador?.nomeCompleto}</Text>
        <Selo texto={rotulo} corFundo="rgba(255,255,255,0.06)" corTexto={c} />
        {linhas.filter(([, v]) => v).map(([r, v]) => (
          <View key={r} style={st.perfilLinha}><Text style={st.perfilRotulo}>{r}</Text><Text style={st.texto}>{v}</Text></View>
        ))}
      </Cartao>
      <MeuEndereco entregador={entregador} setEntregador={setEntregador} />
      <Text style={st.textoPequeno}>Para alterar seus dados, fale com a equipe da operação.</Text>
      <Botao titulo="Sair da conta" variante="perigo" onPress={onSair} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  tela: { padding: 16, gap: 12, paddingBottom: 32, maxWidth: 560, width: "100%", alignSelf: "center" },
  grade: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  periodo: { flexGrow: 1, flexBasis: 150, gap: 4 },
  periodoTitulo: { color: cor.texto3, fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  grande: { color: cor.texto, fontSize: 24, fontWeight: "800" },
  grandeUnidade: { fontSize: 14, color: cor.texto2, fontWeight: "600" },
  periodoLinha: { color: cor.texto2, fontSize: 14 },
  secao: { color: cor.texto2, fontSize: 13, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginTop: 6 },
  linhaTopo: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  valor: { color: cor.texto, fontSize: 20, fontWeight: "800" },
  texto: { color: cor.texto2, fontSize: 15 },
  textoPequeno: { color: cor.texto3, fontSize: 13 },
  foto: { width: "100%", height: 170, backgroundColor: cor.superficie2 },
  promoTitulo: { color: cor.texto, fontSize: 19, fontWeight: "800" },
  premio: { color: cor.ok, fontSize: 15, fontWeight: "700" },
  nome: { color: cor.texto, fontSize: 22, fontWeight: "800" },
  perfilLinha: { gap: 2 },
  entregaLinha: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: cor.borda },
  entregaKm: { color: cor.texto2, fontSize: 14, fontWeight: "700", minWidth: 58, textAlign: "right" },
  entregaGanho: { color: cor.ok, fontSize: 15, fontWeight: "800", minWidth: 72, textAlign: "right" },
  balao: { maxWidth: "82%", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  balaoMeu: { alignSelf: "flex-end", backgroundColor: cor.primaria, borderBottomRightRadius: 4 },
  balaoEquipe: { alignSelf: "flex-start", backgroundColor: cor.superficie2, borderBottomLeftRadius: 4 },
  balaoAutor: { color: cor.primariaClara, fontSize: 12, fontWeight: "700" },
  balaoTexto: { color: "#fff", fontSize: 15, lineHeight: 20 },
  balaoHora: { color: "rgba(255,255,255,0.6)", fontSize: 11, alignSelf: "flex-end" },
  escrever: { flexDirection: "row", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: cor.borda, backgroundColor: cor.superficie, alignItems: "flex-end" },
  escreverInput: { flex: 1, maxHeight: 120, backgroundColor: cor.superficie2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: cor.texto, fontSize: 15, borderWidth: 1, borderColor: cor.borda },
  enviar: { width: 46, height: 46, borderRadius: 23, backgroundColor: cor.primaria, alignItems: "center", justifyContent: "center" },
  dicaIcone: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(77,163,255,0.14)", alignItems: "center", justifyContent: "center" },
  perfilRotulo: { color: cor.texto3, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
});
