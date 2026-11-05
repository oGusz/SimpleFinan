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
  read_only?: boolean
}

export interface CashFlowLike {
  year: number
  monthNum: number
  expense: number
  income?: number
}

export type InvoiceStatus = 'paid' | 'partial' | 'pending' | 'unconfirmed'

export interface InvoiceLike {
  pluggy_account_id: string
  due_date: string
  payments_total?: number | string | null
}

/** Colunas de uma migração ainda não aplicada: quem chama tenta de novo sem o campo novo. */
export function isMissingColumnError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST204' || code === '42703'
}

export function isMissingTableError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === 'PGRST205' || code === '42P01'
}

const PAGE_SIZE = 1000

/**
 * Lê até acabar. O servidor pode limitar uma resposta abaixo do pedido sem avisar, por isso
 * só uma página vazia encerra. A consulta precisa ter ordem total para não pular nem repetir linha.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: any; error: any }>,
): Promise<T[]> {
  const rows: T[] = []
  for (;;) {
    const { data, error } = await fetchPage(rows.length, rows.length + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) return rows
    rows.push(...(data as T[]))
  }
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

const PAYMENT_TOLERANCE = 0.01

/**
 * Os pagamentos da fatura N aparecem na fatura N+1 (documentação da Pluggy), então quem chama
 * informa os da seguinte. Sem essa informação, vencida é 'unconfirmed': nem paga nem atrasada,
 * pois não dá para afirmar nenhuma das duas.
 */
export function getInvoiceStatus({
  totalAmount,
  dueDate,
  today,
  nextBillPayments,
}: {
  totalAmount: number
  dueDate: string
  today: string
  nextBillPayments: number | null
}): InvoiceStatus {
  // Fatura zerada ou com crédito não tem o que pagar.
  if (totalAmount <= 0) return 'paid'

  const payments = nextBillPayments ?? 0
  if (nextBillPayments !== null && payments >= totalAmount - PAYMENT_TOLERANCE) return 'paid'
  if (payments > 0) return 'partial'
  return dueDate.slice(0, 10) < today ? 'unconfirmed' : 'pending'
}

/** Pagamentos da próxima fatura do mesmo cartão, ou null se ela não existir ou não informar. */
export function findNextBillPayments(invoice: InvoiceLike, invoices: InvoiceLike[]): number | null {
  const next = invoices
    .filter((item) => item.pluggy_account_id === invoice.pluggy_account_id && item.due_date > invoice.due_date)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
  if (next?.payments_total == null) return null
  const payments = Number(next.payments_total)
  return Number.isFinite(payments) ? payments : null
}

export function isSettledBill(status: string | null | undefined) {
  return String(status ?? '').toLowerCase() === 'paid'
}

/** Fatura vem do banco e não dá para corrigir no app: nunca é acusada de atraso. */
export function isOverdueCapable(bill: { read_only?: boolean }) {
  return !bill.read_only
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
  const pending = bills.filter((bill) => !isSettledBill(bill.status) && bill.due_date)
  return {
    overdue: pending.filter((bill) => isOverdueCapable(bill) && bill.due_date.slice(0, 10) < today),
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

/**
 * Mês em andamento contra o mesmo trecho do mês anterior: comparar com o mês inteiro mostraria
 * uma economia que não existe. Null se o extrato importado não cobrir o mês anterior desde o início.
 */
export function compareMonthToDate(transactions: (TransactionLike & { date: string })[], today: string) {
  if (transactions.length === 0) return null

  const { key: previousKey, start: previousStart } = previousMonthRange(today)
  const firstDate = transactions.reduce(
    (earliest, transaction) => (transaction.date < earliest ? transaction.date : earliest),
    transactions[0].date,
  )
  if (firstDate > previousStart) return null

  const dayText = today.slice(8, 10)
  const expenseBetween = (start: string, end: string) =>
    summarizeTransactions(transactions.filter(({ date }) => date >= start && date <= end)).expense

  return {
    currentToDay: expenseBetween(`${today.slice(0, 7)}-01`, today),
    // Em fevereiro, '02-31' como texto simplesmente inclui o mês até o fim.
    previousToDay: expenseBetween(previousStart, `${previousKey}-${dayText}`),
    day: Number(dayText),
  }
}

const monthIndex = (year: number, month: number) => year * 12 + (month - 1)

/** Os últimos meses até o atual, sem os futuros que a recorrência já criou. */
export function lastMonths<T extends { year: number; monthNum: number }>(history: T[], today: string, count = 6) {
  const [year, month] = today.split('-').map(Number)
  const current = monthIndex(year, month)
  return history.filter((item) => {
    const index = monthIndex(item.year, item.monthNum)
    return index <= current && index > current - count
  })
}

// Abaixo de 5% de diferença, a variação é ruído e não uma tendência.
const STABLE_TREND_RATIO = 0.05
const MIN_MONTHS_WITH_INCOME = 2

/**
 * Compara a sobra média dos últimos 3 meses fechados com a dos 3 anteriores. O mês corrente fica
 * de fora porque está incompleto. Sem os 6 meses ou sem entradas reais, não há o que afirmar.
 */
export function cashFlowTrend(history: CashFlowLike[], today: string): 'up' | 'down' | 'stable' | null {
  const [year, month] = today.split('-').map(Number)
  const current = monthIndex(year, month)
  const closed = [6, 5, 4, 3, 2, 1].map((offset) =>
    history.find((item) => monthIndex(item.year, item.monthNum) === current - offset),
  )
  if (closed.some((item) => !item)) return null

  const months = closed as CashFlowLike[]
  if (months.filter((item) => (item.income ?? 0) > 0).length < MIN_MONTHS_WITH_INCOME) return null

  const averageSurplus = (items: CashFlowLike[]) =>
    items.reduce((sum, item) => sum + (item.income ?? 0) - item.expense, 0) / items.length

  const before = averageSurplus(months.slice(0, 3))
  const after = averageSurplus(months.slice(3))
  if (Math.abs(after - before) <= Math.abs(before) * STABLE_TREND_RATIO) return 'stable'
  return after > before ? 'up' : 'down'
}

/** Meses de calendário tocados por um intervalo, em ordem. */
export function monthsInRange(startIso: string, endIso: string) {
  const [startYear, startMonth] = startIso.split('-').map(Number)
  const [endYear, endMonth] = endIso.split('-').map(Number)
  const months: { year: number; month: number }[] = []
  for (let index = monthIndex(startYear, startMonth); index <= monthIndex(endYear, endMonth); index += 1) {
    months.push({ year: Math.floor(index / 12), month: (index % 12) + 1 })
  }
  return months
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
