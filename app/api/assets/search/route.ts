import { NextResponse } from 'next/server'
import {
  type AssetCategory,
  classifyFromBrapi,
  POPULAR_ASSETS,
  searchPopularAssets,
} from '@/lib/asset-classification'
import { fetchBrapiAvailable, fetchBrapiList } from '@/lib/brapi'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { isExchangeTicker } from '@/lib/tickers'

const MAX_QUERY_LENGTH = 40
const MIN_REMOTE_QUERY_LENGTH = 2
const MAX_RESULTS = 8
const MAX_REQUESTS_PER_HOUR = 300

interface SearchResult {
  ticker: string
  name: string
  category: AssetCategory
}

// O final F é o mercado fracionário: é o mesmo ativo do código sem o F.
function isSuggestible(ticker: string) {
  return isExchangeTicker(ticker) && !ticker.endsWith('F')
}

function findPopular(ticker: string) {
  return POPULAR_ASSETS.find((asset) => asset.ticker === ticker)
}

async function searchRemote(query: string): Promise<SearchResult[]> {
  const list = await fetchBrapiList(query)
  if (list && list.length > 0) {
    return list
      .filter((item) => isSuggestible(item.stock))
      .map((item) => ({
        ticker: item.stock,
        name: findPopular(item.stock)?.name ?? item.name ?? item.stock,
        category: classifyFromBrapi(item),
      }))
  }

  const available = await fetchBrapiAvailable(query)
  return (available ?? []).filter(isSuggestible).map((ticker) => ({
    ticker,
    name: findPopular(ticker)?.name ?? ticker,
    category: findPopular(ticker)?.category ?? 'Não classificado',
  }))
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims.sub
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH)
  if (!query) return NextResponse.json({ results: [] })

  const allowed = await consumeRateLimit(rateLimitKey('asset-search', userId), MAX_REQUESTS_PER_HOUR, 3600)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const remote = query.length >= MIN_REMOTE_QUERY_LENGTH ? await searchRemote(query) : []

  // A lista local completa a resposta e cobre a queda da Brapi; quem começa com o termo vem primeiro.
  const upperQuery = query.toUpperCase()
  const byTicker = new Map<string, SearchResult>()
  for (const { ticker, name, category } of [...remote, ...searchPopularAssets(query)]) {
    if (!byTicker.has(ticker)) byTicker.set(ticker, { ticker, name, category })
  }
  const results = [...byTicker.values()]
    .sort((a, b) => Number(b.ticker.startsWith(upperQuery)) - Number(a.ticker.startsWith(upperQuery)))
    .slice(0, MAX_RESULTS)

  return NextResponse.json({ results })
}
