import 'server-only'

import { fetchBrapiQuote } from '@/lib/brapi'
import {
  accumulateCloses,
  accumulateRates,
  type BenchmarkId,
  type BenchmarkSeries,
  closedMonths,
  monthKeyInSaoPaulo,
  type MonthlyValues,
  toBenchmarkSeries,
  unavailableSeries,
} from '@/lib/benchmarks'

const TIMEOUT_MS = 8_000
const QUOTE_CACHE_SECONDS = 60
const DIVIDEND_WINDOW_MONTHS = 12
const DAILY_CACHE_SECONDS = 86_400
const CONCURRENCY = 5
// O intervalo de 12 meses precisa de 13 fechamentos, contando a base, e 1y não traz o 13º.
const MONTHLY_RANGE = '2y'
// Com 50 ativos e tudo fora do ar, os timeouts somariam mais de um minuto de espera.
const BRAPI_RETRY_BUDGET_MS = 12_000
const TOTAL_BUDGET_MS = 25_000
// Papéis encerrados continuam com o último preço no Yahoo, às vezes de mais de um ano atrás.
const MAX_QUOTE_AGE_MS = 7 * 24 * 60 * 60 * 1000

const IFIX_LABEL = 'IFIX (aprox. pelo ETF XFIX11, só preço)'

export type MarketResult<T> = { status: 'ok'; data: T } | { status: 'unavailable' }

export interface YahooChart {
  longName: string | null
  shortName: string | null
  price: number | null
  marketTime: string | null
  timestamps: number[]
  closes: (number | null)[]
  dividends: { date: number; amount: number }[]
}

export interface Quote {
  ticker: string
  price: number
  marketTime: string | null
}

export interface DividendItem {
  ticker: string
  status: 'ok' | 'none' | 'unavailable'
  total12m: number | null
  monthlyAverage: number | null
  lastDate: string | null
  eventCount: number
  historyMonths: number
  /** Proventos por cota nos últimos 12 meses, pela data ex (o pagamento pode cair depois). */
  events?: { date: string; amount: number }[]
}

/** Executa em paralelo com um teto de chamadas simultâneas, mantendo a ordem da entrada. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index], index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function toIsoTime(raw: unknown): string | null {
  // O Yahoo manda segundos desde 1970; a Brapi, texto ISO.
  const time = typeof raw === 'number' ? raw * 1000 : typeof raw === 'string' ? Date.parse(raw) : NaN
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString() : null
}

function isStale(marketTime: string | null) {
  return marketTime !== null && Date.now() - Date.parse(marketTime) > MAX_QUOTE_AGE_MS
}

function validPrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** Endpoint não oficial do Yahoo: qualquer falha vira 'unavailable', sem lançar erro. */
export async function fetchYahooChart(
  symbol: string,
  options: { range?: string; interval?: string; events?: string; revalidate?: number } = {},
): Promise<MarketResult<YahooChart>> {
  const { range, interval, events, revalidate = DAILY_CACHE_SECONDS } = options
  const params = new URLSearchParams()
  if (range) params.set('range', range)
  if (interval) params.set('interval', interval)
  if (events) params.set('events', events)
  const query = params.size > 0 ? `?${params}` : ''

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}${query}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    )
    if (!response.ok) return { status: 'unavailable' }

    const payload = await response.json()
    const result = payload?.chart?.result?.[0]
    if (!result) return { status: 'unavailable' }

    const timestamps: number[] = Array.isArray(result.timestamp) ? result.timestamp : []
    // close, e não adjclose: o ajustado embutiria proventos e não seria comparável ao índice.
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? []
    const dividends = Object.values<any>(result.events?.dividends ?? {})
      .map((event) => ({ date: Number(event?.date), amount: Number(event?.amount) }))
      .filter((event) => Number.isFinite(event.date) && event.amount > 0)
      .sort((a, b) => a.date - b.date)

    return {
      status: 'ok',
      data: {
        longName: result.meta?.longName ?? null,
        shortName: result.meta?.shortName ?? null,
        price: validPrice(result.meta?.regularMarketPrice),
        marketTime: toIsoTime(result.meta?.regularMarketTime),
        timestamps,
        closes,
        dividends,
      },
    }
  } catch (error) {
    console.error(`[Mercado] Falha ao consultar o Yahoo para ${symbol}:`, error)
    return { status: 'unavailable' }
  }
}

function toBcbDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

