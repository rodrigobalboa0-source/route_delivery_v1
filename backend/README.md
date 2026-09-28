# Route Delivery — Backend

API do painel Route Delivery. Node.js + Express + Prisma + PostgreSQL, com autenticação JWT.

## Stack

- **Node.js 18+** (usa `fetch` nativo para chamar os serviços de geocodificação/rota)
- **Express** — servidor HTTP / rotas REST
- **Prisma** — ORM e migrations
- **PostgreSQL** — banco de dados
- **JWT** (`jsonwebtoken`) — autenticação
- **bcryptjs** — hash de senhas

## Como rodar localmente

### 1. Pré-requisitos
- Node.js 18 ou superior
- Um banco PostgreSQL rodando (local, Docker, ou um serviço como Neon/Supabase/Railway)

### 2. Instalar dependências
```bash
cd backend
npm install
```

### 3. Configurar variáveis de ambiente
```bash
cp .env.example .env
```
Edite o `.env` e preencha:
- `DATABASE_URL` — string de conexão do seu PostgreSQL
- `JWT_SECRET` — qualquer string longa e aleatória
- `CORS_ORIGIN` — endereço onde o frontend vai rodar (ex: `http://localhost:5173`)
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_SENHA` — login do usuário administrador criado pelo seed

### 4. Criar as tabelas no banco
```bash
npm run prisma:migrate
```
Isso cria as tabelas a partir de `prisma/schema.prisma` e gera o Prisma Client.

### 5. Popular com dados de exemplo (opcional, mas recomendado no primeiro run)
```bash
npm run seed
```
Isso cria: 1 conta administradora, comércios com endereço/coordenadas, entregadores, 14 dias de histórico de pedidos, faturas, conversas e notificações. Só cria os dados de demonstração se ainda não houver comércios (pode rodar de novo sem duplicar).

Logins de demonstração:
- Painel ADM: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_SENHA`
- Sistema do comerciante: `loja@saborreal.com.br` / `demo1234`
- App do entregador: `diego@entregador.com` / `demo1234`

### 6. Rodar a API
```bash
npm run dev     # com reload automático (nodemon)
# ou
npm start       # produção
```
A API sobe em `http://localhost:4000` (ou a porta definida em `PORT`).

Teste rápido:
```bash
curl http://localhost:4000/health
# {"status":"ok"}
```

## Autenticação

Quase todas as rotas exigem um token JWT no header:
```
Authorization: Bearer SEU_TOKEN
```

Para conseguir um token:
```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@routedelivery.com","senha":"trocar123"}'
```

### Recuperação de senha

```
POST /api/auth/esqueci-senha   { "email": "..." }
POST /api/auth/redefinir-senha { "token": "...", "novaSenha": "..." }
```

O primeiro gera um token válido por 1 hora e, **em produção**, deve enviá-lo por
e-mail (nunca na resposta da API). Como este projeto não vem com um provedor de
e-mail configurado, fora de `NODE_ENV=production` o token é devolvido direto na
resposta (`devToken`/`devLink`) só para dar pra testar o fluxo — o frontend já
mostra isso na tela de "Esqueci minha senha" com um aviso.

**Antes de ir pra produção**, integre um serviço de e-mail real em
`src/routes/auth.routes.js` (procure o comentário `TODO produção`) — por exemplo
com `nodemailer` + SMTP, ou uma API como Resend/SendGrid/Postmark — e remova o
bloco que devolve `devToken`/`devLink` (ele já só aparece quando `NODE_ENV !== "production"`,
mas vale reforçar isso explicitamente antes do deploy).

## Três sistemas, uma API

A mesma API atende três clientes, cada um com seu login. O token JWT carrega o
`tipo` da sessão e cada grupo de rotas só aceita o seu:

| Cliente | Login | Rotas | Tipo no token |
|---|---|---|---|
| Painel ADM (`../admin`) | `POST /api/auth/login` (ContaGerencial) | `/api/*` | `ADMIN` |
| Sistema do comerciante | `POST /api/app/comerciante/login` (ComercioUsuario) | `/api/app/comerciante/*` | `COMERCIANTE` |
| App do entregador | `POST /api/app/entregador/login` (Entregador com senha) | `/api/app/entregador/*` | `ENTREGADOR` |

As rotas dos apps recarregam o comércio/entregador do banco a cada requisição,
então um **bloqueio feito no painel vale na hora**, mesmo com token ainda válido.

No painel, a escrita respeita a `PermissaoConta` da conta (leitura é livre):

