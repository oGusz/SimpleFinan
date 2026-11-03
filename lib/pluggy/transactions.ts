// A Pluggy devolve categorias em inglês. As desconhecidas aparecem como vieram.
const CATEGORY_LABELS: Record<string, string> = {
  income: 'Renda',
  salary: 'Salário',
  'loans and financing': 'Empréstimos',
  investments: 'Investimentos',
  'same person transfer': 'Transferência entre contas',
  'transfer - internal': 'Transferência entre contas',
  transfers: 'Transferências',
  'third party transfers': 'Transferências',
  electronics: 'Eletrônicos',
  'food delivery': 'Delivery',
  'gas stations': 'Combustível',
  pharmacy: 'Farmácia',
  telecommunications: 'Telefonia e internet',
  mobile: 'Celular',
  'eating out': 'Restaurantes',
  parking: 'Estacionamento',
  'video streaming': 'Streaming',
  'sports practice': 'Esportes',
  electricity: 'Energia',
  water: 'Água',
  'public transportation': 'Transporte público',
  clothing: 'Roupas',
  bookstore: 'Livraria',
  'vehicle maintenance': 'Manutenção do veículo',
  automotive: 'Veículo',
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

const INVESTMENT_LABELS: Record<string, string> = {
  STOCK: 'Ações',
  REAL_ESTATE_FUND: 'Fundos imobiliários',
  ETF: 'ETFs',
  BDR: 'BDRs',
  EQUITY: 'Ações',
  FIXED_INCOME: 'Renda fixa',
  MUTUAL_FUND: 'Fundos',
  SECURITY: 'Previdência',
  COE: 'COE',
}

const MAX_TICKER_LENGTH = 24

export function toInvestmentRows(investments: any[], userId: string) {
  const seenTickers = new Set<string>()

  return investments.map((investment) => {
    // Renda fixa costuma vir sem código, e o nome inteiro não caberia na tela como ticker.
    const baseTicker = String(investment.code || investment.name || investment.id)
      .trim().replace(/\s+/g, '-').toUpperCase().slice(0, MAX_TICKER_LENGTH)
    // Dois ativos com o mesmo código fariam o upsert inteiro falhar.
    const ticker = seenTickers.has(baseTicker)
      ? `${baseTicker}-${String(investment.id).slice(0, 8).toUpperCase()}`
      : baseTicker
    seenTickers.add(ticker)

    // Com cotas, `value` é o preço unitário. Sem cotas (renda fixa), a posição é o `balance`.
    const units = Number(investment.quantity) || 0
    const unitValue = Number(investment.value) || 0
    const hasUnits = units > 0 && unitValue > 0
    const quantity = hasUnits ? units : 1
    const price = hasUnits ? unitValue : Number(investment.balance ?? investment.amount ?? 0) || 0
    const category =
      INVESTMENT_LABELS[investment.subtype] ?? INVESTMENT_LABELS[investment.type] ?? 'Investimento'

    return {
      user_id: userId,
      ticker,
      // Coluna antiga da tabela, obrigatória: sem ela nenhum investimento é gravado.
      ticker_name: ticker,
      name: investment.name || ticker,
      quantity,
      price,
      avg_price: price,
      category,
      type: investment.type || 'Investimento',
      source: 'open_finance',
      updated_at: new Date().toISOString(),
    }
  })
}

export function toBillRow(bill: any, account: any, userId: string, itemId: string) {
  return {
    user_id: userId,
    item_id: itemId,
    pluggy_bill_id: String(bill.id),
    pluggy_account_id: String(account.id),
    account_name: account.name || 'Cartão de crédito',
    due_date: String(bill.dueDate).slice(0, 10),
    total_amount: Number(bill.totalAmount) || 0,
    has_payments: Array.isArray(bill.payments) && bill.payments.length > 0,
  }
}

/** A Pluggy envia `next` pronto para anexar ao caminho, ou null quando acabou. */
export function nextTransactionsPath(next: unknown): string | null {
  return typeof next === 'string' && next ? `/v2/transactions${next}` : null
}
