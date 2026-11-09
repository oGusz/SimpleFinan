import { NextResponse } from 'next/server'

import { isMissingTableError } from '@/lib/finance-insights'
import { MIN_HISTORY_DAYS, type HistoryResponse } from '@/lib/history'
import { fetchDailyCloses, fetchSgsDaily } from '@/lib/market-data'
import { accumulateDailyRates, closesToSeries, twrSeries, type Holdings } from '@/lib/portfolio-history'
import { userHasPremium } from '@/lib/pluggy/server'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

const MAX_REQUESTS_PER_HOUR = 120
// Dois anos de pregões cabem com folga.
const MAX_SNAPSHOTS = 800
const CDI_DAILY_SERIE = 12

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims.sub
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const allowed = await consumeRateLimit(rateLimitKey('portfolio-history', userId), MAX_REQUESTS_PER_HOUR, 3600)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const source = new URL(request.url).searchParams.get('source') === 'open_finance' ? 'open_finance' : 'manual'

  let premium: boolean
  try {
    premium = await userHasPremium(userId)
  } catch (error) {
    console.error('[Histórico] Falha ao ler o plano:', error)
    return NextResponse.json({ error: 'Plano indisponível' }, { status: 502 })
  }

  // O RLS já restringe às fotos do próprio usuário; o filtro deixa a consulta explícita.
  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('day, value, holdings')
    .eq('user_id', userId)
    .eq('source', source)
    .order('day', { ascending: false })
    .limit(MAX_SNAPSHOTS)

  const empty: HistoryResponse = { status: 'ok', premium, since: null, days: 0, lastValue: null, points: [], cdi: null, ibov: null }
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ ...empty, status: 'unavailable' } satisfies HistoryResponse)
    console.error('[Histórico] Falha ao ler o histórico:', error.code)
    return NextResponse.json({ error: 'Falha ao carregar' }, { status: 502 })
  }

  const snapshots = (data ?? [])
    .map((row) => ({ day: row.day as string, value: Number(row.value), holdings: (row.holdings ?? {}) as Holdings }))
    .reverse()
  if (snapshots.length === 0) return NextResponse.json(empty)

  const base = {
    ...empty,
    since: snapshots[0].day,
    days: snapshots.length,
    lastValue: snapshots[snapshots.length - 1].value,
  }
  // Quem não é Premium sabe que o histórico existe e desde quando, mas não vê a comparação.
  if (!premium || snapshots.length < MIN_HISTORY_DAYS) return NextResponse.json(base satisfies HistoryResponse)

  const points = twrSeries(snapshots)
  const days = points.map((point) => point.day)
  const [cdi, ibov] = await Promise.all([
    fetchSgsDaily(CDI_DAILY_SERIE, { de: days[0], ate: days[days.length - 1] }),
    fetchDailyCloses('^BVSP', days[0]),
  ])

  return NextResponse.json({
    ...base,
    points,
    cdi: cdi.status === 'ok' ? accumulateDailyRates(cdi.data, days) : null,
    ibov: ibov.status === 'ok' ? closesToSeries(ibov.data, days) : null,
  } satisfies HistoryResponse)
}