| Permissão | Pode alterar |
|---|---|
| `TOTAL` | tudo, inclusive contas do painel e configurações |
| `OPERACIONAL` | pedidos, nova entrega, entregadores, comércios, mensagens, notificações |
| `FINANCEIRO` | financeiro e regras de preço do cadastro, notificações |
| `LEITURA` | nada |

## Principais rotas — painel ADM

| Recurso | Rotas |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/esqueci-senha`, `POST /api/auth/redefinir-senha`, `GET /api/auth/me` |
| Pedidos | `GET /api/pedidos?status&comercioId&entregadorId&busca&desde&ate`, `GET/PUT /api/pedidos/:id`, `PATCH /api/pedidos/:id/{pronto,aceitar,finalizar,atrasado,cancelar,reprocurar,trocar-entregador}`, `POST /api/pedidos/:id/{observacao,clonar}`, `GET /api/pedidos/contagem` |
| Status da entrega | Fluxo: `PREPARANDO` (Criado) → `PENDENTE` (Pedido pronto) → `ATRIBUIDO` (Atribuída — ao aceitar/atribuir) → `NA_LOJA` → `EM_ROTA` → `NO_CLIENTE` (Cheguei no cliente) → `ENTREGUE`; `CANCELADO` em qualquer etapa; `ATRASADO` é marcação. `PATCH /api/pedidos/:id/status { status }` (permissão Operacional/Total): etapas do motoboy exigem motoboy; voltar para Criado/Pronto libera o motoboy; faturado/acertado não sai de Entregue; concorrência → 409. Grupos em `src/utils/statusPedido.js`. Carimbos: `prontoEm`, `aceitoEm`, `naLojaEm`, `saiuEm`, `noClienteEm`, `entregueEm`, `canceladoEm`. |
| Mapa da Operação | `GET /api/pedidos/mapa?comercioId&cidade&origem` — pedidos em aberto (preparo, aguardando, em rota, atrasado) com `clienteNome`, `destino` {lat,lng}, `loja` {nome,lat,lng} e o `entregador` que aceitou (com posição). Pedidos sem posição são localizados em segundo plano (até 3 por chamada, 1/s); editar o endereço refaz a localização. |
| Nova entrega | `POST /api/nova-entrega/calcular` (km de **percurso real** + valor), `POST /api/nova-entrega` |
| Comércios | `GET/POST/PUT/DELETE /api/comercios`, `GET /api/comercios/contagem`, `PATCH /api/comercios/:id/{bloquear,desbloquear}`, endereços (`POST/PUT/DELETE`, geocodificados automaticamente), `PUT/DELETE /precificacao-modal/:veiculo`, usuários de acesso (`POST`, `PATCH /:usuarioId/senha`, `DELETE`) |
| Entregadores | `GET/POST/PUT/DELETE /api/entregadores`, `GET /api/entregadores/{contagem,online}`, `PATCH /api/entregadores/:id/{status,senha,bloquear,desbloquear}`, `PUT /api/entregadores/:id/comercios-permitidos`, `POST /api/entregadores/import` (CSV) |
| Mensagens | `GET/POST /api/mensagens`, `GET/POST /api/mensagens/:conversaId` |
| Financeiro | `GET /api/financeiro/{resumo,receita-mensal,repasses}`, faturas: `GET/POST /faturas`, `PUT/DELETE /faturas/:id`, `PATCH /faturas/:id/{pagar,reabrir}` |
| Financeiro › Acerto / Comissão | `GET /financeiro/ganhos?desde&ate&entregadorId`, `GET/POST /financeiro/acertos`, `GET/DELETE /financeiro/acertos/:id`, `PATCH /financeiro/acertos/:id/{pagar,reabrir}` |
| Comissão automática | No cadastro do entregador: `comissaoAutoAtiva` + `comissaoAutoValor` (R$ fixo). Ao finalizar cada entrega (app ou painel), gera uma comissão `origem: AUTOMATICA` (uma por pedido). É extra pago pela empresa: não altera o valor do pedido nem o repasse; entra no Acerto de Entregadores (`comissoesAutomaticas`). Filtro `?origem=AUTOMATICA` em `/financeiro/comissoes-manuais`. |
| Financeiro › Comissão lançada | `GET /financeiro/comissoes-manuais?desde&ate&beneficiarioTipo&comercioId`, `POST /financeiro/comissoes-manuais` `{ beneficiarioTipo: ENTREGADOR\|FUNCIONARIO, entregadorId\|contaGerencialId, comercioId, quantidadeEntregas, valorPorEntrega \| valor, referencia, vencimento, descricao }` (gera conta a pagar categoria COMISSAO), `DELETE /financeiro/comissoes-manuais/:id` (só não paga). Permissão Operacional pode lançar. |
| Financeiro › Contas | `GET/POST /financeiro/contas-pagar`, `PUT/DELETE /financeiro/contas-pagar/:id`, `PATCH .../{pagar,reabrir}` · `GET /financeiro/faturamento/previa`, `POST /financeiro/faturamento` · `GET/POST /financeiro/creditos`, `GET /financeiro/creditos/:comercioId` |
| Financeiro › Documentos | `GET/POST /financeiro/recibos`, `GET /financeiro/recibos/:id`, `POST /financeiro/{acertos,faturas,contas-pagar}/:id/recibo` (não duplica), `GET /financeiro/faturas/:id/nota`, `GET /financeiro/empresa` |
| Relatórios | `GET /api/relatorios/{dashboard,resumo-semana,volume-por-dia}` |
| Notificações | `GET/POST /api/notificacoes`, `PATCH /api/notificacoes/lidas`, `PATCH /api/notificacoes/:id/lida` |
| Configurações | `GET/PUT /api/configuracoes`, regras de saque: `GET/PUT /api/configuracoes/saque` (`{ NORMAL, RAPIDO }`: limite por solicitação, máx. por dia, dias da semana 0–6, datas `YYYY-MM-DD` com prioridade) |
| Comércio (formulário) | `PUT /api/comercios/:id/cadastro-completo` salva dados + endereços (os ausentes são removidos) + preço por modal + acesso `{ email, senha }` numa transação; `POST /api/comercios/geocodificar` `{ endereco }`. CPF/CNPJ validados pelos dígitos. |
| Contas do painel | `/api/cadastro/contas-gerenciais` (senha com hash; nunca devolve `senhaHash`) |
| Cadastro (CRUDs simples) | `/api/cadastro/{grupos-operacionais,modais,tabela-preco-km,tabela-comissoes,preco-dinamico-demanda,preco-dinamico-entregador,servicos-opcionais,promocoes,franquias,hubs}` |
| Cadastro (singletons) | `GET/PUT /api/cadastro/precificacao-padrao`, `GET/PUT /api/cadastro/preco-espera` |

## Rotas do app do entregador (`/api/app/entregador`)

| Rota | O que faz |
|---|---|
| `POST /login` | `{ email, senha }` → token (30 dias). Bloqueado/inativo não entra. |
| `POST /cadastro` | Auto-cadastro; entra como `EM_ANALISE` e gera notificação para o ADM aprovar. |
| `GET /me` | Dados do entregador. |
| `PATCH /status` | `{ online, lat?, lng? }` — só entregador `ATIVO` pode ficar online. |
| `POST /localizacao` | `{ lat, lng }` — enviar periodicamente; alimenta o mapa do painel. |
| `GET /pedidos/disponiveis` | Pedidos `PENDENTE` sem entregador, respeitando comércios permitidos e o raio máximo das configurações, ordenados por proximidade. |
| `GET /pedidos`, `GET /pedidos/:id` | Meus pedidos. |
| `PATCH /pedidos/:id/aceitar` | Aceite atômico — se dois aceitarem juntos, só um consegue (o outro recebe 409). |
| `PATCH /pedidos/:id/finalizar` | Conclui a entrega. |
| `PATCH /pedidos/:id/desistir` | Devolve o pedido para a fila (notifica o ADM). |
| `PATCH /pedidos/:id/etapa` | `{ status: NA_LOJA \| EM_ROTA \| NO_CLIENTE }` — o entregador informa a etapa (só para frente). Aceitar deixa o pedido em `ATRIBUIDO`; `finalizar` e `desistir` valem em qualquer etapa em andamento; `GET /pedidos?status=ATIVOS` lista os em andamento. |
| `GET /ganhos` | Entregas, valor, repasse estimado e `comissoes` (lançadas pelo ADM) de hoje / 7 dias / mês. |
| `GET /comissoes` | Comissões do entregador nos últimos 90 dias — lançadas pelo ADM (`origem` MANUAL) ou automáticas por entrega (`origem` AUTOMATICA, com `pedidoCodigo`) — com comércio, entregas, valor, `situacao` PAGA/A_RECEBER e totais do mês e a receber. |
| `GET /comissoes/avisos` | Pop-ups de comissões novas: `titulo` "Nova comissão!", `mensagem` com valor, entregas e comércio. |
| `POST /comissoes/avisos/:id/visto` | Marca o pop-up da comissão como mostrado. |
| `GET /saque/regras` | Regras vigentes de saque normal e rápido, para o app exibir. |
| `GET /promocoes` | Promoções valendo agora para este entregador (ativa, dentro do período e do veículo dele), com foto. |
| `GET /promocoes/avisos` | Pop-ups pendentes: `tipo` = `ATIVADA` ("Nova promoção!"), `DESATIVADA` ou `ENCERRADA` (fim do prazo), com `titulo`, `mensagem` e a promoção. Um por promoção (o estado mais recente). O app consulta ao abrir e periodicamente. |
| `POST /promocoes/avisos/:avisoId/visto` | Marca o pop-up como mostrado — não aparece de novo. |

## Rotas do sistema do comerciante (`/api/app/comerciante`)

| Rota | O que faz |
|---|---|
| `POST /login` | `{ email, senha }` → token. Comércio bloqueado não entra. |
| `GET /me`, `GET /resumo` | Dados da loja e indicadores do dia/mês. |
| `POST /pedidos/calcular` | `{ endereco }` → distância de percurso e valor. |
| `POST /pedidos` | Cria pedido (sempre para a própria loja) em `PREPARANDO`. |
| `GET /pedidos`, `GET /pedidos/:id` | Lista / detalhe com posição do entregador. |
| `PATCH /pedidos/:id/pronto` | Libera para os entregadores (`PREPARANDO → PENDENTE`). |
| `PATCH /pedidos/:id/cancelar` | Só antes de um entregador aceitar. |
| `GET /faturas` | Faturas da loja. |

## Integrações (iFood, 99 Food, Zé Delivery, Anota AI, Neemo, Delivery Direto, Meu Cardápio, InstaDelivery, Open Delivery, Serviço Logístico, Iza Seguradora, Idex)

Configuradas no painel em **Integrações** (escrita só com permissão Total). O catálogo fica em
`src/integracoes/catalogo.js`. Credenciais são guardadas com AES-256-GCM usando `INTEGRACOES_CHAVE`
e nunca voltam para o painel.

> A conexão **direta** com a API de cada plataforma exige cadastro como parceiro e homologação com
> ela — isso não está implementado. Os pedidos entram pelo webhook abaixo (ex.: via integrador).

**Entrada de pedidos** — `POST /api/integracoes/webhook/<token>` (público; o token da URL é a senha, gerado no painel):

```json
{
  "idExterno": "PEDIDO-123",
  "loja": "ID-DA-LOJA-NA-PLATAFORMA",
  "cliente": { "nome": "Maria Souza", "telefone": "(11) 98888-7777" },
  "endereco": { "rua": "Av. Paulista", "numero": "1000", "bairro": "Bela Vista", "cidade": "São Paulo", "referencia": "portaria" },
  "valorEntrega": 12.5,
  "formaPagamento": "Pago online",
  "observacao": "Entregar na portaria",
  "notaFiscal": { "numero": "12345", "chave": "", "valor": 89.9 },
  "pronto": false
}
```
Obrigatórios: `idExterno`, `loja` (vinculada a um comércio no painel), `cliente.nome`, `endereco` (texto ou objeto).
Respostas: `201` pedido criado · `200 { duplicado: true }` mesmo `idExterno` já recebido · `400` dados inválidos ·
`403` integração pausada · `404` token inválido · `422` loja não vinculada. O pedido é criado com origem `INTEGRACAO`.

**Saída de eventos** — a cada mudança de status (filtrável por status no painel), `POST` para a URL de saída:
```json
{ "evento": "pedido.status", "integracao": "ifood", "enviadoEm": "...", "dados": { "codigo": "PD-12345", "idExterno": "...", "status": "EM_ROTA", "statusAnterior": "PENDENTE", "entregador": { ... }, "horarios": { ... } } }
```
Plataformas de pedidos recebem só os pedidos que vieram delas; Serviço Logístico, Iza e Idex recebem todos.
Cabeçalhos: `X-Route-Evento` e `X-Route-Assinatura: sha256=<HMAC-SHA256 do corpo com o segredo da integração>`;
quando a integração tem credencial do tipo token/chave, também `Authorization: Bearer <credencial>`. Tempo limite: 5 s;
cada envio (sucesso ou falha) fica no registro de eventos da integração. Não há nova tentativa automática em caso de falha.

## Fluxo do pedido

```
PREPARANDO ──(comércio: pronto)──▶ PENDENTE ──(entregador: aceitar)──▶ EM_ROTA ──(finalizar)──▶ ENTREGUE
     │                                ▲                                   │
     └──────────(cancelar)──▶ CANCELADO└──────(desistir / reprocurar)─────┘
