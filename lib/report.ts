// Relatório de um mês: contas, carteira, proventos e metas. Função pura; a rota busca os dados.
import { accumulateDailyRates, closesToSeries, twrSeries, type Snapshot } from '@/lib/portfolio-history'

export interface MonthlyReport {
  month: string
  /** false para o mês corrente, que ainda pode mudar. */
  closed: boolean
  bills: {
    total: number
    paid: number
    pending: number
    count: number
    byCategory: { category: string; total: number }[]
  }
  portfolio: {
    startDay: string
    endDay: string
    startValue: number
    endValue: number
    returnPct: number
    cdiPct: number | null
    ibovPct: number | null
  } | null
  dividends: {
    total: number
    items: { ticker: string; amount: number }[]
    /** true quando faltou foto da carteira e a quantidade usada foi a de hoje. */
    estimated: boolean
  }
  goals: { title: string; current: number; target: number; pct: number }[]
}

export interface ReportInput {
  month: string
  today: string
  bills: { amount: number; status: string; category?: string | null }[]
  snapshots: Snapshot[]
  dividendEvents: Map<string, { date: string; amount: number }[]>
  currentQuantities: Map<string, number>
  goals: { title: string; current_amount: number; target_amount: number }[]
  cdiRates: { date: string; rate: number }[] | null
  ibovCloses: { date: string; close: number }[] | null
}

const round2 = (value: number) => Math.round(value * 100) / 100

export function monthBounds(month: string) {
  const [year, index] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, index, 0)).getUTCDate()
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` }
}

export function buildMonthlyReport(input: ReportInput): MonthlyReport {
  const { start, end } = monthBounds(input.month)

  const byCategory = new Map<string, number>()
  let total = 0
  let paid = 0
  for (const bill of input.bills) {
    const amount = Number(bill.amount) || 0
    total += amount
    if (bill.status === 'paid') paid += amount
    const category = bill.category?.trim() || 'Outros'
    byCategory.set(category, (byCategory.get(category) ?? 0) + amount)
  }

  // A base é a última foto antes do mês: o primeiro dia do mês também conta.
  const sorted = [...input.snapshots].sort((a, b) => a.day.localeCompare(b.day))
  const before = sorted.filter((snapshot) => snapshot.day < start).at(-1)
  const inMonth = sorted.filter((snapshot) => snapshot.day >= start && snapshot.day <= end)
  const window = before ? [before, ...inMonth] : inMonth
  let portfolio: MonthlyReport['portfolio'] = null
  if (window.length >= 2) {
    const points = twrSeries(window)
    const days = points.map((point) => point.day)
    const cdi = input.cdiRates ? accumulateDailyRates(input.cdiRates, days) : null
    const ibov = input.ibovCloses ? closesToSeries(input.ibovCloses, days) : null
    portfolio = {
      startDay: window[0].day,
      endDay: window[window.length - 1].day,
      startValue: window[0].value,
      endValue: window[window.length - 1].value,
      returnPct: points[points.length - 1].pct,
      // Índice que não cobre o mesmo período ficaria mais curto que a carteira: melhor omitir.
      cdiPct: cdi && cdi.at(-1)?.day === days.at(-1) ? (cdi.at(-1)?.pct ?? null) : null,
      ibovPct: ibov?.at(-1)?.pct ?? null,
    }
  }

  // Proventos pela data ex do mês, com a quantidade que a carteira tinha naquele dia.
  let estimated = false
  const items: { ticker: string; amount: number }[] = []
  for (const [ticker, events] of input.dividendEvents) {
    let amount = 0
    for (const event of events) {
      if (event.date < start || event.date > end) continue
      const held = sorted.filter((snapshot) => snapshot.day <= event.date).at(-1)?.holdings[ticker]?.q
      let quantity = held
      if (quantity === undefined && sorted.length === 0) {
        quantity = input.currentQuantities.get(ticker)
        if (quantity) estimated = true
      }
      if (quantity && quantity > 0) amount += quantity * event.amount
    }
    if (amount > 0) items.push({ ticker, amount: round2(amount) })
  }
  items.sort((a, b) => b.amount - a.amount)

  return {
    month: input.month,
    closed: input.today > end,
    bills: {
      total: round2(total),
      paid: round2(paid),
      pending: round2(total - paid),
      count: input.bills.length,
      byCategory: [...byCategory.entries()]
        .map(([category, value]) => ({ category, total: round2(value) }))
        .sort((a, b) => b.total - a.total),
    },
    portfolio,
    dividends: { total: round2(items.reduce((sum, item) => sum + item.amount, 0)), items, estimated },
    goals: input.goals.map((goal) => {
      const current = Number(goal.current_amount) || 0
      const target = Number(goal.target_amount) || 0
      return { title: goal.title, current, target, pct: target > 0 ? Math.min(100, (current / target) * 100) : 0 }
    }),
  }
}