/** Datas em YYYY-MM-DD. Devolve a taxa por mês; o BCB publica cada valor no dia 1º do mês de referência. */
export async function fetchSgs(
  serie: number,
  { de, ate }: { de: string; ate: string },
): Promise<MarketResult<MonthlyValues>> {
  const url =
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados?formato=json` +
    `&dataInicial=${toBcbDate(de)}&dataFinal=${toBcbDate(ate)}`

  try {
    const response = await fetch(url, {
      next: { revalidate: DAILY_CACHE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return { status: 'unavailable' }

    const rows = await response.json()
    if (!Array.isArray(rows)) return { status: 'unavailable' }

    const rates: MonthlyValues = {}
    for (const row of rows) {
      const [, month, year] = String(row?.data).split('/')
      const value = Number.parseFloat(row?.valor)
      if (year && month && Number.isFinite(value)) rates[`${year}-${month}`] = value
    }
    return { status: 'ok', data: rates }
  } catch (error) {
    console.error(`[Mercado] Falha ao consultar a série ${serie} do BCB:`, error)
    return { status: 'unavailable' }
  }
}

async function fetchMonthlyCloses(symbol: string): Promise<MarketResult<MonthlyValues>> {
  const chart = await fetchYahooChart(symbol, { range: MONTHLY_RANGE, interval: '1mo' })
  if (chart.status !== 'ok') return chart

  const closes: MonthlyValues = {}
  chart.data.timestamps.forEach((timestamp, index) => {
    const close = chart.data.closes[index]
    if (typeof close === 'number' && close > 0) {
      closes[monthKeyInSaoPaulo(timestamp * 1000)] = close
    }
  })
  return { status: 'ok', data: closes }
}

/** Indicadores que não dependem da carteira. Uma fonte fora do ar afeta só a própria série. */
export async function fetchBenchmarkSeries(
  months: string[],
  now: Date = new Date(),
): Promise<BenchmarkSeries[]> {
  // Janela fixa de 12 meses fechados, a maior possível: todos os intervalos dividem o mesmo cache.
  const yearWindow = closedMonths('12m', now).months
  const period = { de: `${yearWindow[0]}-01`, ate: `${yearWindow[yearWindow.length - 1]}-01` }

  const rateSeries = async (info: { id: BenchmarkId; label: string }, serie: number) => {
    const rates = await fetchSgs(serie, period)
    return rates.status === 'ok'
      ? toBenchmarkSeries(info, accumulateRates(rates.data, months), months)
      : unavailableSeries(info)
  }
  const priceSeries = async (info: { id: BenchmarkId; label: string }, symbol: string) => {
    const closes = await fetchMonthlyCloses(symbol)
    return closes.status === 'ok'
      ? toBenchmarkSeries(info, accumulateCloses(closes.data, months), months)
      : unavailableSeries(info)
  }

  return Promise.all([
    rateSeries({ id: 'cdi', label: 'CDI' }, 4391),
    rateSeries({ id: 'ipca', label: 'IPCA' }, 433),
    priceSeries({ id: 'ibov', label: 'Ibovespa' }, '^BVSP'),
    priceSeries({ id: 'ifix', label: IFIX_LABEL }, 'XFIX11.SA'),
  ])
}

/** Fechamentos da base e dos meses pedidos, sem o mês em andamento. */
export async function fetchTickerCloses(tickers: string[], baseMonth: string, months: string[]) {
  const deadline = Date.now() + TOTAL_BUDGET_MS
  const wanted = [baseMonth, ...months]
  const tickerCloses: Record<string, MonthlyValues> = {}
  const failedTickers: string[] = []

  await mapLimit(tickers, CONCURRENCY, async (ticker) => {
    const closes = Date.now() > deadline
      ? ({ status: 'unavailable' } as const)
      : await fetchMonthlyCloses(`${ticker}.SA`)
    if (closes.status !== 'ok') {
      failedTickers.push(ticker)
      return
    }

    const inWindow: MonthlyValues = {}
    for (const month of wanted) {
      if (closes.data[month] !== undefined) inWindow[month] = closes.data[month]
    }
    tickerCloses[ticker] = inWindow
  })

  return { tickerCloses, failedTickers }
}

export async function fetchYahooQuote(
  ticker: string,
): Promise<(Quote & { name: string | null; classifiableName: string }) | null> {
  const chart = await fetchYahooChart(`${ticker}.SA`, {
    range: '1d',
    interval: '1d',
    revalidate: QUOTE_CACHE_SECONDS,
  })
  if (chart.status !== 'ok' || chart.data.price === null || isStale(chart.data.marketTime)) return null

  const { longName, shortName } = chart.data
  return {
    ticker,
    price: chart.data.price,
    marketTime: chart.data.marketTime,
    name: longName ?? shortName,
    // O nome curto traz marcadores que o longo pode não ter, como 'FII', 'UNT' e 'DRN'.
    classifiableName: [longName, shortName].filter(Boolean).join(' '),
  }
}

/** Cotações válidas de uma resposta da Brapi, já com a hora em ISO e sem preços velhos. */
export function parseBrapiQuotes(payload: any): (Quote & { name: string | null })[] {
  const results: any[] = Array.isArray(payload?.results) ? payload.results : []
  const quotes: (Quote & { name: string | null })[] = []

  for (const item of results) {
    const price = validPrice(item?.regularMarketPrice)
    const marketTime = toIsoTime(item?.regularMarketTime)
    if (typeof item?.symbol === 'string' && price !== null && !isStale(marketTime)) {
      quotes.push({
        ticker: item.symbol.toUpperCase(),
        price,
        marketTime,
        name: item.longName ?? item.shortName ?? null,
      })
    }
  }
  return quotes
}

async function tryBrapi(tickers: string[]): Promise<{ quotes: Quote[]; retry: boolean }> {
  try {
    const response = await fetchBrapiQuote(tickers)
    // Cota esgotada vale para todos: repetir um a um só gastaria mais chamadas recusadas.
    if (response.status === 429) return { quotes: [], retry: false }
    if (!response.ok) return { quotes: [], retry: true }

    const quotes = parseBrapiQuotes(await response.json())
    return { quotes, retry: quotes.length === 0 }
  } catch (error) {
    console.error('[Mercado] Falha ao consultar a Brapi:', error)
    return { quotes: [], retry: true }
  }
}

/**
 * Brapi em lote; se o lote falhar, um a um, porque um código inválido ou o plano contratado
 * podem recusar a chamada inteira. Quem ainda faltar vai para o Yahoo.
 */
export async function fetchQuotes(tickers: string[]): Promise<{ quotes: Quote[]; failed: string[] }> {
  const start = Date.now()
  const found = new Map<string, Quote>()
  const store = ({ ticker, price, marketTime }: Quote) => {
    if (tickers.includes(ticker)) found.set(ticker, { ticker, price, marketTime })
  }

  const batch = await tryBrapi(tickers)
  batch.quotes.forEach(store)

  if (batch.retry && tickers.length > 1) {
    await mapLimit(tickers, CONCURRENCY, async (ticker) => {
      if (Date.now() - start > BRAPI_RETRY_BUDGET_MS) return
      const single = await tryBrapi([ticker])
      single.quotes.forEach(store)
    })
  }

  const missing = tickers.filter((ticker) => !found.has(ticker))
  await mapLimit(missing, CONCURRENCY, async (ticker) => {
    if (Date.now() - start > TOTAL_BUDGET_MS) return
    const quote = await fetchYahooQuote(ticker)
    if (quote) store(quote)
  })

  return {
    quotes: tickers.flatMap((ticker) => found.get(ticker) ?? []),
    failed: tickers.filter((ticker) => !found.has(ticker)),
  }
}

export function unavailableDividend(ticker: string): DividendItem {
  return {
    ticker,
    status: 'unavailable',
    total12m: null,
    monthlyAverage: null,
    lastDate: null,
    eventCount: 0,
    historyMonths: 0,
    events: [],
  }
}

function isoDateInSaoPaulo(timestampSeconds: number) {
  return new Date(timestampSeconds * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function roundAmount(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000
}

async function fetchDividend(ticker: string, now: Date): Promise<DividendItem> {
  // range=1y começa no mês seguinte ao de 12 meses atrás e perderia um pagamento de quem paga todo mês.
  const chart = await fetchYahooChart(`${ticker}.SA`, { range: MONTHLY_RANGE, interval: '1mo', events: 'div' })
  // Resposta sem nenhum pregão não prova que o ativo não paga proventos.
  if (chart.status !== 'ok' || chart.data.timestamps.length === 0) return unavailableDividend(ticker)

  const cutoff = new Date(now)
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  const events = chart.data.dividends.filter((event) => event.date * 1000 >= cutoff.getTime())

  const cutoffMonth = monthKeyInSaoPaulo(cutoff)
  const monthsInWindow = new Set(
    chart.data.timestamps
      .map((timestamp) => monthKeyInSaoPaulo(timestamp * 1000))
      .filter((month) => month >= cutoffMonth),
  ).size
  const historyMonths = Math.min(monthsInWindow, DIVIDEND_WINDOW_MONTHS)

  // Nulo também em 'none': quem lê 0 como valor acaba mostrando 'R$ 0' como se fosse cálculo.
  if (events.length === 0) {
    return { ...unavailableDividend(ticker), status: 'none', historyMonths }
  }

  const total = events.reduce((sum, event) => sum + event.amount, 0)
  return {
    ticker,
    status: 'ok',
    total12m: roundAmount(total),
    monthlyAverage: roundAmount(total / DIVIDEND_WINDOW_MONTHS),
    lastDate: isoDateInSaoPaulo(events[events.length - 1].date),
    eventCount: events.length,
    historyMonths,
    events: events.map((event) => ({ date: isoDateInSaoPaulo(event.date), amount: roundAmount(event.amount) })),
  }
}

export async function fetchDividends(tickers: string[], now: Date = new Date()): Promise<DividendItem[]> {
  const deadline = Date.now() + TOTAL_BUDGET_MS
  return mapLimit(tickers, CONCURRENCY, (ticker) =>
    Date.now() > deadline ? Promise.resolve(unavailableDividend(ticker)) : fetchDividend(ticker, now),
  )
}
