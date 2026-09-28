# Como colocar o Sistema ADM no ar

O projeto já está preparado para o **Render** (render.com). No final você terá um endereço como
`https://route-delivery-xxxx.onrender.com` onde o painel ADM abre de qualquer computador ou celular.

O que será criado no Render (pelo arquivo `render.yaml`, automaticamente):

| Item | O que é | Custo aproximado* |
|---|---|---|
| `route-delivery` | Servidor com a API + o painel ADM (mesmo endereço) | ~US$ 7/mês |
| `route-delivery-db` | Banco de dados PostgreSQL | ~US$ 7/mês |

\* Confira os preços atuais no site do Render. Os planos gratuitos não servem para uso real:
o servidor grátis "dorme" quando fica parado e o banco grátis é apagado depois de 30 dias.

Você vai precisar de: um e-mail, um cartão de crédito internacional e ~30 minutos.

---

## Parte 1 — Guardar o código no GitHub

O Render busca o código no GitHub. O arquivo `.env` (com senhas) **não vai** para o GitHub — isso já está configurado.

1. Crie uma conta em **https://github.com** (plano Free).
2. Instale o **GitHub Desktop**: https://desktop.github.com — abra e entre com a sua conta.
3. No GitHub Desktop: menu **File › Add local repository…** e escolha a pasta
   `C:\Users\Rodrigo Balboa\Downloads\route_delivery_v1`.
4. Ele vai dizer que a pasta ainda não é um repositório: clique no link azul **create a repository**.
   - **Não mude o Name** (deve continuar `route_delivery_v1`) nem o *Local path*. Se mudar o nome,
     o GitHub Desktop cria uma pasta nova e vazia e o sistema não vai junto.
   - Git ignore: **None** · License: **None** (o projeto já tem o dele).
   - Clique em **Create repository**.
5. Confira a lista de arquivos à esquerda: **não pode aparecer nenhum arquivo `.env`**
   (só `.env.example` e `.env.development` podem aparecer). Se aparecer um `.env`, pare e me avise.
6. Clique em **Publish repository** (em cima).
   - Deixe marcado **Keep this code private** (código privado).
   - Clique em **Publish repository**.

## Parte 2 — Publicar no Render

1. Crie uma conta em **https://render.com** usando **Sign in with GitHub**
   (assim o Render já enxerga o seu repositório).
2. No painel do Render: **New +** › **Blueprint**.
3. Escolha o repositório **route_delivery_v1** (se não aparecer, clique em *Configure account* e libere o acesso a ele).
4. O Render lê o `render.yaml` e mostra o que vai criar. Ele pede três valores — é o **primeiro login do painel**:
   - `ADMIN_EMAIL` — seu e-mail (ex.: `voce@suaempresa.com.br`)
   - `ADMIN_SENHA` — uma senha forte, **com pelo menos 8 caracteres**
   - `ADMIN_NOME` — seu nome (aparece no canto do painel)
5. Clique em **Apply** (ou *Deploy Blueprint*). Cadastre o cartão se pedir.
6. Aguarde de 5 a 10 minutos. Acompanhe em **route-delivery › Logs**. Está pronto quando aparecer:
   ```
   Primeiro administrador criado: voce@suaempresa.com.br
   Route Delivery API rodando em ...
   ```

## Parte 3 — Primeiro acesso

1. Em **route-delivery**, copie o endereço que aparece em cima (ex.: `https://route-delivery-xxxx.onrender.com`).
2. Abra no navegador e entre com o e-mail e a senha do passo anterior.
3. Primeiras configurações recomendadas:
   - **Configurações › Dados da empresa** (sai nos recibos e notas);
   - **Configurações** (raio, regras de saque);
   - **Cadastros**: precificação padrão, tabela de preço por KM, comércios, entregadores;
   - **Cadastros › Contas gerenciais**: crie o login de cada pessoa da equipe.

O banco online começa **vazio**: os comércios, pedidos e contas de teste deste computador não vão junto.

## Parte 4 — Quando o sistema for atualizado

Sempre que o código mudar (por exemplo, depois de eu fazer uma alteração):

1. Abra o **GitHub Desktop** — as mudanças aparecem na lista.
2. Escreva um resumo em *Summary* (ex.: "Novo relatório") e clique em **Commit to main**.
3. Clique em **Push origin**.
4. O Render percebe sozinho e publica a nova versão em alguns minutos. As mudanças no banco de dados
   são aplicadas automaticamente, sem perder dados.

## Parte 5 — Endereço próprio (opcional)

Para usar algo como `adm.suaempresa.com.br`:

1. Tenha um domínio (ex.: registro.br, ~R$ 40/ano).
2. No Render: **route-delivery › Settings › Custom Domains › Add** e digite `adm.suaempresa.com.br`.
3. O Render mostra um registro **CNAME**. Crie esse registro no painel de DNS do seu domínio.
4. Em alguns minutos/horas o endereço funciona, com cadeado (HTTPS) automático.

## Se algo der errado

- **A publicação falhou (Deploy failed):** abra **Logs**, copie as últimas linhas vermelhas e me envie.
- **Não consigo entrar:** confira se a senha tinha 8+ caracteres. O administrador só é criado quando o
  banco não tem nenhuma conta; se precisar trocar, me avise que eu te passo o comando.
- **Esqueci a senha:** a tela de login tem "Esqueci minha senha" (o envio por e-mail depende de configurar
  um provedor de e-mail — me avise quando quiser).

## O que já está pronto para depois

- O mesmo endereço já atende o **app do entregador** (`/api/app/entregador`) e o
  **sistema do comerciante** (`/api/app/comerciante`) quando eles forem construídos.
- O link do **webhook das integrações** (iFood etc.) já sai com o endereço público.
