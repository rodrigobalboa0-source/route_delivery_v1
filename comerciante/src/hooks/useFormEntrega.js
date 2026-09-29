// Estado e regras do formulário de entrega (Painel de Controle e Solicitar Entrega):
//  - telefone completo -> busca o cliente salvo e preenche nome, endereço e complemento;
//  - endereço escolhido na busca (OpenStreetMap) -> guarda a posição e já calcula o valor;
//  - "Retorno?" -> recalcula com o acréscimo (Configurações › % do retorno, padrão 20%).
import { useRef, useState } from "react";
import { api } from "../api";
import { useAcao } from "../components/ui";
import { clientePorTelefone, mascaraTelefone, soDigitos, telefoneCompleto } from "../utils/cliente";
import { moeda } from "../utils/format";

export function useFormEntrega({ vazio, onPrevia = () => {} }) {
  const [v, setV] = useState(vazio);
  const [destino, setDestino] = useState(null);       // { lat, lng } escolhido na busca / do cliente salvo
  const [aprox, setAprox] = useState(null);           // posição só da rua (número não achado no mapa)
  const [retorno, setRetornoEstado] = useState(false);
  const [veiculo, setVeiculoEstado] = useState("MOTO");
  const [calculo, setCalculo] = useState(null);
  const [cliente, setCliente] = useState(null);       // { salvo: true, c } | { novo: true } | null
  const { executar, ocupado } = useAcao();
  const foneBuscado = useRef("");
  const atual = useRef({});
  atual.current = { v, destino, aprox, retorno, veiculo };

  async function calcular(opc = {}) {
    const a = atual.current;
    const endereco = opc.endereco ?? a.v.endereco;
    if (!String(endereco).trim()) return null;
    const r = await executar(() => api.post("/pedidos/calcular", {
      endereco,
      destino: opc.destino !== undefined ? opc.destino : a.destino,
      destinoAprox: opc.aprox !== undefined ? opc.aprox : a.aprox,
      retorno: opc.retorno ?? a.retorno,
      veiculo: opc.veiculo ?? a.veiculo,
    }));
    if (r) {
      setCalculo(r);
      if (r.destino) onPrevia({ lat: r.destino.lat, lng: r.destino.lng, rotulo: `${opc.nome ?? a.v.clienteNome ?? ""} ${moeda(r.valor)}`.trim() });
    }
    return r;
  }

  function aplicarCliente(c) {
    const pos = c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null;
    foneBuscado.current = soDigitos(c.telefone);
    setV(a => ({ ...a, clienteNome: c.nome, clienteTelefone: mascaraTelefone(c.telefone), endereco: c.endereco, complemento: c.complemento || "" }));
    setDestino(pos);
    setAprox(null);
    setCliente({ salvo: true, c });
    calcular({ endereco: c.endereco, destino: pos, aprox: null, nome: c.nome });
  }

  async function mudarTelefone(texto) {
    const valor = mascaraTelefone(texto);
    setV(a => ({ ...a, clienteTelefone: valor }));
    const d = soDigitos(valor);
    if (!telefoneCompleto(valor)) { setCliente(null); foneBuscado.current = ""; return; }
    if (d === foneBuscado.current) return;
    foneBuscado.current = d;
    const c = await clientePorTelefone(d);
    if (foneBuscado.current !== d) return; // digitou outro número enquanto buscava
    if (c) aplicarCliente(c);
    else setCliente({ novo: true });
  }

  function mudar(campo, valor) {
    if (campo === "clienteTelefone") return mudarTelefone(valor);
    setV(a => ({ ...a, [campo]: valor }));
    if (campo === "endereco") { setDestino(null); setAprox(null); setCalculo(null); onPrevia(null); }
  }

  function escolherEndereco(e) {
    const pos = e.exato ? { lat: e.lat, lng: e.lng } : null; // só a rua: o cálculo localiza o número
    const ap = e.exato ? null : { lat: e.lat, lng: e.lng };  // …e usa a posição da rua se não achar
    setV(a => ({ ...a, endereco: e.endereco }));
    setDestino(pos);
    setAprox(ap);
    if (pos) onPrevia({ lat: pos.lat, lng: pos.lng, rotulo: atual.current.v.clienteNome || "Destino" });
    calcular({ endereco: e.endereco, destino: pos, aprox: ap });
  }

  function setRetorno(x) {
    setRetornoEstado(x);
    if (calculo) calcular({ retorno: x });
  }
  function setVeiculo(x) {
    setVeiculoEstado(x);
    if (calculo) calcular({ veiculo: x });
  }

  function limpar(novoVazio = vazio) {
    setV(novoVazio); setDestino(null); setAprox(null); setRetornoEstado(false); setCalculo(null); setCliente(null);
    foneBuscado.current = "";
    onPrevia(null);
  }

  // Corpo para POST /pedidos
  const corpo = extra => ({ ...v, destino, destinoAprox: aprox, retorno, veiculo, ...extra });

  return { v, setV, mudar, escolherEndereco, aplicarCliente, calcular, calculo, cliente, retorno, setRetorno, veiculo, setVeiculo, destino, limpar, corpo, executar, ocupado };
}

// "✓ 3,2 km · R$ 14,40 (taxa R$ 12,00 + retorno 20% R$ 2,40)"
export function textoValor(calculo) {
  if (!calculo) return null;
  const base = `${Number(calculo.distanciaKm).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
  const extra = calculo.acrescimoRetorno > 0
    ? ` (taxa ${moeda(calculo.valorBase)} + retorno ${calculo.retornoPercentual}% ${moeda(calculo.acrescimoRetorno)})`
    : "";
  return { base, valor: moeda(calculo.valor), extra };
}
