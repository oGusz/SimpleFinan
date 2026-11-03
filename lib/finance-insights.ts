export interface TransactionLike {
  amount: number
  type: string | null
  category: string | null
}

export interface BillLike {
  title?: string
  amount: number
  due_date: string
  status: string
}

export interface CashFlowLike {
  year: number
  monthNum: number
  expense: number
}

// Não são gasto nem renda de verdade: contar duplicaria os valores.
const NON_SPENDING_CATEGORIES = ['Transferência entre contas', 'Pagamento de fatura']

export function summarizeTransactions(transactions: TransactionLike[]) {
  let income = 0
  let expense = 0
  const totals = new Map<string, number>()

  for (const transaction of transactions) {
    const category = transaction.category || 'Outros'
    if (NON_SPENDING_CATEGORIES.includes(category)) continue

    const value = Math.abs(Number(transaction.amount) || 0)
    if (transaction.type === 'CREDIT') {
      income += value
    } else {
      expense += value
      totals.set(category, (totals.get(category) ?? 0) + value)
    }
  }

  const byCategory = [...totals.entries()]
    .map(([category, total]) => ({
      category,
      total,
      percent: expense > 0 ? (total / expense) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total)

  return { income, expense, byCategory }
}

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/** Monta com o extrato o mesmo histórico que o modo manual monta com as contas. */
export function transactionsToHistory(transactions: (TransactionLike & { date: string })[]) {
  const months = new Map<string, (TransactionLike & { date: string })[]>()
  for (const transaction of transactions) {
    const key = transaction.date.slice(0, 7)
    months.set(key, [...(months.get(key) ?? []), transaction])
  }

  return [...months.keys()].sort().map((key) => {
    const [year, monthNum] = key.split('-').map(Number)
    const { income, expense } = summarizeTransactions(months.get(key) ?? [])
    return { month: MONTH_LABELS[monthNum - 1], year, monthNum, expense, income }
  })
}

/**
 * O banco não informa se a fatura foi quitada de forma confiável. Sem pagamento registrado,
 * uma fatura vencida conta como encerrada, para não acusar um atraso que pode não existir.
 */
export function getInvoiceStatus(hasPayments: boolean, dueDate: string, today: string) {
  return hasPayments || dueDate < today ? 'paid' : 'pending'
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Data de hoje no Brasil: o servidor roda em UTC e viraria o dia às 21h. */
export function todayInBrazil(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
}

export function getBillsDueSoon<T extends BillLike>(bills: T[], today: string, days = 3) {
  const limit = addDays(today, days)
  const pending = bills.filter((bill) => bill.status !== 'paid' && bill.due_date)
  return {
    overdue: pending.filter((bill) => bill.due_date.slice(0, 10) < today),
    dueSoon: pending.filter((bill) => {
      const dueDate = bill.due_date.slice(0, 10)
      return dueDate >= today && dueDate <= limit
    }),
  }
}

export function compareWithPreviousMonth(history: CashFlowLike[], month: number, year: number) {
  const previousMonth = month === 1 ? 12 : month - 1
  const previousYear = month === 1 ? year - 1 : year
  const expenseOf = (targetMonth: number, targetYear: number) =>
    history.find((item) => item.monthNum === targetMonth && item.year === targetYear)?.expense ?? 0

  const current = expenseOf(month, year)
  const previous = expenseOf(previousMonth, previousYear)
  return {
    current,
    previous,
    changePercent: previous > 0 ? ((current - previous) / previous) * 100 : null,
  }
}

export function previousMonthRange(today: string) {
  const [year, month] = today.split('-').map(Number)
  const previousYear = month === 1 ? year - 1 : year
  const previousMonth = month === 1 ? 12 : month - 1
  const lastDay = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate()
  const prefix = `${previousYear}-${String(previousMonth).padStart(2, '0')}`
  return { key: prefix, start: `${prefix}-01`, end: `${prefix}-${String(lastDay).padStart(2, '0')}` }
}

export { addDays }
