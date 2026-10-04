// Botões "Baixar Excel" e "Baixar PDF" (com a logo do sistema). `gerar` devolve a especificação de utils/exportar.
import { useState } from "react";
import { Botao, useToast } from "./ui";

export default function Baixar({ rotulo, gerar, desabilitado }) {
  const [gerando, setGerando] = useState(null);
  const avisar = useToast();
  async function baixar(formato) {
    setGerando(formato);
    try {
      const { exportarExcel, exportarPdf } = await import("../utils/exportar");
      await (formato === "excel" ? exportarExcel : exportarPdf)(await gerar());
    } catch (e) {
      avisar(`Não foi possível gerar o arquivo: ${e.message}`, "erro");
    } finally {
      setGerando(null);
    }
  }
  return (
    <div className="baixar-grupo" role="group" aria-label={`Baixar ${rotulo}`}>
      <span>{rotulo}</span>
      <Botao pequeno disabled={desabilitado || !!gerando} onClick={() => baixar("excel")}>{gerando === "excel" ? "Gerando…" : "Baixar Excel"}</Botao>
      <Botao pequeno disabled={desabilitado || !!gerando} onClick={() => baixar("pdf")}>{gerando === "pdf" ? "Gerando…" : "Baixar PDF"}</Botao>
    </div>
  );
}
