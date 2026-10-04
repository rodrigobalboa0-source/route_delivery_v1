import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, qs } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { Botao, Cabecalho, Campo, useAcao } from "../components/ui";
import BuscaEndereco from "../components/BuscaEndereco";
import { VEICULOS, km, moeda } from "../utils/format";
import { mascaraTelefone, soDigitos } from "../utils/documento";

const VAZIO = {
  comercioId: "", clienteNome: "", clienteTelefone: "", endereco: "", complemento: "", formaPagamento: "", prazoDesejado: "", valor: "", observacao: "",
  notaFiscalNumero: "", notaFiscalChave: "", notaFiscalValor: "",
};

export default function NovaEntrega() {
  const navegar = useNavigate();
  const { podeEditar } = useAuth();
  const { dados: comercios } = useApi("/comercios?bloqueado=false");
  const { dados: config } = useApi("/configuracoes");
  const [v, setV] = useState(VAZIO);
  const [veiculo, setVeiculo] = useState("MOTO");
  const [retorno, setRetorno] = useState(false);
  const [destino, setDestino] = useState(null); // posição escolhida na busca
  const [aprox, setAprox] = useState(null);     // posição só da rua (se o número não for localizado)
  const [calculo, setCalculo] = useState(null);
  const [cliente, setCliente] = useState(null); // { salvo, c } | { novo }
  const { executar, ocupado } = useAcao();
  const foneBuscado = useRef("");
  const pct = config?.retornoPercentual ?? 20;

  const set = k => e => {
    setV({ ...v, [k]: e.target.value });
    if (k === "comercioId") { setCalculo(null); setCliente(null); foneBuscado.current = ""; }
  };

  async function calcular(opc = {}) {
    const corpo = {
      comercioId: opc.comercioId ?? v.comercioId, endereco: opc.endereco ?? v.endereco, veiculo: opc.veiculo ?? veiculo,
      destino: opc.destino !== undefined ? opc.destino : destino, destinoAprox: opc.aprox !== undefined ? opc.aprox : aprox,
      retorno: opc.retorno ?? retorno,
    };
    if (!corpo.comercioId || !corpo.endereco) return;
    const r = await executar(() => api.post("/nova-entrega/calcular", corpo));
    if (r) {
      setCalculo(r);
      setV(atual => ({ ...atual, valor: r.valor }));
    }
  }

  // Telefone completo: se o cliente já pediu deste comércio, preenche nome, endereço e complemento.
  async function mudarTelefone(texto) {
    const valor = mascaraTelefone(texto);
    setV(a => ({ ...a, clienteTelefone: valor }));
    const d = soDigitos(valor);
    if (![10, 11].includes(d.length) || !v.comercioId) { setCliente(null); foneBuscado.current = ""; return; }
    if (d === foneBuscado.current) return;
    foneBuscado.current = d;
    const c = await api.get(`/nova-entrega/cliente${qs({ comercioId: v.comercioId, telefone: d })}`).catch(() => null);
    if (foneBuscado.current !== d) return;
    if (!c) { setCliente({ novo: true }); return; }
    const pos = c.lat != null ? { lat: c.lat, lng: c.lng } : null;
    setV(a => ({ ...a, clienteNome: c.nome, endereco: c.endereco, complemento: c.complemento || "" }));
    setDestino(pos);
    setAprox(null);
    setCliente({ salvo: true, c });
    calcular({ endereco: c.endereco, destino: pos, aprox: null });
  }

  function escolherEndereco(e) {
    const pos = e.exato ? { lat: e.lat, lng: e.lng } : null;
    const ap = e.exato ? null : { lat: e.lat, lng: e.lng };
    setV(a => ({ ...a, endereco: e.endereco }));
    setDestino(pos);
    setAprox(ap);
    calcular({ endereco: e.endereco, destino: pos, aprox: ap });
  }

  async function criar(e) {
    e.preventDefault();
    const r = await executar(() => api.post("/nova-entrega", { ...v, destino, destinoAprox: aprox, retorno, veiculo }), `Pedido criado.`);
    if (r) navegar(`/operacao?abrir=${r.id}`);
  }

  if (!podeEditar("pedidos")) {
    return (
      <>
        <Cabecalho titulo="Nova Entrega" />
        <div className="aviso-caixa">Sua conta não tem permissão para criar entregas.</div>
      </>
    );
  }

  return (
    <>
      <Cabecalho titulo="Nova Entrega" subtitulo="Crie uma entrega em nome de um comerciante. Ela entra como “Preparando” até ser marcada como pronta." />

      <form onSubmit={criar} className="cartao form-pagina">
        <h3 className="secao-titulo">Origem</h3>
        <div className="grade-campos">
          <Campo rotulo="Comerciante *" largo>
            <select value={v.comercioId} onChange={set("comercioId")} required>
              <option value="">Selecione…</option>
              {(comercios || []).map(c => <option key={c.id} value={c.id}>{c.nomeFantasia}</option>)}
            </select>
          </Campo>
        </div>

        <h3 className="secao-titulo">Cliente e destino</h3>
        <div className="grade-campos">
          <Campo
            rotulo="Telefone do cliente"
            dica={cliente?.salvo
              ? <span className="aviso-cliente-adm salvo">✓ Cliente salvo: {cliente.c.nome} · {cliente.c.totalPedidos} pedido(s) — dados preenchidos</span>
              : cliente?.novo ? <span className="aviso-cliente-adm novo">Cliente novo — fica salvo por este telefone</span>
                : v.comercioId ? "Se o cliente já pediu deste comércio, os dados aparecem sozinhos." : "Escolha o comerciante primeiro."}
          >
            <input type="tel" value={v.clienteTelefone} onChange={e => mudarTelefone(e.target.value)} placeholder="(11) 90000-0000" />
          </Campo>
          <Campo rotulo="Nome do cliente *"><input value={v.clienteNome} onChange={set("clienteNome")} required /></Campo>
          <Campo rotulo="Endereço de entrega *" largo dica="Digite a rua e o número e escolha na lista (OpenStreetMap). A distância é pelo percurso real.">
            <BuscaEndereco
              valor={v.endereco}
              comercioId={v.comercioId}
              rotulo="Endereço de entrega"
              obrigatorio
              onChange={t => { setV(a => ({ ...a, endereco: t })); setDestino(null); setAprox(null); setCalculo(null); }}
              onEscolher={escolherEndereco}
            />
          </Campo>
          <Campo rotulo="Complemento"><input value={v.complemento} onChange={set("complemento")} placeholder="Apto, bloco, referência" /></Campo>
          <label className="campo campo-switch">
            <input type="checkbox" role="switch" checked={retorno} onChange={e => { setRetorno(e.target.checked); if (calculo) calcular({ retorno: e.target.checked }); }} />
            <span className="interruptor" aria-hidden="true" />
            <span>Com retorno à loja (+{pct}% na taxa)</span>
          </label>
        </div>

        <h3 className="secao-titulo">Valor</h3>
        <div className="linha-acao">
          <select value={veiculo} onChange={e => { setVeiculo(e.target.value); if (calculo) calcular({ veiculo: e.target.value }); }} aria-label="Veículo para o cálculo" style={{ flex: "0 0 auto", minWidth: 105 }}>
            {Object.entries(VEICULOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
          <Botao disabled={!v.comercioId || !v.endereco || ocupado} onClick={() => calcular()}>Calcular distância e valor</Botao>
          {calculo && (
            <span className="sucesso-inline">
              ✓ {km(calculo.distanciaKm)} de percurso · {moeda(calculo.valor)}
              {(calculo.acrescimoRetorno > 0 || calculo.acrescimoDinamico > 0) && (
                <span className="apagado">
                  {" "}(taxa {moeda(calculo.valorBase)}
                  {calculo.acrescimoRetorno > 0 && <> + retorno {calculo.retornoPercentual}% {moeda(calculo.acrescimoRetorno)}</>}
                  {calculo.acrescimoDinamico > 0 && <> + <strong style={{ color: "var(--aviso)" }}>preço dinâmico {moeda(calculo.acrescimoDinamico)}</strong> — {calculo.descricaoDinamica}</>})
                </span>
              )}
              {calculo.fonte && <span className="apagado"> · {calculo.fonte === "google" ? "Google Maps" : "OpenStreetMap"}</span>}
            </span>
          )}
        </div>
        <div className="grade-campos" style={{ marginTop: 12 }}>
          <Campo rotulo="Valor da entrega (R$)" dica="Em branco = cálculo automático ao criar (com o retorno, se marcado).">
            <input type="number" step="0.01" min="0" value={v.valor} onChange={set("valor")} />
          </Campo>
          <Campo rotulo="Forma de pagamento"><input value={v.formaPagamento} onChange={set("formaPagamento")} placeholder="Pix, cartão, dinheiro…" /></Campo>
          <Campo rotulo="Prazo desejado"><input value={v.prazoDesejado} onChange={set("prazoDesejado")} placeholder="Ex.: até 40 min" /></Campo>
          <Campo rotulo="Observação para o entregador" largo>
            <textarea rows={2} value={v.observacao} onChange={set("observacao")} />
          </Campo>
        </div>

        <h3 className="secao-titulo">Nota fiscal (opcional)</h3>
        <div className="grade-campos">
          <Campo rotulo="Nº da nota fiscal"><input value={v.notaFiscalNumero} onChange={set("notaFiscalNumero")} /></Campo>
          <Campo rotulo="Valor da nota (R$)"><input type="number" step="0.01" min="0" value={v.notaFiscalValor} onChange={set("notaFiscalValor")} /></Campo>
          <Campo rotulo="Chave de acesso da NF-e" largo dica="44 dígitos.">
            <input value={v.notaFiscalChave} inputMode="numeric" maxLength={54} onChange={e => setV({ ...v, notaFiscalChave: e.target.value.replace(/[^\d ]/g, "") })} />
          </Campo>
        </div>

        <div className="form-rodape">
          <Botao variante="fantasma" onClick={() => { setV(VAZIO); setCalculo(null); setDestino(null); setRetorno(false); setCliente(null); foneBuscado.current = ""; }}>Limpar</Botao>
          <button type="submit" className="btn btn-primario" disabled={ocupado}>Criar entrega</button>
        </div>
      </form>
    </>
  );
}
