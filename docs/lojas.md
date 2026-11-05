# Publicar nas lojas

Guia para enviar o SimpleFinan à App Store e ao Google Play. O app das lojas é o projeto Expo em `mobile/`. Os itens marcados como **dono** dependem de contas, decisões ou acessos que só o dono do projeto tem.

Os rótulos dos formulários da Apple e do Google mudam com o tempo. Use as respostas abaixo como base e confira o texto atual de cada pergunta antes de enviar.

## 1. Antes do primeiro build

Pendências de configuração que ainda não estão feitas:

- [ ] **Dono:** dados da empresa e revisão jurídica. Preencha `NEXT_PUBLIC_LEGAL_*`, revise `/termos` e `/privacidade` com um advogado, remova os comentários de rascunho e defina os prazos marcados como pendentes.
- [ ] **Dono:** decidir o login no iPhone (seção 2).
- [ ] Rodar `eas init` (seção 3), porque `mobile/app.json` ainda não tem `extra.eas.projectId` nem `owner`.
- [ ] Aplicar as migrações, os modelos de e-mail e `audit_rls.sql`, como descrito no `README.md`.
- [ ] Definir `PLUGGY_ENVIRONMENT=production` na Vercel.
- [ ] Definir `PUSH_REMINDERS_ENABLED=true` na Vercel, depois de `migration_commercial.sql`.

## 2. Login no iPhone (regra 4.8 da App Store)

A App Store exige uma opção equivalente quando há login social de terceiros: limitada a nome e e-mail, que permita ocultar o e-mail e sem rastreamento para publicidade. A tela de entrada já trata isso pela variável `NEXT_PUBLIC_APPLE_LOGIN_ENABLED`:

| Valor | No iPhone | No Android e no navegador |
| --- | --- | --- |
| `false` (padrão) | Só e-mail e senha, sem Google e Facebook | Google e Facebook |
| `true` | Apple primeiro, depois Google e Facebook | Apple por último, além de Google e Facebook |

**Opção A, mais barata:** manter `false` e lançar o iPhone só com e-mail e senha.

**Opção B:** ativar a Apple. Exige:

1. Configurar Sign in with Apple no Apple Developer e no Supabase, e `simplefinan://**` em Redirect URLs.
2. Implementar a revogação do token da Apple na exclusão de conta. **O código ainda não faz isso:** `app/actions/account.ts` não revoga o token, e o Supabase não o faz sozinho.
3. Configurar o relay de e-mail da Apple para o remetente do Resend, ou os lembretes não chegam a quem ocultar o e-mail.
4. Renovar o segredo JWT da Apple no Supabase, que expira em até 6 meses. Deixe um lembrete.
5. Testar em aparelho real uma conta com e-mail oculto, porque o nome pode não vir.

## 3. Configurar e compilar

Em `mobile/`:

```bash
npx expo-doctor
npx eas-cli@latest init
```

`eas init` cria o projeto no EAS e grava `extra.eas.projectId` e `owner` em `app.json`. As notificações dependem desse `projectId`. Corrija o que o `expo-doctor` apontar.

No ambiente production do EAS (painel ou `eas env:create`):

