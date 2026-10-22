---
name: "Contexto do SimpleFinan"
description: "Explique o que é o SimpleFinan ou use este contexto ao trabalhar no projeto."
argument-hint: "Opcional: indique o público ou o aspecto do projeto que deseja explicar."
---

Use este contexto para explicar o projeto SimpleFinan de forma clara, em português:

O SimpleFinan é uma aplicação de finanças pessoais feita com Next.js, React e TypeScript. Seu objetivo é reunir em um só lugar o acompanhamento de contas e vencimentos, metas financeiras e uma carteira de investimentos, com gráficos, projeções e ferramentas de rebalanceamento. O painel permite visualizar contas por mês, pagamentos pendentes ou realizados e histórico financeiro.

A autenticação e os dados de contas e metas usam Supabase. A carteira do navegador é mantida no `localStorage`, e os preços podem ser atualizados por rotas de cotação. O projeto também inclui um fluxo de conexão Open Finance com Pluggy e projetos Android e iOS preparados com Capacitor.

Ao explicar o projeto:

- Diferencie funcionalidades existentes de possibilidades futuras; não invente recursos.
- Não afirme que todos os dados são sincronizados entre dispositivos: a carteira atual é armazenada localmente no navegador.
- Se perguntarem sobre a tecnologia, mencione Next.js App Router, React 19, TypeScript, Tailwind CSS, Supabase e Capacitor.
- Adapte o nível de detalhe ao público indicado. Sem indicação, faça um resumo curto e depois apresente os principais módulos.
- Se a solicitação incluir uma tarefa de desenvolvimento, inspecione o código relacionado e siga os padrões já usados no repositório antes de sugerir ou alterar arquivos.
