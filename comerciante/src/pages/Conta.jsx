import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Cabecalho, Campo, useAcao } from "../components/ui";
import { VEICULOS, data } from "../utils/format";

function endereco(e) {
  return [e.rua && `${e.rua}${e.numero ? `, ${e.numero}` : ""}`, e.complemento, e.bairro, e.cidade, e.cep].filter(Boolean).join(" - ");
}

export default function Conta() {
  const { loja, email } = useAuth();
  const [s, setS] = useState({ atual: "", nova: "", repetir: "" });
  const { executar, ocupado } = useAcao();
  const set = k => e => setS({ ...s, [k]: e.target.value });

  async function trocarSenha(e) {
    e.preventDefault();
    if (s.nova !== s.repetir) {
      await executar(() => Promise.reject(new Error("A confirmação não confere com a nova senha.")));
      return;
    }
    if (await executar(() => api.patch("/senha", { atual: s.atual, nova: s.nova }), "Senha alterada.")) setS({ atual: "", nova: "", repetir: "" });
  }

  if (!loja) return null;
  return (
    <>
      <Cabecalho titulo="Minha conta" subtitulo="Dados da sua loja. Para mudar algum dado, fale com a equipe em Mensagens." />

      <div className="grade-2">
        <section className="cartao">
          <h3 className="secao-titulo">Loja</h3>
          <dl className="detalhes">
            <dt>Nome fantasia</dt><dd>{loja.nomeFantasia}</dd>
            {loja.razaoSocial && <><dt>Razão social</dt><dd>{loja.razaoSocial}</dd></>}
            {loja.documento && <><dt>{loja.tipoDocumento === "CPF" ? "CPF" : "CNPJ"}</dt><dd>{loja.documento}</dd></>}
            {loja.segmento && <><dt>Segmento</dt><dd>{loja.segmento}</dd></>}
            <dt>Responsável</dt><dd>{loja.nomeCompleto || "—"}</dd>
            <dt>Telefone</dt><dd>{loja.telefone || "—"}</dd>
            <dt>E-mail</dt><dd>{loja.email || "—"}</dd>
            <dt>Modalidade</dt><dd>{loja.modalidadeCobranca === "CREDITO" ? "Crédito (pré-pago)" : "Faturamento"}</dd>
            <dt>Pagamento</dt><dd>{loja.metodoPagamento || "—"}</dd>
            <dt>Veículos</dt><dd>{loja.precificacoesModal?.length ? loja.precificacoesModal.map(p => VEICULOS[p.veiculo] || p.veiculo).join(", ") : "Todos"}</dd>
            <dt>Cliente desde</dt><dd>{data(loja.createdAt)}</dd>
          </dl>
          <h3 className="secao-titulo">Endereço de coleta</h3>
          {loja.enderecos?.length ? (
            <ul className="lista-simples">
              {loja.enderecos.map(e => (
                <li key={e.id}>{endereco(e)}{e.principal && loja.enderecos.length > 1 && <span className="apagado"> (principal)</span>}{e.referencia && <div className="celula-sub">Referência: {e.referencia}</div>}</li>
              ))}
            </ul>
          ) : <p className="apagado">Nenhum endereço cadastrado — fale com a equipe.</p>}
        </section>

        <section className="cartao">
          <h3 className="secao-titulo">Acesso</h3>
          <p className="apagado" style={{ marginTop: 0 }}>Você entra com <strong>{email}</strong>.</p>
          <form onSubmit={trocarSenha} className="grade-campos">
            <Campo rotulo="Senha atual" largo><input type="password" autoComplete="current-password" value={s.atual} onChange={set("atual")} required /></Campo>
            <Campo rotulo="Nova senha" dica="Mínimo de 6 caracteres."><input type="password" autoComplete="new-password" minLength={6} value={s.nova} onChange={set("nova")} required /></Campo>
            <Campo rotulo="Repita a nova senha"><input type="password" autoComplete="new-password" minLength={6} value={s.repetir} onChange={set("repetir")} required /></Campo>
            <div className="form-rodape campo-largo">
              <button type="submit" className="btn btn-primario" disabled={ocupado}>Trocar senha</button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
