// Reduz uma imagem escolhida pelo usuário e devolve um data URL JPEG.
// maxLado: maior lado em pixels (256 para logos, ~1080 para banners de promoção).
export function reduzirImagem(arquivo, maxLado = 256, qualidade = 0.85) {
  return new Promise((resolve, reject) => {
    if (!arquivo.type.startsWith("image/")) return reject(new Error("Escolha um arquivo de imagem (JPG, PNG ou WEBP)."));
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", qualidade));
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}
