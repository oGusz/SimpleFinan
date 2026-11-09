import { NextResponse } from 'next/server'

import { todayInBrazil } from '@/lib/finance-insights'
import { FREE_NEWS_PREVIEW, type NewsItem, type NewsResponse } from '@/lib/news'
import { userHasPremium } from '@/lib/pluggy/server'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { parseExchangeTickers } from '@/lib/tickers'

const MAX_TICKERS = 50
const MAX_REQUESTS_PER_HOUR = 300
const MINE_DAYS = 90
const MARKET_DAYS = 7
const MAX_ITEMS = 60

const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01'])

function isoDaysAgo(days: number) {
  const date = new Date(`${todayInBrazil()}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims.sub
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await consumeRateLimit(rateLimitKey('news', userId), MAX_REQUESTS_PER_HOUR, 3600)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') === 'market' ? 'market' : 'mine'
  const { tickers } = parseExchangeTickers(searchParams.get('tickers'), MAX_TICKERS)

  let premium: boolean
  try {
    premium = await userHasPremium(userId)
  } catch (error) {
    console.error('[News] Falha ao ler o plano:', error)
    return NextResponse.json({ error: 'Plano indisponível' }, { status: 502 })
  }

  const unavailable = (): NextResponse<NewsResponse> =>
    NextResponse.json({ status: 'unavailable', premium, items: [], locked: 0 })

  let cnpjToTickers = new Map<string, string[]>()
  let query = supabase
    .from('market_announcements')
    .select('protocol, cnpj, company, category, subject, delivered_on, url')
    .order('delivered_on', { ascending: false })
    .order('protocol', { ascending: false })
    .limit(MAX_ITEMS)

  if (scope === 'mine') {
    if (tickers.length === 0) return NextResponse.json({ status: 'ok', premium, items: [], locked: 0 } satisfies NewsResponse)
    const { data: rows, error } = await supabase.from('market_tickers').select('ticker, cnpj').in('ticker', tickers)
    if (error) {
      if (MISSING_TABLE_CODES.has(error.code ?? '')) return unavailable()
      console.error('[News] Falha ao ler códigos:', error.code)
      return NextResponse.json({ error: 'Falha ao carregar' }, { status: 502 })
    }
    for (const row of rows ?? []) cnpjToTickers.set(row.cnpj, [...(cnpjToTickers.get(row.cnpj) ?? []), row.ticker])
    if (cnpjToTickers.size === 0) return NextResponse.json({ status: 'ok', premium, items: [], locked: 0 } satisfies NewsResponse)
    query = query.in('cnpj', [...cnpjToTickers.keys()]).gte('delivered_on', isoDaysAgo(MINE_DAYS))
  } else {
    query = query.eq('category', 'Fato Relevante').gte('delivered_on', isoDaysAgo(MARKET_DAYS))
  }

  const { data, error } = await query
  if (error) {
    if (MISSING_TABLE_CODES.has(error.code ?? '')) return unavailable()
    console.error('[News] Falha ao ler comunicados:', error.code)
    return NextResponse.json({ error: 'Falha ao carregar' }, { status: 502 })
  }

  const announcements = data ?? []
  if (scope === 'market' && announcements.length > 0) {
    // No mercado, o código vem depois: só das empresas que aparecem na lista.
    const { data: rows } = await supabase
      .from('market_tickers')
      .select('ticker, cnpj')
      .in('cnpj', [...new Set(announcements.map((item) => item.cnpj))])
    cnpjToTickers = new Map()
    for (const row of rows ?? []) cnpjToTickers.set(row.cnpj, [...(cnpjToTickers.get(row.cnpj) ?? []), row.ticker])
  }

  const items: NewsItem[] = announcements.map(({ cnpj, ...item }) => ({
    ...item,
    tickers: (cnpjToTickers.get(cnpj) ?? []).sort(),
  }))
  const visible = premium ? items : items.slice(0, FREE_NEWS_PREVIEW)

  return NextResponse.json({
    status: 'ok',
    premium,
    items: visible,
    locked: items.length - visible.length,
  } satisfies NewsResponse)
}
