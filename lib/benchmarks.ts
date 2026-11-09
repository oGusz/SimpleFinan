export type BenchmarkRange = '6m' | '12m' | 'ytd'
export type BenchmarkId = 'cdi' | 'ipca' | 'ibov' | 'ifix'
export type MonthlyValues = Record<string, number>

export interface AccumulatedPoint {
  month: string
  accumulatedPct: number
}

export interface BenchmarkSeries {
  id: BenchmarkId
  label: string
  note?: string
  status: 'ok' | 'unavailable'
  lastMonth: string | null
  points: AccumulatedPoint[]
}

export interface BenchmarksResponse {
  asOf: string
  range: BenchmarkRange
  months: string[]
  series: BenchmarkSeries[]
  tickerCloses: Record<string, MonthlyValues>
  failedTickers: string[]
}

const saoPauloMonth = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
})

/** O Yahoo marca cada mês às 03:00 UTC do dia 1º, então o fuso de Brasília define o mês certo. */
export function monthKeyInSaoPaulo(date: Date | number): string {
  const parts = saoPauloMonth.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  return `${year}-${month}`
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Só meses fechados: o mês corrente traria um ponto parcial. baseMonth é o mês anterior ao
 * primeiro da lista, cujo fechamento serve de referência. Em janeiro o 'ytd' não tem meses.
 */
export function closedMonths(
  range: BenchmarkRange,
  now: Date = new Date(),
): { months: string[]; baseMonth: string } {
  const current = monthKeyInSaoPaulo(now)
  const lastClosed = shiftMonth(current, -1)
  const year = current.slice(0, 4)

  if (range === 'ytd' && !lastClosed.startsWith(year)) {
    return { months: [], baseMonth: lastClosed }
  }

  const count = range === 'ytd' ? Number(lastClosed.slice(5)) : range === '6m' ? 6 : 12
  const months = Array.from({ length: count }, (_, index) => shiftMonth(lastClosed, index - count + 1))
  return { months, baseMonth: shiftMonth(months[0], -1) }
}

function roundPct(value: number) {
  return Math.round(value * 10_000) / 10_000
}

/** Taxas não podem ter lacuna: pular um mês daria um acumulado menor que o real, então a série para ali. */
export function accumulateRates(ratesPct: MonthlyValues, months: string[]): AccumulatedPoint[] {
  const points: AccumulatedPoint[] = []
  let factor = 1

  for (const month of months) {
    const rate = ratesPct[month]
    if (!Number.isFinite(rate)) break
    factor *= 1 + rate / 100
    points.push({ month, accumulatedPct: roundPct((factor - 1) * 100) })
  }
  return points
}

/** A base é o fechamento do mês anterior ao primeiro. Sem ela não há como calcular a variação. */
export function accumulateCloses(closes: MonthlyValues, months: string[]): AccumulatedPoint[] {
  if (months.length === 0) return []
  const base = closes[shiftMonth(months[0], -1)]
  if (!(base > 0)) return []

  return months
    .filter((month) => closes[month] > 0)
    .map((month) => ({ month, accumulatedPct: roundPct((closes[month] / base - 1) * 100) }))
}

function formatMonthLabel(month: string) {
  return `${month.slice(5)}/${month.slice(0, 4)}`
}

/** Fecha a série com status e nota. Sem nenhum ponto em um período com meses, ela fica indisponível. */
export function toBenchmarkSeries(
  info: { id: BenchmarkId; label: string },
  points: AccumulatedPoint[],
  months: string[],
): BenchmarkSeries {
  const lastMonth = points.at(-1)?.month ?? null
  const lagging = lastMonth !== null && lastMonth !== months.at(-1)

  return {
    ...info,
    ...(lagging ? { note: `até ${formatMonthLabel(lastMonth)}` } : {}),
    status: months.length > 0 && points.length === 0 ? 'unavailable' : 'ok',
    lastMonth,
    points,
  }
}

export function unavailableSeries(info: { id: BenchmarkId; label: string }): BenchmarkSeries {
  return { ...info, status: 'unavailable', lastMonth: null, points: [] }
}

/**
 * Usa a quantidade atual em todos os meses: mostra como a composição de hoje teria variado,
 * não o retorno das compras reais. Quem não tem fechamento na base e em todos os meses sai
 * da conta, porque entrar ou sair no meio do período pareceria ganho ou perda. Sem proventos.
 */
export function buildCompositionSeries(
  tickerCloses: Record<string, MonthlyValues>,
  holdings: { ticker: string; quantity: number }[],
  months: string[],
): { points: AccumulatedPoint[]; includedTickers: string[]; excludedTickers: string[] } {
  const quantities = new Map<string, number>()
  for (const { ticker, quantity } of holdings) {
    quantities.set(ticker, (quantities.get(ticker) ?? 0) + quantity)
  }

  if (months.length === 0) {
    return { points: [], includedTickers: [], excludedTickers: [...quantities.keys()] }
  }

  const baseMonth = shiftMonth(months[0], -1)
  const includedTickers: string[] = []
  const excludedTickers: string[] = []
  for (const [ticker, quantity] of quantities) {
    const closes = tickerCloses[ticker]
    const complete = quantity > 0 && [baseMonth, ...months].every((month) => closes?.[month] > 0)
    if (complete) includedTickers.push(ticker)
    else excludedTickers.push(ticker)
  }

  if (includedTickers.length === 0) return { points: [], includedTickers, excludedTickers }

  const valueAt = (month: string) =>
    includedTickers.reduce(
      (sum, ticker) => sum + quantities.get(ticker)! * tickerCloses[ticker][month],
      0,
    )
  const baseValue = valueAt(baseMonth)
  const points = months.map((month) => ({
    month,
    accumulatedPct: roundPct((valueAt(month) / baseValue - 1) * 100),
  }))

  return { points, includedTickers, excludedTickers }
}