- `EXPO_PUBLIC_WEB_URL`, obrigatoriamente com `https://`
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`

O build de produção falha de propósito se faltar alguma delas.

Notificações no Android exigem credenciais do Firebase (FCM V1) no EAS e o arquivo `google-services.json` indicado em `android.googleServicesFile`, que `mobile/app.json` ainda não tem. Confira o passo a passo na documentação do Expo SDK 58. Sem isso, os lembretes no celular não chegam a aparelhos Android.

Antes de enviar, na raiz do projeto, com os valores de produção. Inclua `EXPO_PUBLIC_WEB_URL` nesse arquivo, porque o script não enxerga o ambiente do EAS:

```bash
node --env-file=.env.production.local scripts/check-release.mjs
```

O script falha de propósito enquanto faltar dado legal ou houver marca de rascunho. **Só siga com ele aprovado.**

Depois, em `mobile/`:

```bash
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --profile production --platform ios
npx eas-cli@latest submit --profile production --platform android
```

`submit.production` está vazio em `mobile/eas.json`, então o envio pergunta os dados na hora. Para automatizar, preencha `ascAppId` e a credencial do Google.

## 4. Ficha da loja

**Nome:** SimpleFinan

**Subtítulo (App Store, até 30 caracteres):**

> Contas, metas e investimentos

**Descrição curta (Google Play, até 80 caracteres):**

> Organize contas, vencimentos, metas e investimentos em um só lugar.

**Palavras-chave (App Store, até 100 caracteres):**

> finanças,contas,orçamento,metas,carteira,ações,vencimentos,lembretes,open finance,boletos

**Descrição (ambas as lojas):**

> O SimpleFinan reúne suas contas, metas e investimentos em um só lugar, sem planilha.
>
> CONTAS E VENCIMENTOS
> Cadastre contas únicas e recorrentes, veja o que vence e o que já foi pago em cada mês e receba lembretes por e-mail e no celular.
>
> METAS
> Defina objetivos e acompanhe quanto já guardou para cada um.
>
> CARTEIRA DE INVESTIMENTOS
> Registre seus ativos, acompanhe a alocação e consulte as cotações da bolsa, com a data da última atualização. Use a calculadora de aporte e o simulador de projeções com as metas e os dados que você informar.
>
> BANCOS CONECTADOS (PREMIUM)
> Conecte até 5 bancos via Open Finance para ver saldos, extrato, faturas de cartão e investimentos. A autorização é feita no ambiente da Pluggy e da sua instituição: o SimpleFinan não recebe a senha do seu banco e não movimenta seu dinheiro.
>
> PRIVACIDADE
> Proteja o acesso com biometria e exclua sua conta quando quiser, direto no app. As métricas de uso ficam desligadas até você permitir.
>
> ASSINATURA
> O plano Gratuito funciona com os dados que você insere. O Premium é uma assinatura com renovação automática, cobrada pela App Store ou pelo Google Play. O preço aparece antes da compra. Cancele quando quiser nos ajustes da sua conta da loja.
>
> AVISO
> O SimpleFinan é uma ferramenta de organização. Os cálculos são informativos, feitos com base nos dados informados, e não são recomendação de investimento. Rentabilidade passada e estimativas não garantem resultado futuro.
>
> Termos de Uso: https://SEU-DOMINIO/termos
> Política de Privacidade: https://SEU-DOMINIO/privacidade

Se `MAX_CONNECTED_BANKS` (`lib/plans.ts`) mudar, atualize o número de bancos acima.

**Categoria:** Finanças, nas duas lojas.

**Classificação etária:** o app não é destinado a menores de 18 anos, conforme a Política de Privacidade. Responda aos questionários com esse público.

**Endereços:**

| Campo | Endereço |
| --- | --- |
| Política de privacidade | `https://SEU-DOMINIO/privacidade` |
| Termos (EULA) | `https://SEU-DOMINIO/termos` |
| Suporte | `https://SEU-DOMINIO/suporte` |
| Marketing | `https://SEU-DOMINIO/sobre` |
| Exclusão de conta (Google) | `https://SEU-DOMINIO/excluir-conta` |

**Assinatura (dono):** crie os produtos no App Store Connect e no Play Console e cadastre-os na RevenueCat. Preço e oferta introdutória são definidos lá. O teste grátis do site não aparece no app: nas lojas, o período grátis é uma oferta introdutória do produto.

### Capturas de tela

- Use o app real, na conta de revisão com banco de teste. Não monte telas nem invente valores.
- Sequência sugerida: painel, contas a pagar, metas, carteira, bancos conectados, planos.
- App Store: capturas de iPhone no tamanho exigido pelo App Store Connect. `ios.supportsTablet` é `false`, então não há capturas de iPad.
- Google Play: pelo menos duas capturas de celular, ícone de 512 x 512 e imagem de destaque de 1024 x 500.
- Texto sobre as capturas não pode prometer o que o app não faz: nada de "tempo real", "ao vivo" ou ganho garantido.

## 5. App Privacy (Apple)

**Rastreamento entre apps ou sites: não.** Não há publicidade nem cruzamento com dados de terceiros para esse fim.

