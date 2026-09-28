const jwt = require("jsonwebtoken");

// Três tipos de sessão compartilham a mesma API:
//   ADMIN        -> painel administrativo (ContaGerencial)
//   COMERCIANTE  -> sistema do comerciante (ComercioUsuario)
//   ENTREGADOR   -> app do entregador (Entregador)
const TIPOS = { ADMIN: "ADMIN", COMERCIANTE: "COMERCIANTE", ENTREGADOR: "ENTREGADOR" };

function assinarToken(payload, expiresIn = "12h") {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: "Token de autenticação ausente." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.conta = payload;
    next();
  } catch (err) {
    return res.status(401).json({ erro: "Token inválido ou expirado." });
  }
}

// Exige que a sessão seja de um dos tipos informados. Deve vir depois de requireAuth.
function requireTipo(...tipos) {
  return (req, res, next) => {
    if (!req.conta || !tipos.includes(req.conta.tipo)) {
      return res.status(403).json({ erro: "Acesso não permitido para este tipo de usuário." });
    }
    next();
  };
}

// Regras de escrita do painel conforme a PermissaoConta da conta gerencial.
// Leitura (GET) é liberada para qualquer conta ADMIN autenticada.
//   TOTAL        -> tudo
//   OPERACIONAL  -> pedidos, entregadores, comércios, mensagens, notificações, lançar comissão manual
//   FINANCEIRO   -> financeiro e precificação (cadastro), notificações
//   LEITURA      -> nada
const ESCRITA_POR_PERMISSAO = {
  OPERACIONAL: ["/pedidos", "/nova-entrega", "/entregadores", "/comercios", "/mensagens", "/notificacoes", "/promocoes-entregador", "/financeiro/comissoes-manuais"],
  FINANCEIRO: ["/financeiro", "/cadastro/tabela-preco-km", "/cadastro/tabela-comissoes", "/cadastro/precificacao-padrao",
    "/cadastro/preco-espera", "/cadastro/preco-dinamico-demanda", "/cadastro/preco-dinamico-entregador",
    "/cadastro/servicos-opcionais", "/cadastro/promocoes", "/notificacoes"],
  LEITURA: [],
};

function requirePermissaoEscrita(req, res, next) {
  if (req.method === "GET") return next();
  const permissao = req.conta?.permissao;
  if (permissao === "TOTAL") return next();

  const permitidos = ESCRITA_POR_PERMISSAO[permissao] || [];
  // req.path aqui é relativo ao ponto de montagem (/api).
  if (permitidos.some(prefixo => req.path === prefixo || req.path.startsWith(prefixo + "/"))) {
    return next();
  }
  return res.status(403).json({ erro: "Sua conta não tem permissão para alterar este recurso." });
}

module.exports = { TIPOS, assinarToken, requireAuth, requireTipo, requirePermissaoEscrita };
