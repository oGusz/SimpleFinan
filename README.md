# SimpleFinan

Aplicação de finanças pessoais para organizar contas, acompanhar metas e visualizar uma carteira de investimentos em um só lugar. O site é feito em Next.js, e o app das lojas é o projeto Expo em `mobile/`, que abre o site publicado em uma WebView e acrescenta os recursos nativos.

> As pastas `android/` e `ios/` e os scripts `cap:*` são do Capacitor e continuam no repositório por decisão do dono, mas **não são o caminho de publicação**. O envio às lojas sai de `mobile/`.

## Funcionalidades

- **Painel financeiro:** consulta de contas por mês, resumo de valores pagos e pendentes, histórico de despesas e próximos vencimentos.
- **Contas:** cadastro de contas, indicação de recorrência e atualização do status de pagamento.
- **Metas financeiras:** criação de objetivos, acompanhamento do valor acumulado e registro de novos aportes.
- **Carteira de investimentos:** inclusão e edição de ativos, visualização da alocação, simulador de projeções e calculadora de rebalanceamento com as metas informadas pelo usuário.
- **Cotações:** consulta de preços por rotas de API, com a data da última atualização.
- **Open Finance (Premium):** conexão com instituições pelo Pluggy para importar saldos, extrato, faturas de cartão e investimentos.
- **Autenticação e dados:** Supabase Auth e acesso às tabelas do Supabase por meio de Server Actions.
- **App nativo:** compra pela loja (RevenueCat), bloqueio por biometria, notificações de lembrete, entrada social em sessão segura e botão voltar do Android.

> O banco é a fonte dos dados, inclusive da carteira. O aparelho guarda só uma cópia para abrir mais rápido, apagada ao sair da conta.

## Tecnologias

- Next.js 16 com App Router e React 19
- TypeScript 5.7
- Tailwind CSS 4
- Supabase (`@supabase/ssr` e `@supabase/supabase-js`)
- Expo (SDK 58) e EAS para o app das lojas
- Pluggy para conexão Open Finance
- RevenueCat para assinaturas
- SWR e Recharts para atualização e visualização de dados

## Requisitos

- Node.js compatível com a versão atual do Next.js
- npm
- Projeto Supabase configurado
- Credenciais Pluggy para usar o fluxo Open Finance
- Contas de desenvolvedor da Apple e do Google, além de conta Expo, para publicar o app

## Configuração local

1. Instale as dependências:

   ```bash
   npm ci
   ```

2. Copie `.env.example` para `.env.local` e preencha. O arquivo de exemplo traz todas as variáveis, com a função de cada uma. Para só rodar a aplicação localmente, bastam as do grupo "Obrigatórias" e as de "Open Finance", se for usar esse fluxo.

   > Não versione `.env.local`. Mantenha os valores fora do Git e garanta que o projeto tenha acesso ao ambiente correto antes de compilar ou testar.

3. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

   A aplicação ficará disponível em `http://localhost:3000`.

## Banco de dados

### Ordem das migrações

Execute no SQL Editor do Supabase, nesta ordem, os arquivos de `lib/supabase/`:

1. `schema.sql`
2. `migration_openfinance.sql`
3. `migration_premium.sql`
4. `migration_growth.sql`
5. `migration_fix_bills_rls.sql`
6. `migration_harden.sql`
7. `migration_card_bills.sql`
8. `migration_commercial.sql`

Sem `migration_card_bills.sql`, as faturas de cartão somem sem nenhum aviso, porque o código tolera a falta da tabela. `migration_commercial.sql` depende dela e de `public.handle_updated_at`, criada em `schema.sql`.

**Antes de executar `migration_commercial.sql`, leia a seção 5 dela.** Essa seção apaga `dividend_yield` em todas as linhas e `avg_price` nas linhas Open Finance sem `item_id`, e não pode ser desfeita depois do `COMMIT`. Para adiar, comente os dois `UPDATE`.

### Conferir as políticas de acesso

Execute `lib/supabase/audit_rls.sql`, que só lê, e aja sobre o resultado. O SQL Editor mostra apenas o último resultado, então selecione e execute uma consulta por vez. Procure qualquer política que não use `auth.uid() = user_id`: uma política permissiva basta para abrir a tabela. Faça isso antes de publicar e sempre que criar uma política pelo painel.

### Criar o baseline