| Tipo de dado | Exemplos no app | Finalidade | Ligado à identidade |
| --- | --- | --- | --- |
| Informações de contato: e-mail, nome | Cadastro | Funcionalidade do app | Sim |
| Informações financeiras: outras | Contas, metas, carteira, saldos e limites | Funcionalidade do app | Sim |
| Compras: histórico | Extrato e faturas importados, assinatura | Funcionalidade do app | Sim |
| Conteúdo do usuário: fotos | Foto de perfil, opcional | Funcionalidade do app | Sim |
| Identificadores: ID do usuário | Código da conta | Funcionalidade do app, análises | Sim |
| Identificadores: ID do dispositivo | Token de notificação | Funcionalidade do app | Sim |
| Uso: interação com o produto | Telas e ações, com permissão | Análises | Sim |
| Diagnóstico: falhas, desempenho e outros | Sentry, sem dados do usuário | Funcionalidade do app | Não |

Dados de cartão e senhas de banco não são coletados: o pagamento é feito pela loja, e a autorização bancária, no ambiente da Pluggy.

**Confira antes de responder:** o PostHog pode derivar localização aproximada do IP. Desligue a geolocalização por IP no projeto do PostHog ou declare "localização aproximada".

## 6. Segurança de dados (Google Play)

| Pergunta | Resposta |
| --- | --- |
| Coleta ou compartilha dados? | Sim |
| Dados criptografados em trânsito? | Sim, HTTPS |
| A pessoa pode pedir a exclusão? | Sim, em Perfil → Excluir minha conta e em `/excluir-conta` |
| Rastreamento entre apps | Não |
| Venda de dados | Não |

| Categoria | Tipo | Finalidade | Opcional |
| --- | --- | --- | --- |
| Informações pessoais | E-mail, nome, IDs de usuário | Funcionalidade, gerenciamento da conta | E-mail obrigatório |
| Informações financeiras | Histórico de compras (extrato, faturas, assinatura) | Funcionalidade | Sim, depende do Premium |
| Informações financeiras | Outras (contas, metas, carteira, saldos, limites) | Funcionalidade | Depende do que a pessoa cadastra |
| Fotos | Foto de perfil | Funcionalidade | Sim |
| Atividade no app | Interações e telas | Análises | Sim, só com permissão |
| Informações e desempenho do app | Registros de falhas, diagnóstico | Diagnóstico | Não |
| IDs do dispositivo ou outros | Token de notificação | Funcionalidade (lembretes) | Sim |

No formulário do Google, fornecedores que tratam dados em nome do app (Supabase, Vercel, Sentry, PostHog, Resend, Expo, Pluggy, RevenueCat) contam como prestadores de serviço, não como compartilhamento. Confira se a definição atual do formulário mantém isso. A mesma lista está em `/privacidade`: as respostas e a política precisam dizer a mesma coisa.

## 7. Declaração financeira do Google

Em Play Console → Conteúdo do app → Recursos financeiros, declare o app como **organização de finanças pessoais e agregação de dados bancários via Open Finance**.

- O app **não** oferece empréstimo, crédito, corretagem, compra de ativos, pagamento nem transferência.
- Não movimenta dinheiro. Só lê dados de instituições com autorização da pessoa, pela Pluggy.
- Os cálculos são informativos e não são recomendação de investimento.

Marque somente as opções que correspondam a isso. Se o formulário pedir licença, responda que o app não presta serviço financeiro regulado e **dono:** confirme essa posição, inclusive o enquadramento da Pluggy, na revisão jurídica.

Se a conta do Google for pessoal, confira a exigência de teste fechado antes de produção, que pede prazo e testadores.

## 8. Contas de revisão

Crie **duas** contas e entregue as duas nas notas de revisão:

**Conta 1, gratuita, para testar a compra**

1. Crie a conta com e-mail e senha e confirme o e-mail.
2. Não dê Premium manual: `/planos` esconde a compra para quem já é Premium.
3. Coloque o UUID dela em `REVENUECAT_SANDBOX_USER_IDS` na Vercel, ou a compra de teste não libera o Premium.
4. Se o revisor puder criar outra conta, mantenha `REVENUECAT_ALLOW_SANDBOX=true` durante a revisão.
5. A compra ativa o Premium nessa conta. Antes de um novo envio, confira se a assinatura de teste expirou. Se não, exclua a linha dela em `subscriptions`.

**Conta 2, Premium, com banco de teste já conectado**

