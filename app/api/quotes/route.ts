import { NextResponse } from 'next/server'
import { fetchQuotes } from '@/lib/market-data'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { parseExchangeTickers } from '@/lib/tickers'

const MAX_TICKERS = 50
const MAX_REQUESTS_PER_HOUR = 300

export async function GET(request: Request) {
  // Sem esta checagem, qualquer pessoa consumiria a cota do BRAPI_TOKEN.
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims.sub
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const { tickers, overflow } = parseExchangeTickers(searchParams.get('tickers'), MAX_TICKERS)

  if (tickers.length === 0) {
    return NextResponse.json({ quotes: [], failed: [], asOf: null })
  }

  // Com login, ainda daria para esgotar a cota pedindo um ativo diferente a cada vez.
  const allowed = await consumeRateLimit(rateLimitKey('quotes', userId), MAX_REQUESTS_PER_HOUR, 3600)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { quotes, failed: notFound } = await fetchQuotes(tickers)
  const failed = [...notFound, ...overflow]

  // 502, e não uma lista vazia com 200: quem chama precisa saber que o preço ficou velho.
  if (quotes.length === 0) {
    return NextResponse.json({ quotes: [], failed, asOf: null }, { status: 502 })
  }

  return NextResponse.json({ quotes, failed, asOf: new Date().toISOString() })
}
