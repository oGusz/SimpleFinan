// Histórico real da carteira a partir das fotos diárias. Funções puras: quem grava é lib/portfolio-snapshots.ts.
//
// A rentabilidade de cada dia é a das posições do dia anterior com os preços de hoje. Assim, uma compra
// nova não aparece como ganho (o que aconteceria comparando só o valor total), e o resultado é
// equivalente ao retorno ponderado pelo tempo, sem proventos.

export type Holdings = Record<string, { q: number; p: number }>

export interface Snapshot {
  day: string
  value: number
  holdings: Holdings
}

export interface HistoryPoint {
  day: string
  pct: number
}

const isPositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * Monta as posições de hoje. Sem cotação nova, usa a última conhecida do mesmo ativo; sem nenhuma,
 * o ativo fica de fora e é informado, em vez de entrar com preço inventado.
 */
export function buildHoldings(
  positions: { ticker: string; quantity: number }[],
  quotes: Map<string, number>,
  previous: Holdings | null,
): { holdings: Holdings; value: number; missing: string[] } {
  const holdings: Holdings = {}
  const missing: string[] = []
  for (const { ticker, quantity } of positions) {
    if (!isPositive(quantity)) continue
    const price = quotes.get(ticker) ?? previous?.[ticker]?.p
    if (!isPositive(price)) {
      missing.push(ticker)
      continue
    }
    const current = holdings[ticker]
    holdings[ticker] = { q: (current?.q ?? 0) + quantity, p: price }
  }
  const value = Object.values(holdings).reduce((sum, { q, p }) => sum + q * p, 0)
  return { holdings, value: Math.round(value * 100) / 100, missing }
}

/** Retorno acumulado, em %, desde a primeira foto. */
export function twrSeries(snapshots: Snapshot[]): HistoryPoint[] {
  const sorted = [...snapshots].sort((a, b) => a.day.localeCompare(b.day))
  if (sorted.length === 0) return []

  let factor = 1
  const points: HistoryPoint[] = [{ day: sorted[0].day, pct: 0 }]
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1].holdings
    const current = sorted[index].holdings
    let before = 0
    let after = 0
    for (const [ticker, { q, p }] of Object.entries(previous)) {
      const price = current[ticker]?.p
      // Ativo vendido hoje some de `current`: sem preço de hoje, ele não entra no retorno do dia.
      if (!isPositive(q) || !isPositive(p) || !isPositive(price)) continue
      before += q * p
      after += q * price
    }
    if (before > 0) factor *= after / before
    points.push({ day: sorted[index].day, pct: (factor - 1) * 100 })
  }
  return points
}

/**
 * CDI acumulado nos mesmos dias. `rates` traz a taxa diária em % (série 12 do BCB): cada dia útil
 * entre uma foto e a seguinte entra uma vez.
 */
export function accumulateDailyRates(rates: { date: string; rate: number }[], days: string[]): HistoryPoint[] | null {
  if (days.length === 0) return []
  const sorted = [...rates].sort((a, b) => a.date.localeCompare(b.date))
  const lastRate = sorted.at(-1)?.date
  // Sem taxa publicada para o último dia, a série pararia antes da carteira e pareceria menor.
  if (!lastRate || lastRate < days[days.length - 1]) {
    const usable = days.filter((day) => day <= (lastRate ?? ''))
    if (usable.length < 2) return null
    days = usable
  }
  let factor = 1
  let cursor = 0
  const points: HistoryPoint[] = [{ day: days[0], pct: 0 }]
  while (cursor < sorted.length && sorted[cursor].date <= days[0]) cursor += 1
  for (let index = 1; index < days.length; index += 1) {
    while (cursor < sorted.length && sorted[cursor].date <= days[index]) {
      factor *= 1 + sorted[cursor].rate / 100
      cursor += 1
    }
    points.push({ day: days[index], pct: (factor - 1) * 100 })
  }
  return points
}

/** Índice (como o Ibovespa) nos mesmos dias, pelo último fechamento até cada dia. */
export function closesToSeries(closes: { date: string; close: number }[], days: string[]): HistoryPoint[] | null {
  const sorted = closes.filter((item) => isPositive(item.close)).sort((a, b) => a.date.localeCompare(b.date))
  const closeOn = (day: string) => {
    let found: number | null = null
    for (const item of sorted) {
      if (item.date > day) break
      found = item.close
    }
    return found
  }
  const base = days.length > 0 ? closeOn(days[0]) : null
  if (!base) return null
  return days.map((day) => {
    const close = closeOn(day)
    return { day, pct: close ? (close / base - 1) * 100 : 0 }
  })
}
