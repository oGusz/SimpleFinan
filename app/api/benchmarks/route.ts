import { NextResponse } from 'next/server'
import { type BenchmarkRange, type BenchmarksResponse, closedMonths } from '@/lib/benchmarks'
import { fetchBenchmarkSeries, fetchTickerCloses } from '@/lib/market-data'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { parseExchangeTickers } from '@/lib/tickers'

const MAX_TICKERS = 50
const MAX_REQUESTS_PER_HOUR = 60
const RANGES: BenchmarkRange[] = ['6m', '12m', 'ytd']

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims.sub
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const range = (searchParams.get('range') ?? '12m') as BenchmarkRange
  if (!RANGES.includes(range)) return NextResponse.json({ error: 'Invalid range' }, { status: 400 })

  const allowed = await consumeRateLimit(rateLimitKey('benchmarks', userId), MAX_REQUESTS_PER_HOUR, 3600)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { tickers, overflow } = parseExchangeTickers(searchParams.get('tickers'), MAX_TICKERS)
  const now = new Date()
  const { months, baseMonth } = closedMonths(range, now)
  const [series, { tickerCloses, failedTickers }] = await Promise.all([
    fetchBenchmarkSeries(months, now),
    fetchTickerCloses(tickers, baseMonth, months),
  ])

  const body: BenchmarksResponse = {
    asOf: now.toISOString(),
    range,
    months,
    series,
    tickerCloses,
    failedTickers: [...failedTickers, ...overflow],
  }
  return NextResponse.json(body)
}