Os arquivos acima **não reconstroem o banco do zero**: nenhum deles tem `CREATE TABLE` de `bills`, `goals` e `investments`, e `schema.sql` falha em um banco vazio. Para que o banco possa ser recriado a partir do repositório, exporte o esquema real com o CLI do Supabase (exige Docker e não altera produção):

```bash
npx supabase login
npx supabase link --project-ref <ref-do-projeto>
npx supabase db pull
```

O comando grava o baseline em `supabase/migrations/`. Confira se ele sobe em um banco limpo com `npx supabase db reset` e, daí em diante, adote migrações numeradas nessa pasta. Antes do lançamento, confira também se os backups automáticos (PITR) estão ativos.

## Modelos de e-mail do Supabase

Passo manual, em Authentication → Email Templates. Sem ele, o link do e-mail depende do cookie do navegador em que o pedido foi feito e falha para quem usa o app, porque o e-mail abre em outro navegador. A página `/auth/confirm` valida o link em qualquer navegador, depois de um toque em Continuar.

| Modelo | Link |
| --- | --- |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha` |
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` |

Em Authentication → URL Configuration, defina o domínio como Site URL e adicione `https://seu-dominio/**` e `simplefinan://**` em Redirect URLs. Remova os endereços `exp://` usados nos testes.

## Planos Free e Premium

- **Gratuito:** dados inseridos manualmente.
- **Premium:** conexão com bancos via Open Finance (Pluggy).

O direito ao Premium vem da tabela `subscriptions`, que o usuário só consegue ler. As Server Actions da Pluggy validam o plano no servidor, e o webhook da RevenueCat mantém a tabela atualizada.

Para configurar:

1. Para liberar o Premium manualmente (uso pessoal ou conta de revisão com banco conectado), use o comando comentado no fim de `migration_premium.sql`. Quem tem Premium manual não vê o botão de compra, então essa conta não serve para testar a compra.
2. Registre o webhook da Pluggy, que precisa de um domínio público com HTTPS:

   ```bash
   node --env-file=.env.local scripts/register-pluggy-webhook.mjs https://seu-dominio.com
   ```

### Compras de teste

O webhook da RevenueCat descarta eventos `SANDBOX`, para que compra de teste não libere Premium em produção. Há duas exceções:

- `REVENUECAT_SANDBOX_USER_IDS`: lista de UUIDs do Supabase, separados por vírgula, cujas compras de teste valem. Use com a conta gratuita entregue à revisão.
- `REVENUECAT_ALLOW_SANDBOX=true`: vale para qualquer conta. Use no TestFlight, no teste interno do Google ou durante a revisão, se o revisor puder criar outra conta.

Sem uma delas, o revisor compra, vê "Confirmando sua assinatura..." e continua no plano gratuito. Isso parece compra quebrada e leva à rejeição.

## Publicar e medir

O código é o mesmo no teste e no lançamento: os serviços ligam pelas variáveis de ambiente e ficam desligados sem elas.

1. Aplique as migrações e os passos manuais descritos em "Banco de dados" e "Modelos de e-mail do Supabase".
2. Na Vercel, cadastre as variáveis de `.env.example`, em especial:

   | Variável | Para quê |
   | --- | --- |
   | `NEXT_PUBLIC_APP_URL` | Endereço público do app, usado nos e-mails |
   | `CRON_SECRET` | Protege a rotina diária de lembretes |
   | `PLUGGY_ENVIRONMENT` | `production`. Só o valor exato `sandbox` mostra os bancos de teste, inclusive em desenvolvimento, e para todos os usuários |
   | `RESEND_API_KEY`, `EMAIL_FROM` | Envio de e-mails, com domínio verificado no Resend |
   | `PUSH_REMINDERS_ENABLED` | `true` liga os lembretes no celular, depois de `migration_commercial.sql`. A rotina diária envia os lembretes mesmo sem e-mail configurado |
   | `REVENUECAT_WEBHOOK_AUTH` | Protege o webhook de assinaturas |
   | `REVENUECAT_SANDBOX_USER_IDS`, `REVENUECAT_ALLOW_SANDBOX` | Compras de teste (veja "Compras de teste") |
   | `REVENUECAT_SECRET_KEY` | Opcional: apaga o cliente na RevenueCat ao excluir a conta |
   | `RATE_LIMIT_SECRET` | Opcional: protege os hashes de IP e e-mail do limite de tentativas |
   | `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | Métricas de uso, desligadas até a pessoa permitir |
   | `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` | Opcionais: apagam a pessoa no PostHog ao excluir a conta |
   | `NEXT_PUBLIC_SENTRY_DSN` | Registro de erros |
   | `SENTRY_AUTH_TOKEN` | Opcional: stack traces legíveis no Sentry |
   | `NEXT_PUBLIC_LEGAL_*` | Empresa, documento, e-mails, cidade e data de vigência das páginas legais |
   | `NEXT_PUBLIC_APP_STORE_URL`, `NEXT_PUBLIC_PLAY_STORE_URL` | Links das lojas em `/sobre` e `/planos`, depois de publicadas |

Testes automatizados: `npm test`.

## Publicar nas lojas

O app das lojas é o projeto Expo em `mobile/`, que abre o site publicado. O passo a passo completo, com fichas, respostas de privacidade, contas de revisão e testes em aparelho, está em [`docs/lojas.md`](docs/lojas.md). Em resumo:

1. Em `mobile/`, rode `npx eas-cli@latest init` e `npx expo-doctor`.
2. No ambiente production do EAS, defina `EXPO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` e `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.
3. Rode `node --env-file=.env.production.local scripts/check-release.mjs`. Ele falha de propósito enquanto faltarem dados legais ou houver marcas de rascunho.
4. Compile e envie com `npx eas-cli@latest build --profile production` e `npx eas-cli@latest submit`.

