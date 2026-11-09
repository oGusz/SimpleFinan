import { NextResponse } from 'next/server'

import { addDays, isMissingTableError, todayInBrazil } from '@/lib/finance-insights'
import { fetchDailyCloses, fetchDividends, fetchSgsDaily } from '@/lib/market-data'
import { type Holdings } from '@/lib/portfolio-history'
import { userHasPremium } from '@/lib/pluggy/server'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { buildMonthlyReport, monthBounds } from '@/lib/report'
import { createClient } from '@/lib/supabase/server'
import { isExchangeTicker } from '@/lib/tickers'

const MAX_REQUESTS_PER_HOUR = 60
// Os proventos vêm de uma janela de 12 meses: relatório mais antigo ficaria sem eles.
const MAX_MONTHS_BACK = 12

function monthsBetween(from: string, to: string) {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const userId = auth?.claims.sub
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = todayInBrazil()
  const params = new URL(request.url).searchParams
  const month = params.get('month') ?? today.slice(0, 7)
  const source = params.get('source') === 'open_finance' ? 'open_finance' : 'manual'
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'Mês inválido' }, { status: 400 })
  const back = monthsBetween(month, today.slice(0, 7))
  if (back < 0 || back > MAX_MONTHS_BACK) return NextResponse.json({ error: 'Mês fora do período disponível' }, { status: 400 })

  const allowed = await consumeRateLimit(rateLimitKey('report', userId), MAX_REQUESTS_PER_HOUR, 3600)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  let premium: boolean
  try {
    premium = await userHasPremium(userId)
  } catch {
    return NextResponse.json({ error: 'Plano indisponível' }, { status: 502 })
  }
  if (!premium) return NextResponse.json({ premium: false })

  const { start, end } = monthBounds(month)
  const [billsResult, goalsResult, snapshotsResult, investmentsResult] = await Promise.all([
    supabase
      .from('bills')
      .select('amount, status, category')
      .eq('user_id', userId)
      .gte('due_date', start)
      .lte('due_date', `${end}T23:59:59`),
    supabase.from('goals').select('title, current_amount, target_amount').eq('user_id', userId),
    supabase
      .from('portfolio_snapshots')
      .select('day, value, holdings')
      .eq('user_id', userId)
      .eq('source', source)
      .gte('day', addDays(start, -14))
      .lte('day', end)
      .order('day', { ascending: true }),
    supabase.from('investments').select('ticker, quantity').eq('user_id', userId).eq('source', source),
  ])
  if (billsResult.error || goalsResult.error || investmentsResult.error) {
    console.error('[Relatório] Falha ao ler dados do mês')
    return NextResponse.json({ error: 'Falha ao carregar' }, { status: 502 })
  }
  // Sem a tabela de histórico, o relatório sai sem a parte da carteira.
  if (snapshotsResult.error && !isMissingTableError(snapshotsResult.error)) {
    return NextResponse.json({ error: 'Falha ao carregar' }, { status: 502 })
  }

  const snapshots = (snapshotsResult.data ?? []).map((row) => ({
    day: row.day as string,
    value: Number(row.value),
    holdings: (row.holdings ?? {}) as Holdings,
  }))
  const currentQuantities = new Map(
    (investmentsResult.data ?? [])
      .filter((row) => isExchangeTicker(row.ticker))
      .map((row) => [row.ticker as string, Number(row.quantity)]),
  )
  const tickers = [...new Set([...currentQuantities.keys(), ...snapshots.flatMap((snapshot) => Object.keys(snapshot.holdings))])].slice(0, 50)

  const [dividends, cdi, ibov] = await Promise.all([
    tickers.length > 0 ? fetchDividends(tickers) : Promise.resolve([]),
    snapshots.length >= 2 ? fetchSgsDaily(12, { de: snapshots[0].day, ate: end }) : Promise.resolve(null),
    snapshots.length >= 2 ? fetchDailyCloses('^BVSP', snapshots[0].day) : Promise.resolve(null),
  ])

  const report = buildMonthlyReport({
    month,
    today,
    bills: billsResult.data ?? [],
    snapshots,
    dividendEvents: new Map(dividends.map((item) => [item.ticker, item.events ?? []])),
    currentQuantities,
    goals: goalsResult.data ?? [],
    cdiRates: cdi?.status === 'ok' ? cdi.data : null,
    ibovCloses: ibov?.status === 'ok' ? ibov.data : null,
  })
  return NextResponse.json({ premium: true, report })
}
