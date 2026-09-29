// Devoluções: entregas com retorno — o entregador volta à loja depois de entregar
// (maquininha, troco, mercadoria devolvida pelo cliente). Marque "Retorno?" ao criar a entrega.
import Pedidos from "./Pedidos";

export default function Devolucoes() {
  return (
    <Pedidos
      titulo="Devoluções"
      subtitulo="Entregas com retorno à loja (maquininha, troco ou mercadoria devolvida). Marque “Retorno?” ao criar a entrega."
      fixo={{ retorno: "1" }}
      diasPadrao={30}
    />
  );
}
