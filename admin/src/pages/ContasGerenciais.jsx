import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useApi } from "../hooks/useApi";
import { Badge, Botao, BotaoConfirmar, Cabecalho, Carregando, ErroCaixa, GradeCampos, Modal, useAcao } from "../components/ui";
import { CARGOS, PERMISSOES, data, opcoes } from "../utils/format";

const DESCRICAO_PERMISSAO = {
  TOTAL: "Tudo, inclusive contas do painel e configurações.",
  OPERACIONAL: "Pedidos, entregadores, comerciantes e mensagens.",
  FINANCEIRO: "Faturas, repasses e regras de preço.",
  LEITURA: "Apenas visualiza.",
};

function FormConta({ conta, onFechar, onSalvo }) {
  const campos = [
    { nome: "nome", rotulo: "Nome", obrigatorio: true, largo: true },
    { nome: "email", rotulo: "E-mail", tipo: "email", obrigatorio: true, largo: true },
    { nome: "cargo", rotulo: "Cargo", tipo: "select", obrigatorio: true, opcoes: opcoes(CARGOS) },
    { nome: "permissao", rotulo: "Permissão", tipo: "select", obrigatorio: true, opcoes: opcoes(PERMISSOES) },
    {
      nome: "senha", rotulo: conta ? "Nova senha" : "Senha", tipo: "password", obrigatorio: !conta, largo: true,
      dica: conta ? "Deixe em branco para manter a atual. Mínimo 8 caracteres." : "Mínimo 8 caracteres.",
    },
  ];
  const [v, setV] = useState({
    nome: conta?.nome || "", email: conta?.email || "", cargo: conta?.cargo || "SUPORTE",
    permissao: conta?.permissao || "OPERACIONAL", senha: "",
  });
  const { executar, ocupado } = useAcao();

  async function salvar(e) {
    e.preventDefault();
    const corpo = { ...v };
    if (!corpo.senha) delete corpo.senha;
    const r = await executar(
      () => (conta ? api.put(`/cadastro/contas-gerenciais/${conta.id}`, corpo) : api.post("/cadastro/contas-gerenciais", corpo)),
      conta ? "Conta atualizada." : "Conta criada."
    );
    if (r) onSalvo();
  }

  return (
    <Modal titulo={conta ? "Editar conta" : "Nova conta do painel"} onFechar={onFechar}>
      <form onSubmit={salvar}>
        <GradeCampos defs={campos} valores={v} onChange={setV} />
        <p className="apagado">{DESCRICAO_PERMISSAO[v.permissao]}</p>
        <div className="form-rodape">
          <Botao variante="fantasma" onClick={onFechar}>Cancelar</Botao>
          <button type="submit" className="btn btn-primario" disabled={ocupado}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ContasGerenciais() {
  const { conta: eu, podeEditar } = useAuth();
  const pode = podeEditar("contas");
  const { dados, erro, recarregar } = useApi("/cadastro/contas-gerenciais");
  const [editando, setEditando] = useState(null);
  const { executar } = useAcao();

  return (
    <>
      <Cabecalho titulo="Contas gerenciais"subtitulo="Quem acessa este painel administrativo e o que cada um pode fazer">
        {pode && <Botao variante="primario" onClick={() => setEditando("nova")}>+ Nova conta</Botao>}
      </Cabecalho>
      {!pode && <div className="aviso-caixa">Somente contas com permissão Total podem gerenciar as contas do painel.</div>}
      <ErroCaixa erro={erro} />

      <div className="cartao cartao-tabela">
        {!dados ? <Carregando /> : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Cargo</th><th>Permissão</th><th>Criada em</th>{pode && <th />}</tr></thead>
              <tbody>
                {dados.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.nome}</strong>{c.id === eu.id && <span className="apagado"> (você)</span>}</td>
                    <td>{c.email}</td>
                    <td>{CARGOS[c.cargo]}</td>
                    <td><Badge tom={c.permissao === "TOTAL" ? "info" : "neutro"}>{PERMISSOES[c.permissao]}</Badge></td>
                    <td>{data(c.createdAt)}</td>
                    {pode && (
                      <td className="acoes-celula">
                        <Botao pequeno variante="fantasma" onClick={() => setEditando(c)}>Editar</Botao>
                        {c.id !== eu.id && (
                          <BotaoConfirmar pequeno confirmar="Excluir conta?" onConfirm={async () => {
                            if (await executar(() => api.del(`/cadastro/contas-gerenciais/${c.id}`), "Conta excluída.")) recarregar({ silencioso: true });
                          }}>Excluir</BotaoConfirmar>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editando && (
        <FormConta
          conta={editando === "nova" ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); recarregar({ silencioso: true }); }}
        />
      )}
    </>
  );
}
