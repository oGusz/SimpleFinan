# 🏦 SimpleFinan — Gestão Financeira & Carteira de Investimentos

> Plataforma completa e moderna para gerenciamento de finanças pessoais, controle de contas a pagar/receber, planejamento de metas e acompanhamento de carteira de ativos (FIIs, Ações e Renda Fixa).

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38BDF8?style=for-the-badge&logo=tailwind-css)
![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Auth-3FCF8E?style=for-the-badge&logo=supabase)
![Capacitor](https://img.shields.io/badge/Capacitor-Mobile%20Ready-119EFF?style=for-the-badge&logo=capacitor)

---

## 📌 Visão Geral

O **SimpleFinan** foi projetado para resolver a fragmentação do controle financeiro pessoal, unindo em um único Dashboard intuitivo a previsão de fluxo de caixa mensal e a gestão inteligente de investimentos.

Desenvolvido originalmente como uma aplicação Web de alta performance (Next.js App Router), a arquitetura foi preparada com **Capacitor.js** para distribuição nativa no **Android (Google Play Store)** e **iOS (Apple App Store)**.

---

## 🚀 Funcionalidades Principais

* **📊 Dashboard Financeiro Consolidado:**
  * Resumo dinâmico de despesas, receitas e saldo disponível.
  * Navegação rápida por período (navegação mensal e anual).
  * Linha do tempo unificada combinando previsão de contas e recebimento de proventos.

* **📑 Gestão de Contas & Faturas:**
  * Cadastro e acompanhamento de contas recorrentes e pontuais.
  * Alternância rápida de status de pagamento (`Pago` / `Pendente`).
  * Alertas visuais para vencimentos próximos ou em atraso.

* **💼 Carteira de Investimentos & Rebalanceamento:**
  * Acompanhamento de ativos (FIIs, Ações, Renda Fixa).
  * Cálculo dinâmico de alocação de carteira por categoria.
  * Widget interativo de rebalanceamento com metas percentuais de alocação.
  * Histórico e projeção de dividendos/rendimentos.

* **🎯 Metas Financeiras (Financial Goals):**
  * Criação de objetivos com barras de progresso visuais e aportes pontuais.
  * Cálculo automático de prazos e estimativas de aportes mensais.

---

## 🛠️ Tech Stack

### **Front-end & Core App**
* **Framework:** Next.js (React 18 / App Router)
* **Linguagem:** TypeScript
* **Estilização:** Tailwind CSS + Lucide Icons
* **Gerenciamento de Estado:** React Context API & Custom Hooks

### **Back-end & Infraestrutura**
* **Banco de Dados & Autenticação:** Supabase (PostgreSQL + Row Level Security - RLS)
* **Server Actions:** Next.js Server Actions para mutações e buscas seguras

### **Mobile Engine**
* **Framework Nativo:** Capacitor.js (Android & iOS)

---

## 📂 Estrutura do Projeto

```text
simplefinan/
├── app/                  # Rotas e Server Actions do Next.js App Router
│   ├── actions/          # Sever Actions (Integração Supabase RLS)
│   ├── carteira/         # Rota da Carteira de Investimentos
│   └── page.tsx          # Dashboard Principal
├── components/           # Componentes reutilizáveis da interface
│   ├── bills/            # Modais e formulários de contas
│   ├── goals/            # Módulo de Metas Financeiras
│   ├── month-selector.tsx# Componente de navegação mensal
│   └── ...               # Gráficos, Timelines e Rebalanceador
├── context/              # Contexto global da carteira e estado do usuário
├── lib/                  # Utilitários e cliente Supabase
├── android/              # Projeto nativo Android (Capacitor)
├── ios/                  # Projeto nativo iOS (Capacitor)
├── capacitor.config.json # Configuração global do Capacitor
└── package.json
