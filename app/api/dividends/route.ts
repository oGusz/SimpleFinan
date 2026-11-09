import { NextResponse } from 'next/server'
import { fetchDividends, unavailableDividend } from '@/lib/market-data'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { parseExchangeTickers } from '@/lib/tickers'

const MAX_TICKERS = 50
const MAX_REQUESTS_PER_HOUR = 120

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims.sub
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const { tickers, overflow } = parseExchangeTickers(searchParams.get('tickers'), MAX_TICKERS)

  const now = new Date()
  if (tickers.length === 0) return NextResponse.json({ asOf: now.toISOString(), items: [] })

  const allowed = await consumeRateLimit(rateLimitKey('dividends', userId), MAX_REQUESTS_PER_HOUR, 3600)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const items = await fetchDividends(tickers, now)
  return NextResponse.json({
    asOf: now.toISOString(),
    items: [...items, ...overflow.map(unavailableDividend)],
  })
}
