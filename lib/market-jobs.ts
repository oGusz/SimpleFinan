import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { announcementsEmail, priceAlertEmail } from '@/lib/email/templates'
import { getAppUrl, sendEmail } from '@/lib/email/send'
import { addDays, fetchAllPages, isMissingTableError } from '@/lib/finance-insights'
import { fetchQuotes } from '@/lib/market-data'
import { NEWS_CATEGORY_LABELS } from '@/lib/news'
import { hasPremiumAccess } from '@/lib/plans'
import { buildHoldings, type Holdings } from '@/lib/portfolio-history'
import { sendPushToUser, type PushMessage } from '@/lib/push'
import { isExchangeTicker } from '@/lib/tickers'

const QUOTE_BATCH = 50
const CHUNK = 200
/** Mais que isso num dia vira ruído: o aviso lista os primeiros e manda para a aba de notícias. */
const MAX_ANNOUNCEMENTS_PER_MESSAGE = 5

type Admin = SupabaseClient

interface InvestmentRow {
  user_id: string
  source: string
  ticker: string
  quantity: number
}

interface AlertRow {
  id: string
  user_id: string
  ticker: string
  direction: 'above' | 'below'
  target: number
}

export interface Channels {
  email: boolean
  push: boolean
}

export interface MarketJobsResult {
  snapshots: number | 'sem_tabela'
  priceAlerts: number | 'sem_tabela'
  announcementAlerts: number
  missingQuotes: number
}

function chunk<T>(items: T[], size = CHUNK) {
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size))
  return chunks
}

function dayInSaoPaulo(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

async function loadQuotes(tickers: string[]) {
  const prices = new Map<string, number>()
  let latest: string | null = null
  for (const batch of chunk(tickers, QUOTE_BATCH)) {
    const { quotes } = await fetchQuotes(batch)
    for (const quote of quotes) {
      prices.set(quote.ticker, quote.price)
      if (quote.marketTime && (!latest || quote.marketTime > latest)) latest = quote.marketTime
    }
  }
  return { prices, latest }
}

async function premiumUsers(admin: Admin, userIds: string[]) {
  const premium = new Set<string>()
  for (const ids of chunk(userIds)) {
    const { data, error } = await admin
      .from('subscriptions')
      .select('user_id, plan, status, current_period_end')
      .in('user_id', ids)
    if (error) throw error
    for (const row of data ?? []) if (hasPremiumAccess(row)) premium.add(row.user_id)
  }
  return premium
}

/** Push quando há aparelho; senão, e-mail. Retorna se alguém foi avisado. */
async function deliver(
  admin: Admin,
  userId: string,
  channels: Channels,
  push: PushMessage,
  email: { subject: string; html: string },
) {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data.user) return false
  const user = data.user
  if (channels.push && (await sendPushToUser(admin, user, push)) > 0) return true
  if (channels.email && user.email) {
    await sendEmail(user.email, email)
    return true
  }
  return false
}