O teste grátis do site não aparece no app nativo: nas lojas, ofereça o período grátis como oferta introdutória do produto.

## Testar no iPhone com Expo Go

A pasta `mobile/` é um app Expo (SDK 58) que abre o SimpleFinan em uma WebView. O SDK do projeto precisa ser igual ao do Expo Go instalado no iPhone; se o app avisar que são incompatíveis, ajuste a pasta `mobile/` para a versão indicada. O Expo Go serve para ver as telas: notificações e compra só funcionam em um build do EAS.

1. No iPhone, instale o Expo Go e entre com uma conta Expo. O computador e o iPhone precisam estar na mesma rede Wi-Fi.
2. Na raiz do projeto, rode `npm run dev:mobile` para desenvolver ou `npm run mobile:prod` para avaliar a velocidade real do app. O modo de desenvolvimento compila cada página na primeira visita e é bem mais lento.
3. Em outro terminal:

   ```bash
   cd mobile
   npx expo login
   npx expo start
   ```

4. Leia o QR Code com a câmera do iPhone e permita o acesso à rede local.

## Scripts disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor local do Next.js. |
| `npm run dev:mobile` | Inicia o servidor local aberto à rede, para testar no celular. |
| `npm run mobile:prod` | Gera a build e serve em modo de produção, aberto à rede. |
| `npm run build` | Gera a build de produção do Next.js. |
| `npm run start` | Inicia a aplicação Next.js em modo de produção após a build. |
| `npm test` | Roda os testes automatizados. |
| `npm run cap:build`, `cap:android`, `cap:ios` | Fluxo do Capacitor, fora do caminho de publicação. |
| `node scripts/generate-icons.mjs` | Gera os ícones e a imagem de prévia de link a partir da marca. |
| `node --env-file=.env.production.local scripts/check-release.mjs` | Confere as variáveis e os avisos antes de publicar. Lê só o ambiente e `mobile/eas.json`, nunca `.env.local`. |

## Estrutura do projeto

```text
app/
  actions/       Server Actions de autenticação, contas, finanças,
                 investimentos, Pluggy e cotações
  api/           Rotas de API: cotações, índices, proventos, rotina diária
                 e webhooks da Pluggy e da RevenueCat
  auth/          Retorno do login social e confirmação de links de e-mail
  carteira/      Página da carteira de investimentos
  login/         Página de autenticação
  page.tsx       Painel financeiro principal
components/      Componentes de interface, gráficos, contas e metas
context/         Estado compartilhado do plano e da carteira
docs/            Guia de publicação nas lojas
lib/             Integrações, regras financeiras e formatação
lib/supabase/    Clientes do Supabase, migrações e auditoria de RLS
mobile/          App Expo publicado nas lojas
scripts/         Webhook da Pluggy, ícones e conferência de publicação
tests/           Testes automatizados
utils/           Funções auxiliares
android/, ios/, capacitor.config.ts
                 Projetos Capacitor, fora do caminho de publicação
```

## Observações

- Não compartilhe nem versione credenciais; mantenha os valores de ambiente fora do Git.
- A disponibilidade e a atualização das cotações dependem das APIs externas utilizadas pelo projeto.