1. Crie a conta e libere o Premium com o comando comentado no fim de `migration_premium.sql`.
2. Conecte um banco de teste da Pluggy. Eles só aparecem com `PLUGGY_ENVIRONMENT=sandbox`, que os mostraria a todos os usuários em produção. Faça a conexão em uma implantação de teste da Vercel, com esse valor e o mesmo banco, e deixe produção em `production`.
3. Confira no app se saldos, extrato, faturas e investimentos apareceram.

As senhas ficam só no formulário das lojas, nunca neste repositório.

## 9. Notas de revisão

Preencha os e-mails e envie junto com as senhas:

> O SimpleFinan organiza contas a pagar, metas e carteira de investimentos. O app não movimenta dinheiro e não faz recomendação de investimento.
>
> CONTAS DE TESTE. Use as contas abaixo. Compras de teste feitas em outra conta podem não liberar o Premium.
> 1. Plano gratuito, para testar a compra: [e-mail] / [senha]. Vá em Perfil → Planos, compre e aguarde a confirmação, que pode levar alguns minutos. "Restaurar compras" fica na mesma tela.
> 2. Premium com banco de teste já conectado: [e-mail] / [senha]. Veja a tela Open Finance, o Extrato e a Carteira.
>
> RECURSOS NATIVOS DO APP, além do conteúdo web:
> - Compra e restauração pela loja (StoreKit e Google Play Billing, via RevenueCat).
> - Bloqueio por biometria: Perfil → Bloqueio com biometria.
> - Notificações de lembrete de contas: ativadas em Perfil. Tocar na notificação abre o app na tela relacionada.
> - Entrada social em sessão segura do sistema, não dentro da WebView.
> - Botão voltar do Android integrado aos modais e à navegação.
> - Nova tentativa automática de carregar ao recuperar a conexão.
>
> EXCLUSÃO DE CONTA: Perfil → Excluir minha conta.
>
> O teste grátis de 14 dias existe apenas no site e não é oferecido dentro do app.

Se o valor de `TRIAL_DAYS` (`lib/plans.ts`) mudar, atualize o número de dias. Confira se os caminhos de tela acima continuam iguais antes de cada envio. No iPhone, só cite entrada social se a opção B da seção 2 estiver ativa.

## 10. Testes em aparelho

Faça tudo em um build real do EAS, em um iPhone e em um Android, não no Expo Go, onde notificações e compra não funcionam.

**Nos dois aparelhos**

- [ ] Criar conta com e-mail, confirmar pelo link e entrar.
- [ ] Criar uma conta a pagar e marcá-la como paga. Conferir o painel.
- [ ] Adicionar um ativo à carteira. Conferir cotação e data da atualização.
- [ ] Criar uma meta e registrar um aporte.
- [ ] Excluir a conta em Perfil. Conferir que não se entra mais e que os dados sumiram.
- [ ] Recuperar a senha: pedir no app, abrir o link do e-mail no navegador, tocar em Continuar, criar a senha, voltar ao app e entrar com ela.
- [ ] Compra sandbox com a conta 1: comprar, ver o Premium ativar, fechar e reabrir o app, usar "Restaurar compras".
- [ ] Conectar **dois bancos reais**: conferir saldos, extrato, faturas e investimentos de cada um. Desconectar um e conferir que só os dados dele sumiram.
- [ ] Ativar a biometria, fechar e reabrir o app.
- [ ] Permitir notificações e receber um lembrete de conta perto do vencimento. Tocar nele.
- [ ] Abrir o app sem internet, ver a mensagem de conexão, religar e ver a tela voltar.

**Só no Android**

- [ ] Voltar: com um modal aberto, fecha o modal. Em uma tela interna, volta à anterior. Na tela inicial, sai do app.
- [ ] Entrar com Google e com Facebook, se mantidos.

**Só no iPhone**

- [ ] Conferir a tela de entrada conforme a decisão da seção 2.
- [ ] Se a Apple estiver ativa: entrar com e-mail oculto, excluir a conta e conferir a revogação do acesso nos ajustes do Apple ID.

## 11. Depois de aprovado

- [ ] Preencher `NEXT_PUBLIC_APP_STORE_URL` e `NEXT_PUBLIC_PLAY_STORE_URL` na Vercel.
- [ ] Tirar `REVENUECAT_ALLOW_SANDBOX=true`, se foi usado na revisão. Manter `REVENUECAT_SANDBOX_USER_IDS` para as próximas revisões.
- [ ] Remover os endereços `exp://` de Redirect URLs, se ainda houver.
