// Créditos: saldo pré-pago da loja, totais, histórico e "Solicitar Créditos" (com o comprovante do pagamento).
// A equipe analisa no ADM (Financeiro › Crédito); aprovada, o valor entra no saldo.
import { useState } from "react";
import { api } from "../api";
import { useApi } from "../hooks/useApi";
import { Badge, Botao, Carregando, ErroCaixa, Modal, useAcao } from "../components/ui";
import { reduzirImagem } from "../utils/imagem";
import { dataHora, moeda } from "../utils/format";

const LIMITE_PDF = 2.5 * 1024 * 1024;

function lerArquivo(arquivo) {
  if (arquivo.type === "application/pdf") {
    if (arquivo.size > LIMITE_PDF) return Promise.reject(new Error("PDF muito grande (máximo 2,5 MB). Envie uma foto ou print do comprovante."));
    return new Promise((ok, erro) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = () => erro(new Error("Não foi possível ler o arquivo."));
      r.readAsDataURL(arquivo);
    });
  }
  if (!arquivo.type.startsWith("image/")) return Promise.reject(new Error("Envie uma imagem (JPG, PNG) ou PDF do comprovante."));
  return reduzirImagem(arquivo, 1600, 0.82);
}

function SolicitarCreditos({ onFechar, onEnviado }) {
  const [valor, setValor] = useState("");
  const [metodo, setMetodo] = useState("PIX");
  const [comprovante, setComprovante] = useState(null); // { nome, dataUrl }
  const [observacao, setObservacao] = useState("");
  const [erroArquivo, setErroArquivo] = useState(null);
  const { executar, ocupado } = useAcao();

  async function escolher(e) {
    const arq = e.target.files?.[0];
    setErroArquivo(null);
    if (!arq) { setComprovante(null); return; }
    try {
      setComprovante({ nome: arq.name, dataUrl: await lerArquivo(arq) });
    } catch (err) {
      setComprovante(null);
      setErroArquivo(err.message);
      e.target.value = "";
    }
  }

  async function confirmar(e) {
    e.preventDefault();
    if (!comprovante) { setErroArquivo("Anexe o comprovante do pagamento para enviar a solicitação."); return; }
    const r = await executar(() => api.post("/creditos/solicitar", { valor, metodo, comprovante: comprovante.dataUrl, observacao }),
      "Solicitação enviada! Assim que a equipe conferir o pagamento, o crédito entra no seu saldo.");
    if (r) onEnviado();
  }

  return (
    <Modal titulo="Solicitar Créditos" onFechar={onFechar}>
      <form onSubmit={confirmar} className="form-credito">
        <p className="apagado" style={{ marginTop: 0 }}>Informe o valor que deseja adicionar à sua carteira.</p>
        <label className="campo">
          <span className="campo-rotulo">Valor (R$)</span>
          <span className="campo-moeda">
            <span aria-hidden="true">R$</span>
            <input type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" value={valor} onChange={e => setValor(e.target.value)} required autoFocus aria-label="Valor em reais" />
          </span>
        </label>
        <div className="campo">
          <span className="campo-rotulo">Método de Pagamento</span>
          <div className="metodos-pagamento" role="radiogroup" aria-label="Método de pagamento">
            {[["PIX", "PIX (Instantâneo)"], ["OUTROS", "Outros"]].map(([v, rot]) => (
              <label key={v} className={`metodo ${metodo === v ? "marcado" : ""}`}>
                <input type="radio" name="metodo" value={v} checked={metodo === v} onChange={() => setMetodo(v)} />
                {rot}
              </label>
            ))}
          </div>
        </div>
        <label className="campo">
          <span className="campo-rotulo">{metodo === "PIX" ? "Comprovante do PIX *" : "Comprovante do pagamento *"}</span>
          <input type="file" accept="image/*,application/pdf" onChange={escolher} />
          <span className="campo-dica">{comprovante ? `✓ ${comprovante.nome}` : "A solicitação só é enviada pra análise depois de anexar o comprovante do pagamento."}</span>
          {erroArquivo && <span className="campo-dica texto-critico">{erroArquivo}</span>}
        </label>
        <label className="campo">
          <span className="campo-rotulo">Observação (Opcional)</span>
          <textarea rows={3} maxLength={500} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex: Pagamento via PIX, comprovante em anexo..." />
        </label>
        <div className="form-rodape">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-primario" disabled={ocupado || !comprovante}>{ocupado ? "Enviando…" : "Confirmar"}</button>
        </div>
      </form>
    </Modal>
  );
}