```
O painel ADM pode intervir em qualquer etapa (atribuir/trocar entregador, marcar
atrasado, finalizar, cancelar). A API recusa transições inválidas com 409.

## Cálculo de distância por percurso (não por raio)

O endpoint `POST /api/nova-entrega/calcular` faz:
1. Geocodifica o endereço de destino via **Nominatim** (OpenStreetMap).
2. Calcula a distância real de **rota** (não linha reta) entre o comércio e o destino via **OSRM** (`router.project-osrm.org`).
3. Calcula o valor usando a Precificação Padrão (ou a Tabela de Preço por KM vinculada, se houver).

Esses são serviços públicos gratuitos, sem necessidade de chave de API — ótimos para desenvolvimento/protótipo, mas com limite de uso. **Para produção com volume real**, troque por:
- Google Maps Directions API, Mapbox Directions API, ou
- Um servidor OSRM próprio (self-hosted), para não depender do servidor demo público.

Essa troca fica isolada em `src/utils/geo.js` — é só reescrever as duas funções (`geocodificarEndereco` e `calcularDistanciaRotaKm`) mantendo a mesma assinatura.

## Ferramentas úteis

```bash
npm run prisma:studio   # interface visual pra ver/editar os dados do banco
```

## Deploy em produção (passo a passo com Railway)

Railway hospeda o banco Postgres e a API no mesmo lugar, o que simplifica bastante.

1. Suba esta pasta (`/backend`) para um repositório no GitHub.
2. Em [railway.app](https://railway.app), crie um novo projeto e escolha
   "Deploy from GitHub repo", selecionando este repositório.
3. Adicione um banco: no mesmo projeto, clique em "New" → "Database" → "PostgreSQL".
   Railway cria a variável `DATABASE_URL` automaticamente.
4. No serviço da API, vá em "Variables" e adicione:
   - `JWT_SECRET` = uma string aleatória longa (ex: gere com `openssl rand -hex 32`)
   - `CORS_ORIGIN` = a URL do seu frontend publicado (ex: `https://route-delivery.vercel.app`)
   - `SEED_ADMIN_EMAIL` e `SEED_ADMIN_SENHA` = credenciais do admin inicial
   - (a `DATABASE_URL` já vem preenchida pelo passo anterior)
