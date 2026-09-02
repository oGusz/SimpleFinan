export type PaymentStatus = 'pago' | 'pendente' | 'vence-breve'

export type Payment = {
  id: string
  title: string
  category: string
  dueDate: string
  amount: number
  status: PaymentStatus
  kind: 'boleto' | 'cartao' | 'assinatura'
}

export type Allocation = {
  id: string
  label: string
  percentage: number
  value: number
  changePct: number
}

export const summary = {
  netWorth: 486_320.45,
  netWorthChangePct: 2.8,
  billsThisMonth: 8_742.9,
  billsPaidRatio: 0.42,
  invested: 312_580.0,
  investedYieldPct: 11.4,
  month: 'Agosto de 2026',
}

export const payments: Payment[] = [
  {
    id: 'p1',
    title: 'Cartão Infinite',
    category: 'Fatura · vencimento 26',
    dueDate: '26 Ago',
    amount: 3_180.44,
    status: 'vence-breve',
    kind: 'cartao',
  },
  {
    id: 'p2',
    title: 'Aluguel',
    category: 'Moradia',
    dueDate: '28 Ago',
    amount: 2_950.0,
    status: 'pendente',
    kind: 'boleto',
  },
  {
    id: 'p3',
    title: 'Energia elétrica',
    category: 'Utilidades',
    dueDate: '29 Ago',
    amount: 318.2,
    status: 'pendente',
    kind: 'boleto',
  },
  {
    id: 'p4',
    title: 'Plano de saúde',
    category: 'Saúde',
    dueDate: '30 Ago',
    amount: 764.9,
    status: 'pendente',
    kind: 'boleto',
  },
  {
    id: 'p5',
    title: 'Cartão Platinum',
    category: 'Fatura · vencimento 05',
    dueDate: '05 Set',
    amount: 1_246.16,
    status: 'pendente',
    kind: 'cartao',
  },
  {
    id: 'p6',
    title: 'Internet fibra',
    category: 'Utilidades',
    dueDate: '12 Ago',
    amount: 189.9,
    status: 'pago',
    kind: 'boleto',
  },
  {
    id: 'p7',
    title: 'Assinaturas digitais',
    category: 'Recorrente',
    dueDate: '14 Ago',
    amount: 93.3,
    status: 'pago',
    kind: 'assinatura',
  },
]

export const allocations: Allocation[] = [
  {
    id: 'a1',
    label: 'Renda fixa',
    percentage: 38,
    value: 118_780.4,
    changePct: 0.9,
  },
  {
    id: 'a2',
    label: 'Ações globais',
    percentage: 27,
    value: 84_396.6,
    changePct: 3.4,
  },
  {
    id: 'a3',
    label: 'Fundos imobiliários',
    percentage: 18,
    value: 56_264.4,
    changePct: -1.2,
  },
  {
    id: 'a4',
    label: 'Cripto',
    percentage: 11,
    value: 34_383.8,
    changePct: 6.7,
  },
  {
    id: 'a5',
    label: 'Caixa',
    percentage: 6,
    value: 18_754.8,
    changePct: 0.3,
  },
]

export const yieldSeries = [
  4.1, 4.6, 5.2, 5.0, 6.1, 6.8, 6.4, 7.5, 8.3, 9.1, 10.2, 11.4,
]

export const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value)

export const compactCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
