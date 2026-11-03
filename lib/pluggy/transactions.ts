// A Pluggy devolve categorias em inglês. As desconhecidas aparecem como vieram.
const CATEGORY_LABELS: Record<string, string> = {
  income: 'Renda',
  salary: 'Salário',
  'loans and financing': 'Empréstimos',
  investments: 'Investimentos',
  'same person transfer': 'Transferência entre contas',
  transfers: 'Transferências',
  'legal obligations': 'Obrigações legais',
  services: 'Serviços',
  shopping: 'Compras',
  'digital services': 'Serviços digitais',
  groceries: 'Mercado',
  'food and drinks': 'Alimentação',
  eating: 'Alimentação',
  travel: 'Viagens',
  donations: 'Doações',
  gambling: 'Apostas',
  taxes: 'Impostos',
  'bank fees': 'Tarifas bancárias',
  housing: 'Moradia',
  healthcare: 'Saúde',
  transportation: 'Transporte',
  insurance: 'Seguros',
  leisure: 'Lazer',
  education: 'Educação',
  'credit card payment': 'Pagamento de fatura',
}

export const UNCATEGORIZED = 'Outros'

export function translateCategory(category: unknown): string {
  if (typeof category !== 'string' || !category.trim()) return UNCATEGORIZED
  return CATEGORY_LABELS[category.trim().toLowerCase()] ?? category.trim()
}

export function toTransactionRow(transaction: any, userId: string, itemId: string) {
  return {
    user_id: userId,
    pluggy_transaction_id: String(transaction.id),
    pluggy_account_id: String(transaction.accountId),
    item_id: itemId,
    description: transaction.description || transaction.descriptionRaw || 'Transação',
    amount: Number(transaction.amount) || 0,
    type: transaction.type === 'CREDIT' ? 'CREDIT' : 'DEBIT',
    date: String(transaction.date).slice(0, 10),
    category: translateCategory(transaction.category),
    balance_after: transaction.balance == null ? null : Number(transaction.balance),
  }
}

/** A Pluggy envia `next` pronto para anexar ao caminho, ou null quando acabou. */
export function nextTransactionsPath(next: unknown): string | null {
  return typeof next === 'string' && next ? `/v2/transactions${next}` : null
}
