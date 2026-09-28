// Cadastros › Comércio › Novo / Editar — formulário completo do cliente (comércio).
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { Botao, Cabecalho, Campo, Carregando, ErroCaixa, useAcao } from "../components/ui";
import MapaLocalizacao from "../components/MapaLocalizacao";
import { reduzirImagem } from "../utils/imagem";
import { CADASTRO_VIA, VEICULOS, paraInputData } from "../utils/format";
import { buscarCep, erroDocumento, mascaraCep, mascaraDocumento, mascaraTelefone, soDigitos } from "../utils/documento";

const SEGMENTOS = [
  "Restaurante", "Lanchonete", "Pizzaria", "Hamburgueria", "Comida Variada", "Comida Japonesa", "Açaí e Sorvetes",
  "Doces", "Padaria", "Mercado", "Hortifrúti", "Açougue", "Bebidas", "Farmácia", "Pet Shop", "Floricultura",
  "Loja de Conveniência", "Moda e Acessórios", "Eletrônicos", "Papelaria", "Outros",
];

const METODOS_PAGAMENTO = ["Pix", "Boleto", "Cartão de crédito", "Transferência bancária", "Dinheiro", "Faturado mensal"];

// Ordem da tela: bike, carro, moto.
const ORDEM_VEICULOS = ["BIKE", "CARRO", "MOTO"];
const TIPOS_PRECIFICACAO = { DISTANCIA: "Distância", PADRAO: "Padrão", ZONA: "Zona", BAIRRO: "Bairro", ZERAR: "Sem cobrança" };

const DADOS_VAZIOS = {
  fotoUrl: "", segmento: "", dataInicio: "", razaoSocial: "", nomeFantasia: "", tabelaComissaoId: "", cadastroVia: "",
  tipoDocumento: "CNPJ", franquia: "", hub: "", leadCadastradoPor: "", nomeCompleto: "", documento: "", dataNascimento: "",
  telefone: "", email: "", metodoPagamento: "", observacoes: "",
};