5. Em "Settings" → "Deploy", defina:
   - Build command: `npm install && npx prisma generate`
   - Start command: `npx prisma migrate deploy && npm run seed && npm start`
     (o `migrate deploy` roda as migrações direto, sem perguntar nada — ideal para produção;
     rode o `seed` só na primeira vez, depois remova-o do start command)
6. Deploy. Railway te dá uma URL pública (ex: `https://route-delivery-backend-production.up.railway.app`).
7. Use essa URL + `/api` como `VITE_API_BASE_URL` no frontend.

**Alternativas equivalentes:** Render.com (Web Service + PostgreSQL) e Fly.io funcionam
de forma parecida — suba o repositório, configure as mesmas variáveis de ambiente, e
rode `npx prisma migrate deploy` no primeiro deploy.

### Checklist antes de ir ao ar

- [ ] `JWT_SECRET` trocado por um valor aleatório forte (nunca o do `.env.example`)
- [ ] `SEED_ADMIN_SENHA` trocada por uma senha forte
- [ ] `CORS_ORIGIN` apontando exatamente para o domínio do frontend publicado (não `*`)
- [ ] Backup automático do banco habilitado (a maioria dos provedores oferece isso)
- [ ] HTTPS ativo tanto no frontend quanto no backend (Railway/Render/Vercel/Netlify já entregam isso por padrão)

## Próximos passos sugeridos (não implementados aqui)

- Upload real de arquivos (fotos, documentos) — hoje os campos `fotoUrl` etc. são apenas strings; adicione um serviço de storage (S3, Cloudinary, etc.) e um endpoint de upload.
- WebSocket (Socket.io) para atualizar o mapa e a lista de pedidos em tempo real sem precisar dar refresh/polling no frontend.
- Testes automatizados (Jest + Supertest).
- Rate limiting e logs estruturados para produção.
