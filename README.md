# SimpleFinan

Aplicação de finanças pessoais para organizar contas, acompanhar metas e visualizar uma carteira de investimentos em um só lugar. O projeto usa Next.js para a experiência web e Capacitor para manter projetos nativos para Android e iOS.

## Funcionalidades

- **Painel financeiro:** consulta de contas por mês, resumo de valores pagos e pendentes, histórico de despesas e próximos vencimentos.
- **Contas:** cadastro de contas, indicação de recorrência e atualização do status de pagamento.
- **Metas financeiras:** criação de objetivos, acompanhamento do valor acumulado e registro de novos aportes.
- **Carteira de investimentos:** inclusão e edição de ativos, visualização da alocação, simulador de projeções e ferramenta de rebalanceamento.
- **Cotações:** consulta de preços de ativos por rotas de API e atualização periódica dos preços exibidos na carteira.
- **Open Finance:** fluxo de conexão com instituições pelo Pluggy para carregar dados de investimentos.
- **Autenticação e dados:** Supabase Auth e acesso às tabelas do Supabase por meio de Server Actions.
- **Aplicativos móveis:** projetos Android e iOS configurados com Capacitor.

> As contas e metas usam o Supabase. A carteira exibida no navegador é mantida no `localStorage`; confirme a persistência de cada integração antes de tratar os dados como sincronizados entre dispositivos.

## Tecnologias

- Next.js 16 com App Router e React 19
- TypeScript 5.7
- Tailwind CSS 4
- Supabase (`@supabase/ssr` e `@supabase/supabase-js`)
- Capacitor 8 (Android e iOS)
- Pluggy para conexão Open Finance
- SWR e Recharts para atualização e visualização de dados

## Requisitos

- Node.js compatível com a versão atual do Next.js
- npm
- Projeto Supabase configurado
- Credenciais Pluggy para usar o fluxo Open Finance
- Android Studio ou Xcode para abrir e compilar os projetos nativos

## Configuração local

1. Instale as dependências:

   ```bash
   npm ci
   ```

2. Crie um arquivo `.env.local` na raiz e configure as variáveis necessárias. As variáveis abaixo são as mínimas para rodar a aplicação localmente:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
   PLUGGY_CLIENT_ID=seu-client-id
   PLUGGY_CLIENT_SECRET=seu-client-secret
   BRAPI_TOKEN=seu-token-brapi
   ```

   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`: conexão com o Supabase para autenticação e acesso público ao banco.
   - `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`: credenciais para o fluxo de Open Finance/Pluggy.
   - `BRAPI_TOKEN`: token usado pela rota de cotações da carteira.

   > Não versione esse arquivo. Mantenha os valores em `.env.local` e garanta que o projeto tenha acesso ao ambiente correto antes de compilar ou testar.

3. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

   A aplicação ficará disponível em `http://localhost:3000`.

## Scripts disponíveis

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia o servidor local do Next.js. |
| `npm run build` | Gera a build de produção do Next.js. |
| `npm run start` | Inicia a aplicação Next.js em modo de produção após a build. |
| `npm run cap:build` | Gera a build web e executa `cap copy`. |
| `npm run cap:android` | Executa a build para Capacitor e abre o projeto no Android Studio. |
| `npm run cap:ios` | Executa a build para Capacitor e abre o projeto no Xcode. |

## Estrutura do projeto

```text
app/
  actions/       Server Actions de autenticação, contas, finanças,
                 investimentos, Pluggy e cotações
  api/           Rotas de API para cotações
  carteira/      Página da carteira de investimentos
  login/         Página de autenticação
  page.tsx       Painel financeiro principal
components/      Componentes de interface, gráficos, contas e metas
context/         Estado compartilhado da carteira
hooks/           Hooks reutilizáveis
lib/             Integrações Supabase e utilitários financeiros
utils/           Funções auxiliares
android/         Projeto nativo Android
ios/             Projeto nativo iOS
capacitor.config.ts
```

## Observações

- Configure as tabelas, políticas de acesso e usuários no Supabase de acordo com o ambiente antes de usar dados reais.
- Não compartilhe nem versiona credenciais; mantenha os valores de ambiente fora do Git.
- A disponibilidade e a atualização das cotações dependem das APIs externas utilizadas pelo projeto.