const ENDERECO_VAZIO = { cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", referencia: "", lat: null, lng: null, principal: false };
// Mudar estes campos invalida a posição no mapa (será localizada de novo ao salvar).
const CAMPOS_QUE_MOVEM = ["cep", "rua", "numero", "bairro", "cidade"];

function precosIniciais(lista = []) {
  return Object.fromEntries(ORDEM_VEICULOS.map(vei => {
    const p = lista.find(x => x.veiculo === vei);
    return [vei, {
      precoPorPonto: p?.precoPorPonto ?? "",
      tipoPrecificacao: p?.tipoPrecificacao || "DISTANCIA",
      tabelaPrecoKmId: p?.tabelaPrecoKmId || "",
    }];
  }));
}

function textoDoEndereco(e) {
  return [e.rua && `${e.rua}${e.numero ? ", " + e.numero : ""}`, e.bairro, e.cidade].filter(Boolean).join(", ");
}

function BlocoEndereco({ e, indice, total, onChange, onRemover, onTornarPrincipal, onAjustarMapa }) {
  const set = campo => ev => {
    let valor = ev.target.value;
    if (campo === "cep") valor = mascaraCep(valor);
    const novo = { ...e, [campo]: valor };
    if (CAMPOS_QUE_MOVEM.includes(campo)) Object.assign(novo, { lat: null, lng: null });
    onChange(novo);
    // CEP completo: preenche rua, bairro e cidade.
    if (campo === "cep" && soDigitos(valor).length === 8) {
      buscarCep(valor).then(r => {
        if (r) onChange({ ...novo, rua: r.rua || novo.rua, bairro: r.bairro || novo.bairro, cidade: r.cidade || novo.cidade });
      });
    }
  };

  return (
    <div className="bloco-endereco">
      {total > 1 && (
        <div className="bloco-endereco-topo">
          <label className="campo-check">
            <input type="radio" name="endereco-principal" checked={e.principal} onChange={onTornarPrincipal} />
            <span>Endereço principal (origem das entregas)</span>
          </label>
          <button type="button" className="link link-perigo" onClick={onRemover}>Remover endereço</button>
        </div>
      )}
      <div className="grade-campos">
        <Campo rotulo="CEP"><input value={e.cep} onChange={set("cep")} inputMode="numeric" placeholder="00000-000" /></Campo>
        <Campo rotulo={`Rua${indice === 0 ? " *" : ""}`}><input value={e.rua} onChange={set("rua")} required={indice === 0} /></Campo>
        <Campo rotulo="Número"><input value={e.numero} onChange={set("numero")} /></Campo>
        <Campo rotulo="Complemento"><input value={e.complemento} onChange={set("complemento")} /></Campo>
        <Campo rotulo="Bairro"><input value={e.bairro} onChange={set("bairro")} /></Campo>
        <Campo rotulo="Cidade"><input value={e.cidade} onChange={set("cidade")} /></Campo>
        <Campo rotulo="Referência de entrega" largo>
          <input value={e.referencia} onChange={set("referencia")} placeholder="Ex.: portão azul ao lado da farmácia" />
        </Campo>
      </div>
      <div className="linha-acao">
        <Botao pequeno onClick={onAjustarMapa} disabled={!e.rua && e.lat == null}>📍 Ajustar localização no mapa</Botao>
        <span className={e.lat != null ? "sucesso-inline" : "apagado"}>
          {e.lat != null ? `✓ Localização definida (${e.lat.toFixed(5)}, ${e.lng.toFixed(5)})` : "Sem posição — será localizado automaticamente ao salvar."}
        </span>
      </div>
    </div>
  );
}

export default function FormComercio() {
  const { id } = useParams();
  const novo = !id;
  const navegar = useNavigate();
  const { podeEditar } = useAuth();
  const pode = podeEditar("comercios");

  const existente = useApi(novo ? null : `/comercios/${id}`);
  const { dados: tabelasKm } = useApi("/cadastro/tabela-preco-km");
  const { dados: comissoes } = useApi("/cadastro/tabela-comissoes");
  const { dados: franquias } = useApi("/cadastro/franquias");
  const { dados: hubs } = useApi("/cadastro/hubs");

  const [v, setV] = useState(DADOS_VAZIOS);
  const [precos, setPrecos] = useState(precosIniciais());
  const [enderecos, setEnderecos] = useState([{ ...ENDERECO_VAZIO, principal: true }]);
  const [senha, setSenha] = useState("");
  const [mapaDo, setMapaDo] = useState(null); // índice do endereço no mapa
  const [erros, setErros] = useState({});
  const [carregado, setCarregado] = useState(novo);
  const { executar, ocupado } = useAcao();

  // Preenche o formulário ao editar.
  useEffect(() => {
    const c = existente.dados;
    if (!c || carregado) return;
    const d = {};
    Object.keys(DADOS_VAZIOS).forEach(k => { d[k] = c[k] ?? ""; });
    d.tipoDocumento = c.tipoDocumento || "CNPJ";
    d.documento = mascaraDocumento(d.tipoDocumento, c.documento || "");
    d.telefone = mascaraTelefone(c.telefone || "");
    d.dataInicio = paraInputData(c.dataInicio);
    d.dataNascimento = paraInputData(c.dataNascimento);
    setV(d);
    setPrecos(precosIniciais(c.precificacoesModal));
    if (c.enderecos.length) {
      setEnderecos(c.enderecos.map(e => ({
        ...ENDERECO_VAZIO,
        ...Object.fromEntries(Object.keys(ENDERECO_VAZIO).map(k => [k, e[k] ?? ENDERECO_VAZIO[k]])),
        id: e.id,
        cep: mascaraCep(e.cep || ""),
      })));
    }
    setCarregado(true);
  }, [existente.dados, carregado]);

  const set = campo => e => setV({ ...v, [campo]: e.target.value });

  async function escolherFoto(ev) {
    const arquivo = ev.target.files?.[0];
    if (!arquivo) return;
    try {
      setV({ ...v, fotoUrl: await reduzirImagem(arquivo) });
    } catch (err) {
      setErros({ ...erros, fotoUrl: err.message });
    }
  }

  function mudarTipoDocumento(tipo) {
    setV({ ...v, tipoDocumento: tipo, documento: mascaraDocumento(tipo, v.documento) });
    setErros({ ...erros, documento: null });
  }

  function atualizarEndereco(i, novoEndereco) {
    setEnderecos(lista => lista.map((e, j) => (j === i ? novoEndereco : e)));
  }

  function tornarPrincipal(i) {
    setEnderecos(lista => lista.map((e, j) => ({ ...e, principal: j === i })));
  }

  function removerEndereco(i) {
    setEnderecos(lista => {
      const resto = lista.filter((_, j) => j !== i);
      if (!resto.some(e => e.principal) && resto.length) resto[0] = { ...resto[0], principal: true };
      return resto;
    });
  }

  function validar() {
    const e = {};
    if (!v.nomeFantasia.trim() && !v.razaoSocial.trim()) e.nomeFantasia = "Informe o Nome Fantasia ou a Razão Social.";
    const doc = erroDocumento(v.tipoDocumento, v.documento);
    if (doc) e.documento = doc;
    if (senha && senha.length < 6) e.senha = "A senha precisa ter pelo menos 6 caracteres.";
    if (senha && !v.email) e.email = "Informe o e-mail: ele será o login do comerciante.";
    if (!enderecos.some(x => x.rua.trim())) e.enderecos = "Informe pelo menos a rua do endereço principal.";
    setErros(e);
    return Object.keys(e).length === 0;
  }

  async function salvar(ev) {
    ev.preventDefault();
    if (!validar()) {
      document.querySelector(".campo-erro, .erro-caixa")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const corpo = {
      ...v,
      documento: soDigitos(v.documento),
      enderecos: enderecos.filter(e => e.rua.trim()).map(e => ({ ...e, cep: soDigitos(e.cep) })),
      precificacoesModal: ORDEM_VEICULOS.map(veiculo => ({ veiculo, ...precos[veiculo] })),
      acesso: senha ? { email: v.email, senha } : undefined,
    };
    const r = await executar(
      () => (novo ? api.post("/comercios", corpo) : api.put(`/comercios/${id}/cadastro-completo`, corpo)),
      "Cliente salvo."
    );
    if (r) navegar(`/cadastros/comercios?abrir=${r.id}`);
  }

  if (!novo && existente.erro) return <ErroCaixa erro={existente.erro} onTentar={() => existente.recarregar()} />;
  if (!carregado) return <Carregando />;

  const logins = existente.dados?.usuariosAdicionais || [];
  const opcoesComSalvo = (lista, salvo) => (salvo && !lista.includes(salvo) ? [salvo, ...lista] : lista);
  const erroCampo = campo => erros[campo] && <span className="campo-erro">{erros[campo]}</span>;

  return (
    <>
      <Cabecalho titulo={novo ? "Novo cliente" : `Editar · ${existente.dados?.nomeFantasia}`} subtitulo="Cadastros › Comércio">
        <Link to="/cadastros/comercios" className="btn btn-fantasma">Voltar para a lista</Link>
      </Cabecalho>

      {!pode && <div className="aviso-caixa">Sua conta pode apenas visualizar este cadastro.</div>}

      <form className="form-comercio" onSubmit={salvar} noValidate>
        <fieldset disabled={!pode || ocupado}>
          <section className="cartao">
            <div className="foto-comercio">
              {v.fotoUrl ? <img src={v.fotoUrl} alt="Logo do comércio" /> : <span aria-hidden="true">🏪</span>}
              <div>
                <input type="file" accept="image/*" onChange={escolherFoto} aria-label="Foto ou logo do comércio" />
                {v.fotoUrl && <button type="button" className="link link-perigo" onClick={() => setV({ ...v, fotoUrl: "" })}>Remover foto</button>}
                {erroCampo("fotoUrl")}
              </div>
            </div>
            <div className="grade-campos">
              <Campo rotulo="Segmento">
                <select value={v.segmento} onChange={set("segmento")}>
                  <option value="">Selecione</option>
                  {opcoesComSalvo(SEGMENTOS, v.segmento).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Data de Início"><input type="date" value={v.dataInicio} onChange={set("dataInicio")} /></Campo>
              <Campo rotulo="Razão Social"><input value={v.razaoSocial} onChange={set("razaoSocial")} /></Campo>
              <Campo rotulo="Nome Fantasia *">
                <input value={v.nomeFantasia} onChange={set("nomeFantasia")} />
                {erroCampo("nomeFantasia")}
              </Campo>
            </div>
          </section>

          <section className="cartao">
            <h2>Precificação por Modal</h2>
            <p className="apagado">
              Configure a tabela de preço específica para este cliente em cada modal. O valor será calculado automaticamente na criação da entrega.
            </p>
            {ORDEM_VEICULOS.map(vei => (
              <div key={vei} className="linha-modal">
                <Campo rotulo="Veículos"><input value={VEICULOS[vei].toLowerCase()} readOnly tabIndex={-1} className="somente-leitura" /></Campo>
                <Campo rotulo="Preço por Ponto">
                  <input type="number" step="0.01" min="0" placeholder="0,00" value={precos[vei].precoPorPonto}
                    onChange={e => setPrecos({ ...precos, [vei]: { ...precos[vei], precoPorPonto: e.target.value } })} />
                </Campo>
                <Campo rotulo="Tipo de precificação">
                  <select value={precos[vei].tipoPrecificacao} onChange={e => setPrecos({ ...precos, [vei]: { ...precos[vei], tipoPrecificacao: e.target.value } })}>
                    {Object.entries(TIPOS_PRECIFICACAO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Tabela de precificação">
                  <select value={precos[vei].tabelaPrecoKmId} onChange={e => setPrecos({ ...precos, [vei]: { ...precos[vei], tabelaPrecoKmId: e.target.value } })}>
                    <option value="">Selecione...</option>
                    {(tabelasKm || []).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </Campo>
              </div>
            ))}
          </section>

          <section className="cartao">
            <h2>Tabela de Comissão do Entregador</h2>
            <p className="apagado">Define qual tabela de comissão o entregador recebe ao entregar para este comércio.</p>
            <select value={v.tabelaComissaoId} onChange={set("tabelaComissaoId")} aria-label="Tabela de comissão do entregador" className="campo-cheio">
              <option value="">Sem tabela de comissão</option>
              {(comissoes || []).map(c => <option key={c.id} value={c.id}>{VEICULOS[c.categoria]} · {c.percentual}%{c.valorMinimo ? ` (mín. R$ ${c.valorMinimo})` : ""}</option>)}
            </select>
          </section>

          <section className="cartao">
            <div className="grade-campos">
              <Campo rotulo="Cadastro via">
                <select value={v.cadastroVia} onChange={set("cadastroVia")}>
                  <option value="">Selecione</option>
                  {Object.entries(CADASTRO_VIA).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                </select>
              </Campo>
              <div className="campo">
                <span className="campo-rotulo">Tipo de documento</span>
                <div className="radios">
                  {["CPF", "CNPJ"].map(t => (
                    <label key={t}><input type="radio" name="tipoDocumento" checked={v.tipoDocumento === t} onChange={() => mudarTipoDocumento(t)} /> {t}</label>
                  ))}
                </div>
              </div>
              <Campo rotulo="Franquias">
                <select value={v.franquia} onChange={set("franquia")}>
                  <option value="">Selecione</option>
                  {opcoesComSalvo((franquias || []).map(f => f.nome), v.franquia).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Hubs">
                <select value={v.hub} onChange={set("hub")}>
                  <option value="">Selecione</option>
                  {opcoesComSalvo((hubs || []).map(h => h.nome), v.hub).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Lead cadastrado por"><input value={v.leadCadastradoPor} onChange={set("leadCadastradoPor")} /></Campo>
              <Campo rotulo="Nome completo"><input value={v.nomeCompleto} onChange={set("nomeCompleto")} /></Campo>
              <Campo rotulo="CNPJ ou CPF" dica="Informe o CNPJ ou CPF do comércio ou pessoa">
                <input
                  value={v.documento}
                  inputMode="numeric"
                  placeholder={v.tipoDocumento === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"}
                  onChange={e => setV({ ...v, documento: mascaraDocumento(v.tipoDocumento, e.target.value) })}
                  onBlur={() => setErros({ ...erros, documento: erroDocumento(v.tipoDocumento, v.documento) })}
                />
                {erroCampo("documento")}
              </Campo>
              <Campo rotulo="Data de nascimento"><input type="date" value={v.dataNascimento} onChange={set("dataNascimento")} /></Campo>
              <Campo rotulo="Telefone / WhatsApp">
                <input value={v.telefone} inputMode="tel" placeholder="(00) 00000-0000" onChange={e => setV({ ...v, telefone: mascaraTelefone(e.target.value) })} />
              </Campo>
              <Campo rotulo="E-mail" dica="Também é o login do sistema do comerciante quando a senha é preenchida.">
                <input type="email" value={v.email} onChange={set("email")} autoComplete="off" />
                {erroCampo("email")}
              </Campo>
              <Campo
                rotulo="Senha"
                dica={novo
                  ? "Cria o acesso ao sistema do comerciante com o e-mail acima. Deixe em branco para criar depois."
                  : `Preencha só para criar ou redefinir o acesso do e-mail acima. Logins atuais: ${logins.length ? logins.map(l => l.email).join(", ") : "nenhum"}.`}
              >
                <input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="new-password" placeholder={novo ? "" : "••••••••••"} />
                {erroCampo("senha")}
              </Campo>
              <Campo rotulo="Método de pagamento preferido">
                <select value={v.metodoPagamento} onChange={set("metodoPagamento")}>
                  <option value="">Selecione</option>
                  {opcoesComSalvo(METODOS_PAGAMENTO, v.metodoPagamento).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Observações" largo><textarea rows={3} value={v.observacoes} onChange={set("observacoes")} /></Campo>
            </div>
          </section>

          <section className="cartao">
            <h2>Endereço</h2>
            {erros.enderecos && <div className="erro-caixa">{erros.enderecos}</div>}
            {enderecos.map((e, i) => (
              <BlocoEndereco
                key={e.id || `novo-${i}`}
                e={e}
                indice={i}
                total={enderecos.length}
                onChange={novoE => atualizarEndereco(i, novoE)}
                onRemover={() => removerEndereco(i)}
                onTornarPrincipal={() => tornarPrincipal(i)}
                onAjustarMapa={() => setMapaDo(i)}
              />
            ))}
            <Botao onClick={() => setEnderecos([...enderecos, { ...ENDERECO_VAZIO }])}>Adicionar endereço</Botao>
          </section>

          <div className="form-rodape form-rodape-fixo">
            <Link to="/cadastros/comercios" className="btn btn-fantasma">Cancelar</Link>
            <button type="submit" className="btn btn-primario">{ocupado ? "Salvando…" : "Salvar cliente"}</button>
          </div>
        </fieldset>
      </form>

      {mapaDo != null && enderecos[mapaDo] && (
        <MapaLocalizacao
          inicial={enderecos[mapaDo]}
          textoEndereco={textoDoEndereco(enderecos[mapaDo])}
          onFechar={() => setMapaDo(null)}
          onConfirmar={pos => { atualizarEndereco(mapaDo, { ...enderecos[mapaDo], ...pos }); setMapaDo(null); }}
        />
      )}
    </>
  );
}
