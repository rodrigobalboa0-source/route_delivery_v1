# Route Delivery — Sistema ADM

Painel administrativo que gerencia o **app do entregador** e o **sistema do comerciante**,
com a API que atende os três.

```
route_delivery_v1/
├── backend/   API Node + Express + Prisma + PostgreSQL (baseada em route-delivery-backend (2))
└── admin/     Painel ADM em React + Vite
```

## O que o painel faz

Menu lateral, nesta ordem:

| Menu | Funcionalidades |
|---|---|
| **Operação** | *Pedidos • Acompanhamento:* mapa com a foto de cada entregador online (verde = livre, azul = em corrida); cards de entregadores online, entregas em andamento e alocação; botão **Atribuir** (em lote: pedidos marcados ou todos os prontos sem entregador) e **Nova Entrega**; filtros por cidade, comércio, status, origem e período; contadores por status (clicáveis); tabela com seleção, coleta, entrega, taxa e ações rápidas. O detalhe do pedido tem linha do tempo e todas as ações. Atualiza sozinho. |
| **Relatórios** | Submenu, nesta ordem: **Relatórios de Entregas** (visão geral e rankings) · **Analítico de Embarcadores** (por comércio: volume, conversão, receita, tempos) · **Analítico de Entregadores** (entregas, aceites, desistências, tempo médio, repasse) · **Roteirização** (sequência de coletas/entregas do entregador no dia, no mapa) · **Analítico da Operação** (pedidos por hora e dia, mapa de calor, tempo de cada etapa) · **Entregas** (lista completa com horários) · **Notas Fiscais** (entregas com/sem NF) · **Recorrência de Entregas** (clientes que se repetem) · **Trajeto dos Entregadores** (rastro de GPS no mapa) · **Entregadores por período** (ativos por dia, novos cadastros) · **Diagnóstico de Entregadores** (pendências de cadastro, acesso e documentos) · **Alteração de Status por Entregador** (quem mudou o quê e quando) · **Histórico de Vagas** (quanto cada pedido esperou por um entregador). Todos com filtro de período, ordenação e exportação CSV. |
| **Cadastros** | Submenu, nesta ordem: **Comércio** (sistema do comerciante: cadastro, endereços com localização automática, preço por modal, logins de acesso, bloquear) · **Contas gerenciais** (usuários do painel e permissões) · **Entregadores** (app do entregador: aprovar cadastros, senha do app, bloquear, veículo, comércios permitidos, CSV) · Grupos operacionais · Modais · Precificação padrão · Tabela de preço por KM · Tabela de comissões · Preço por espera · Preço dinâmico (demanda) · Preço dinâmico entregador · Serviços opcionais · Promoção. |
| **Mensagens** | Conversas com clientes e entregadores. |
| **Financeiro** | Submenu: **Acerto de Entregadores** (ganhos por período com calendário de início e fim, fechamento do acerto, pagamento e recibo) · **Contas a Pagar** · **Contas a Receber** (faturas) · **Crédito** (saldo pré-pago dos comércios) · **Faturamento** (gera as faturas das entregas do período) · **Gerar Nota** (nota de débito com demonstrativo — não é NFS-e) · **Gerar Recibo** · **Comissão** (comissão lançada à mão para entregador ou funcionário do ADM — quem recebe, comércio, quantidade de entregas e valor —, que aparece no app do entregador com pop-up; e a comissão calculada pelas entregas). Em Cadastros › Entregadores dá para ligar a **comissão automática**: a cada entrega finalizada cai um valor fixo para o entregador, pago pela empresa (não sai do repasse dele nem da taxa do comércio), que é pago no acerto. Operadores com permissão Operacional podem lançar comissões; o pagamento fica com Financeiro/Total. Dados do emitente dos documentos em Configurações › Dados da empresa. |
| **Nova Entrega** | Cria uma entrega para um comerciante, com cálculo de distância pelo percurso real. |
| **Configurações** | Raio máximo para oferecer pedidos no app do entregador, canais de notificação. |
| **Integrações** | iFood, 99 Food, Zé Delivery, Anota AI, Neemo, Delivery Direto, Meu Cardápio, InstaDelivery, Open Delivery, Serviço Logístico, Iza Seguradora, Idex: ativar/pausar, credenciais criptografadas, lojas vinculadas, webhook de entrada de pedidos, webhook de saída de status (assinado) e registro de eventos. |
| **Promoção** | Campanhas para os entregadores: foto, título, prêmio, descrição, período e veículos. Ativar/desativar gera um aviso (pop-up) no app do entregador; prévia do pop-up e da lista no próprio painel; contador de quantos entregadores viram. |
| **Sair** | Encerra a sessão. |
| **Ajuda** | Guia de cada menu, caminho do pedido, permissões e perguntas frequentes. |

## Como rodar

Pré-requisitos: **Node.js 18+** e um **PostgreSQL**.

```bash
# 1. API
cd backend
cp .env.example .env          # preencha DATABASE_URL e JWT_SECRET
npm install
npm run prisma:migrate
npm run seed
npm run dev                   # http://localhost:4000

# 2. Painel (outro terminal)
cd admin
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:4000/api
npm install
npm run dev                   # http://localhost:5173
```

Logins de demonstração (criados pelo seed):

| Sistema | E-mail | Senha |
|---|---|---|
| Painel ADM | `SEED_ADMIN_EMAIL` do `.env` | `SEED_ADMIN_SENHA` do `.env` |
| Sistema do comerciante | `loja@saborreal.com.br` | `demo1234` |
| App do entregador | `diego@entregador.com` | `demo1234` |

## Conectar o app do entregador e o sistema do comerciante

Os apps devem apontar para as rotas `/api/app/entregador/*` e `/api/app/comerciante/*`,
documentadas em [backend/README.md](backend/README.md). O app Expo e o painel web que
estão em `route_delivery_projeto_inteiro` usam outra API (rotas em inglês, porta 3000)
e precisam ser adaptados para essas rotas.