async function recordSnapshots(admin: Admin, day: string, investments: InvestmentRow[], prices: Map<string, number>) {
  const groups = new Map<string, InvestmentRow[]>()
  for (const row of investments) {
    const key = `${row.user_id}|${row.source}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }

  // A última foto de cada carteira guarda o preço de quem ficou sem cotação hoje.
  const previous = new Map<string, Holdings>()
  const { data: recent, error: recentError } = await admin
    .from('portfolio_snapshots')
    .select('user_id, source, day, holdings')
    .lt('day', day)
    .gte('day', addDays(day, -14))
    .order('day', { ascending: false })
  if (recentError) {
    if (isMissingTableError(recentError)) return 'sem_tabela' as const
    throw recentError
  }
  for (const row of recent ?? []) {
    const key = `${row.user_id}|${row.source}`
    if (!previous.has(key)) previous.set(key, row.holdings as Holdings)
  }

  const rows = []
  for (const [key, positions] of groups) {
    const [userId, source] = key.split('|')
    const { holdings, value } = buildHoldings(
      positions.map((row) => ({ ticker: row.ticker, quantity: Number(row.quantity) })),
      prices,
      previous.get(key) ?? null,
    )
    if (Object.keys(holdings).length === 0) continue
    rows.push({ user_id: userId, source, day, value, holdings })
  }

  for (const batch of chunk(rows, 500)) {
    const { error } = await admin.from('portfolio_snapshots').upsert(batch, { onConflict: 'user_id,source,day' })
    if (error) {
      if (isMissingTableError(error)) return 'sem_tabela' as const
      throw error
    }
  }
  return rows.length
}

async function checkPriceAlerts(admin: Admin, alerts: AlertRow[], prices: Map<string, number>, channels: Channels) {
  const hits = alerts.filter((alert) => {
    const price = prices.get(alert.ticker)
    if (!price) return false
    return alert.direction === 'above' ? price >= alert.target : price <= alert.target
  })
  if (hits.length === 0) return 0

  const premium = await premiumUsers(admin, [...new Set(hits.map((alert) => alert.user_id))])
  const appUrl = getAppUrl()
  let delivered = 0
  for (const alert of hits) {
    if (!premium.has(alert.user_id)) continue
    const price = prices.get(alert.ticker) as number
    // Desliga antes de avisar: se o envio falhar, o pior caso é não avisar, nunca avisar todo dia.
    const { data: claimed, error } = await admin
      .from('price_alerts')
      .update({ triggered_at: new Date().toISOString(), triggered_price: price })
      .eq('id', alert.id)
      .is('triggered_at', null)
      .select('id')
    if (error || !claimed?.length) continue

    const direction = alert.direction === 'above' ? 'acima de' : 'abaixo de'
    const priceText = price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    const targetText = Number(alert.target).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    try {
      const ok = await deliver(
        admin,
        alert.user_id,
        channels,
        {
          title: `${alert.ticker}: ${priceText}`,
          body: `Seu alerta ${direction} ${targetText} foi atingido no último fechamento.`,
          data: { url: '/alertas' },
        },
        priceAlertEmail({ ticker: alert.ticker, direction: alert.direction, target: Number(alert.target), price }, appUrl),
      )
      if (ok) delivered += 1
    } catch (sendError) {
      console.error('[Alertas] Falha ao avisar alerta de preço:', sendError)
    }
  }
  return delivered
}

async function notifyAnnouncements(admin: Admin, today: string, investments: InvestmentRow[], channels: Channels) {
  // Desde ontem: a rotina roda uma vez por dia, e o log evita avisar o mesmo comunicado duas vezes.
  const { data: fresh, error } = await admin
    .from('market_announcements')
    .select('protocol, cnpj, category, subject, url')
    .gte('delivered_on', addDays(today, -1))
  if (error) {
    if (isMissingTableError(error)) return 0
    throw error
  }
  if (!fresh?.length) return 0

  const { data: tickerRows, error: tickerError } = await admin
    .from('market_tickers')
    .select('ticker, cnpj')
    .in('cnpj', [...new Set(fresh.map((item) => item.cnpj))])
  if (tickerError) throw tickerError
  const cnpjByTicker = new Map((tickerRows ?? []).map((row) => [row.ticker, row.cnpj]))

  const holdersByCnpj = new Map<string, Map<string, Set<string>>>()
  for (const row of investments) {
    const cnpj = cnpjByTicker.get(row.ticker)
    if (!cnpj || !(Number(row.quantity) > 0)) continue
    const users = holdersByCnpj.get(cnpj) ?? new Map<string, Set<string>>()
    users.set(row.user_id, (users.get(row.user_id) ?? new Set()).add(row.ticker))
    holdersByCnpj.set(cnpj, users)
  }

  const perUser = new Map<string, { protocol: string; tickers: string[]; category: string; subject: string; url: string }[]>()
  for (const item of fresh) {
    for (const [userId, tickers] of holdersByCnpj.get(item.cnpj) ?? []) {
      perUser.set(userId, [
        ...(perUser.get(userId) ?? []),
        { ...item, tickers: [...tickers].sort(), category: NEWS_CATEGORY_LABELS[item.category] ?? item.category },
      ])
    }
  }
  if (perUser.size === 0) return 0

  const premium = await premiumUsers(admin, [...perUser.keys()])
  const appUrl = getAppUrl()
  let delivered = 0
  for (const [userId, items] of perUser) {
    if (!premium.has(userId)) continue

    const { data: logged } = await admin
      .from('notification_log')
      .select('ref')
      .eq('user_id', userId)
      .eq('kind', 'announcement')
      .in('ref', items.map((item) => item.protocol))
    const already = new Set((logged ?? []).map((row) => row.ref))
    const pending = items.filter((item) => !already.has(item.protocol))
    if (pending.length === 0) continue

    try {
      const { data: userData } = await admin.auth.admin.getUserById(userId)
      if (userData.user?.user_metadata?.alert_announcements === false) continue

      const shown = pending.slice(0, MAX_ANNOUNCEMENTS_PER_MESSAGE)
      const first = shown[0]
      const ok = await deliver(
        admin,
        userId,
        channels,
        {
          title: pending.length === 1 ? `${first.tickers.join(', ')}: ${first.category}` : `${pending.length} novos comunicados`,
          body: pending.length === 1 ? first.subject.slice(0, 160) : shown.map((item) => item.tickers[0]).join(', '),
          data: { url: '/noticias' },
        },
        announcementsEmail(shown, appUrl),
      )
      if (!ok) continue
      const { error: logError } = await admin
        .from('notification_log')
        .upsert(pending.map((item) => ({ user_id: userId, kind: 'announcement', ref: item.protocol })))
      if (logError) console.error('[Alertas] Falha ao registrar comunicados avisados:', logError)
      delivered += 1
    } catch (sendError) {
      console.error('[Alertas] Falha ao avisar comunicados:', sendError)
    }
  }
  return delivered
}

/**
 * Tarefas de mercado da rotina diária, com uma única busca de cotações: foto da carteira de todos
 * (para o histórico de quem assinar depois), alertas de preço e avisos de comunicados para Premium.
 */
export async function runMarketJobs(admin: Admin, today: string, channels: Channels): Promise<MarketJobsResult> {
  const investments = await fetchAllPages<InvestmentRow>((from, to) =>
    admin
      .from('investments')
      .select('user_id, source, ticker, quantity')
      .order('user_id', { ascending: true })
      .order('ticker', { ascending: true })
      .range(from, to),
  )
  const exchange = investments.filter((row) => isExchangeTicker(row.ticker))

  let alerts: AlertRow[] | 'sem_tabela' = []
  const { data: alertRows, error: alertError } = await admin
    .from('price_alerts')
    .select('id, user_id, ticker, direction, target')
    .is('triggered_at', null)
  if (alertError) {
    if (!isMissingTableError(alertError)) throw alertError
    alerts = 'sem_tabela'
  } else {
    alerts = (alertRows ?? []) as AlertRow[]
  }

  const tickers = [...new Set([...exchange.map((row) => row.ticker), ...(alerts === 'sem_tabela' ? [] : alerts.map((alert) => alert.ticker))])]
  const { prices, latest } = await loadQuotes(tickers)

  // O dia da foto é o do pregão da cotação, não o da rotina: às 8h, o preço é o fechamento anterior.
  // Sem nenhuma cotação, não há foto: gravaria preços velhos como se fossem de hoje.
  let snapshots: MarketJobsResult['snapshots'] = 0
  if (latest) {
    try {
      snapshots = await recordSnapshots(admin, dayInSaoPaulo(latest), exchange, prices)
    } catch (error) {
      console.error('[Mercado] Falha ao gravar o histórico das carteiras:', error)
    }
  }

  let priceAlerts: MarketJobsResult['priceAlerts'] = alerts === 'sem_tabela' ? 'sem_tabela' : 0
  if (alerts !== 'sem_tabela' && (channels.email || channels.push)) {
    try {
      priceAlerts = await checkPriceAlerts(admin, alerts, prices, channels)
    } catch (error) {
      console.error('[Mercado] Falha ao conferir alertas de preço:', error)
    }
  }

  let announcementAlerts = 0
  if (channels.email || channels.push) {
    try {
      announcementAlerts = await notifyAnnouncements(admin, today, exchange, channels)
    } catch (error) {
      console.error('[Mercado] Falha ao avisar comunicados:', error)
    }
  }

  return { snapshots, priceAlerts, announcementAlerts, missingQuotes: tickers.filter((ticker) => !prices.has(ticker)).length }
}
