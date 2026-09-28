// Comissão automática por entrega (Cadastros › Entregadores › "Comissão automática").
// Quando o entregador finaliza uma entrega, cai para ele o valor fixo configurado no cadastro.
// É um extra pago pela empresa: não altera o valor do pedido (taxa do comércio) nem o repasse
// do entregador. Fica pendente até entrar no Acerto de Entregadores, junto com as entregas.
const prisma = require("../lib/prisma");

async function gerarComissaoAutomatica(pedidoId) {
  const p = await prisma.pedido.findUnique({
    where: { id: pedidoId },
    select: { id: true, codigo: true, status: true, entregueEm: true, entregadorId: true, comercioId: true,
      entregador: { select: { nomeCompleto: true, comissaoAutoAtiva: true, comissaoAutoValor: true } },
      comercio: { select: { nomeFantasia: true } } },
  });
  const e = p?.entregador;
  if (!p || p.status !== "ENTREGUE" || !e?.comissaoAutoAtiva || !(e.comissaoAutoValor > 0)) return null;
  const valor = Math.round(e.comissaoAutoValor * 100) / 100;
  try {
    return await prisma.comissaoManual.create({
      data: {
        origem: "AUTOMATICA", pedidoId: p.id, beneficiarioTipo: "ENTREGADOR", entregadorId: p.entregadorId, beneficiarioNome: e.nomeCompleto,
        comercioId: p.comercioId, comercioNome: p.comercio?.nomeFantasia || "—", quantidadeEntregas: 1, valorPorEntrega: valor, valor,
        referencia: p.entregueEm || new Date(), descricao: `Comissão automática — entrega ${p.codigo}`, autorNome: "Automático",
      },
    });
  } catch (err) {
    if (err.code === "P2002") return null; // já gerada para esta entrega
    throw err;
  }
}

// Entrega "desfeita" (saiu de ENTREGUE): tira a comissão, se ainda não entrou em acerto.
function removerComissaoAutomatica(pedidoId) {
  return prisma.comissaoManual.deleteMany({ where: { pedidoId, origem: "AUTOMATICA", acertoId: null } });
}

// Chamado a cada mudança de status do pedido; nunca derruba a mudança de status.
async function aoMudarStatus(pedidoId, de, para) {
  try {
    if (para === "ENTREGUE") await gerarComissaoAutomatica(pedidoId);
    else if (de === "ENTREGUE") await removerComissaoAutomatica(pedidoId);
  } catch (err) {
    console.error("[comissao-automatica]", pedidoId, err.message);
  }
}

module.exports = { gerarComissaoAutomatica, removerComissaoAutomatica, aoMudarStatus };