const STATUS = { PENDENTE: ["aviso", "Em análise"], RECUSADA: ["critico", "Recusada"] };

// Histórico: lançamentos (créditos e usos) + solicitações ainda em análise ou recusadas
// (a aprovada já aparece como crédito lançado).
function historico(d) {
  const movs = d.movimentos.map(m => ({ id: m.id, data: m.createdAt, entrada: m.tipo === "CREDITO", valor: m.valor, texto: m.descricao }));
  const sols = d.solicitacoes.filter(s => s.status !== "APROVADA").map(s => ({
    id: s.id, data: s.createdAt, entrada: true, valor: s.valor, pendente: true, status: s.status,
    texto: `Solicitação de crédito via ${s.metodo === "PIX" ? "PIX" : "outros meios"}${s.observacao ? ` — ${s.observacao}` : ""}`,
    motivo: s.motivo,
  }));
  return [...movs, ...sols].sort((a, b) => new Date(b.data) - new Date(a.data));
}

export default function Creditos() {
  const { dados, erro, carregando, recarregar } = useApi("/creditos");
  const [solicitar, setSolicitar] = useState(false);
  const itens = dados ? historico(dados) : [];

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1 className="titulo-creditos">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M16 12h5v4h-5a2 2 0 0 1 0-4zM3 9h14" /></svg>
            Meus Créditos
          </h1>
          <p className="apagado">Gerencie seu saldo e visualize seu histórico de uso.</p>
        </div>
        <button type="button" className="btn btn-primario" onClick={() => setSolicitar(true)}>Solicitar Créditos</button>
      </div>
      <ErroCaixa erro={erro} onTentar={() => recarregar()} />
      {carregando && !dados ? <Carregando /> : dados && (
        <>
          <div className="creditos-cartoes">
            <div className="credito-cartao credito-saldo">
              <span className="credito-rotulo">SALDO DISPONÍVEL</span>
              <strong>{moeda(dados.saldo)}</strong>
              <span className="credito-pilula">Atualizado agora</span>
            </div>
            <div className="credito-cartao">
              <span className="credito-rotulo"><i className="credito-icone entrada" aria-hidden="true">↗</i> Total Comprado</span>
              <strong>{moeda(dados.totalComprado)}</strong>
            </div>
            <div className="credito-cartao">
              <span className="credito-rotulo"><i className="credito-icone saida" aria-hidden="true">↙</i> Total Utilizado</span>
              <strong>{moeda(dados.totalUtilizado)}</strong>
            </div>
          </div>

          <section className="cartao credito-historico">
            <h2>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
              Histórico de Movimentações
            </h2>
            {itens.length === 0 ? <p className="apagado centro credito-vazio">Nenhuma movimentação encontrada.</p> : (
              <ul className="credito-lista">
                {itens.map(i => (
                  <li key={i.id}>
                    <i className={`credito-icone ${i.entrada ? "entrada" : "saida"}`} aria-hidden="true">{i.entrada ? "↗" : "↙"}</i>
                    <div>
                      <span>{i.texto}</span>
                      <small className="apagado">{dataHora(i.data)}{i.motivo ? ` · Motivo: ${i.motivo}` : ""}</small>
                    </div>
                    {i.pendente && <Badge tom={STATUS[i.status][0]}>{STATUS[i.status][1]}</Badge>}
                    <strong className={i.pendente ? "apagado" : i.entrada ? "texto-ok" : "texto-critico"}>{i.entrada ? "+" : "−"} {moeda(i.valor)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {solicitar && <SolicitarCreditos onFechar={() => setSolicitar(false)} onEnviado={() => { setSolicitar(false); recarregar({ silencioso: true }); }} />}
    </>
  );
}
