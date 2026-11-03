import { NextResponse } from 'next/server'
import { fetchBrapiQuote } from '@/lib/brapi'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { normalizeTicker } from '@/lib/tickers'

const MAX_TICKERS = 50
const MAX_REQUESTS_PER_HOUR = 300

export async function GET(request: Request) {
  // Sem esta checagem, qualquer pessoa consumiria a cota do BRAPI_TOKEN.
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims.sub
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tickers = (searchParams.get('tickers') ?? '')
    .split(',')
    .map(normalizeTicker)
    .filter((ticker): ticker is string => ticker !== null)
    .slice(0, MAX_TICKERS)

  if (tickers.length === 0) {
    return NextResponse.json([])
  }

  // Com login, ainda daria para esgotar a cota pedindo um ativo diferente a cada vez.
  const allowed = await consumeRateLimit(rateLimitKey('quotes', userId), MAX_REQUESTS_PER_HOUR, 3600)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  try {
    const response = await fetchBrapiQuote(tickers)

    if (!response.ok) {
      return NextResponse.json([])
    }

    const data = await response.json()

    // Formata o retorno para o padrão [{ ticker: 'MXRF11', price: 10.25 }]
    const formattedQuotes = (data.results || []).map((item: any) => ({
      ticker: item.symbol,
      price: item.regularMarketPrice || 0,
    }))

    return NextResponse.json(formattedQuotes)
  } catch (error) {
    console.error('Erro ao buscar cotações:', error)
    return NextResponse.json([])
  }
}
