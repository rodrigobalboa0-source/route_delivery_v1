# Como colocar o Sistema ADM no ar pelo Vercel

O projeto já está preparado para o **Vercel** e já está no seu GitHub
(`rodrigobalboa0-source/route_delivery_v1`, privado). No Vercel:

- o **painel ADM** fica na CDN do Vercel (abre rápido em qualquer lugar);
- a **API** roda como "função" do Vercel (arquivo `api/index.js`);
- o **banco de dados** é um PostgreSQL da **Neon**, conectado com um clique dentro do Vercel.

Custo: o plano **Hobby** do Vercel e o plano **Free** da Neon são gratuitos para começar
(o Hobby é para uso não comercial; para a operação da empresa o Vercel pede o plano **Pro**, ~US$ 20/mês —
confira os termos e preços atuais).

Tempo: ~15 minutos. São 4 partes.

---

## Parte 1 — Criar a conta e importar o projeto

1. Abra **https://vercel.com/signup** e clique em **Continue with GitHub** (mesma conta `rodrigobalboa0-source`).
2. Se pedir, escolha **Hobby** e digite seu nome.
3. Na tela inicial, clique em **Add New… › Project**.
4. Em *Import Git Repository*, ache **route_delivery_v1** e clique em **Import**.
   - Se não aparecer: clique em **Adjust GitHub App Permissions** (ou *Configure GitHub App*), marque o
     repositório `route_delivery_v1`, salve e volte.

## Parte 2 — Variáveis (senhas do sistema)

Ainda na tela de importação (*Configure Project*):

1. **Não mexa** em *Framework Preset*, *Root Directory* nem *Build and Output Settings*
   (o arquivo `vercel.json` do projeto já configura tudo).
2. Abra **Environment Variables** e adicione uma por uma (Key = nome, Value = valor, depois **Add**):

   | Key | Value |
   |---|---|
   | `JWT_SECRET` | o valor do arquivo `VARIAVEIS-VERCEL.txt` (na pasta do projeto) |
   | `INTEGRACOES_CHAVE` | o valor do arquivo `VARIAVEIS-VERCEL.txt` |
   | `ADMIN_EMAIL` | o e-mail que você vai usar para entrar no painel |
   | `ADMIN_SENHA` | uma senha com **8 caracteres ou mais** (anote!) |
   | `ADMIN_NOME` | seu nome |

   Dica: dá para copiar todo o conteúdo do `VARIAVEIS-VERCEL.txt` e colar de uma vez no primeiro campo
   *Key* — o Vercel separa as linhas sozinho. Depois é só trocar o e-mail/senha/nome.
3. Clique em **Deploy**.

O primeiro deploy termina com o site no ar, mas **ainda sem banco** — é normal (a próxima parte liga o banco).

## Parte 3 — Conectar o banco de dados

1. Ao terminar, clique em **Continue to Dashboard** (ou abra o projeto).
2. No menu do projeto, clique em **Storage**.
3. Clique em **Create Database** › escolha **Neon** (Serverless Postgres) › **Continue**.
4. Aceite os termos, escolha a região **Washington, D.C. (iad1)** ou **São Paulo** se aparecer, plano **Free**, e **Create**.
5. Na tela seguinte, deixe marcados **Production** e **Preview** e clique em **Connect**.

## Parte 4 — Publicar de novo (agora com o banco)

1. No menu do projeto, clique em **Deployments**.
2. No deploy mais recente, clique nos **três pontinhos (⋯)** › **Redeploy** › **Redeploy**.
3. Aguarde ~2 minutos (fica **Ready** com bolinha verde). Nesse deploy o sistema cria as tabelas do banco.
4. Clique em **Visit** (ou no endereço `https://route-delivery-v1-xxxx.vercel.app`).
5. Entre com o **ADMIN_EMAIL** e a **ADMIN_SENHA** da Parte 2. Pronto!

---

## Atualizações futuras

Sempre que eu alterar o sistema, as mudanças vão para o GitHub e o Vercel publica sozinho
(as mudanças no banco são aplicadas automaticamente em cada publicação).

## Se algo der errado

- **Deploy com erro (vermelho):** clique no deploy › **Building** (ou *Logs*), copie as últimas linhas e me envie.
- **Tela de login diz "erro" ao entrar:** o banco não foi conectado (Parte 3) ou faltou o **Redeploy** (Parte 4).
- **Senha não entra:** a senha precisa ter 8+ caracteres; o administrador só é criado se o banco ainda não tiver
  nenhuma conta. Me avise que eu ajudo a trocar.

## Limites do Vercel para este sistema (bom saber)

- Arquivos enviados pelo painel (foto de promoção, importação de CSV) têm limite de ~4 MB por envio.
- O Vercel "liga" a API a cada acesso: o primeiro acesso depois de um tempo parado pode levar 1–3 segundos.
