/**
 * GET /api/cron/daily — chamado uma vez por dia pela Vercel (vercel.json).
 * Com CRON_SECRET no ambiente, a Vercel envia `Authorization: Bearer <CRON_SECRET>`.
 * Cria as contas recorrentes do período, envia lembretes de vencimento (contas e faturas),
 * avisa do fim do teste grátis e, no dia 1º, envia o resumo do mês anterior.
 * Também tenta de novo as importações de banco que falharam, mesmo sem e-mail nem push.
 * Por fim, confere conquistas e desafio do mês de quem usa o app e avisa por push o que for novo.
 */

import { NextRequest, NextResponse } from 'next/server'

// Baixar e gravar os comunicados da CVM leva alguns segundos além dos lembretes.
export const maxDuration = 60
import { createAdminClient } from '@/lib/supabase/admin'
import { secretsMatch } from '@/lib/secure-compare'
import {
  addDays,
  fetchAllPages,
  findNextBillPayments,
  getInvoiceStatus,
  isMissingColumnError,
  isMissingTableError,
  isSettledBill,
  monthsInRange,
  previousMonthRange,
  todayInBrazil,
} from '@/lib/finance-insights'
import { billReminderEmail, monthlySummaryEmail, trialEndingEmail } from '@/lib/email/templates'
import { getAppUrl, isEmailConfigured, sendEmail } from '@/lib/email/send'
import { hasPremiumAccess } from '@/lib/plans'
import { retryFailedImports } from '@/lib/pluggy/server'
import { syncCvmAnnouncements, type CvmSyncResult } from '@/lib/cvm-sync'
import { runGamificationJobs, type GamificationJobsResult } from '@/lib/gamification-jobs'
import { runMarketJobs, type MarketJobsResult } from '@/lib/market-jobs'
import { isPushEnabled, sendPushToUser } from '@/lib/push'
import { buildRecurringRows, monthKey, type BillSkip, type RecurringSourceRow } from '@/lib/recurring-bills'

const REMINDER_DAYS = 3
const TRIAL_NOTICE_DAYS = 3
// Janela que alcança a fatura seguinte à que vence nos próximos dias.
const NEXT_INVOICE_WINDOW_DAYS = 62
const CHUNK_SIZE = 200
const INSERT_BATCH = 500
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

type Admin = ReturnType<typeof createAdminClient>

function groupByUser<T extends { user_id: string }>(rows: T[]) {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(row.user_id)
    if (group) group.push(row)
    else groups.set(row.user_id, [row])
  }
  return groups
}

function chunk<T>(items: T[], size = CHUNK_SIZE) {
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size))
  return chunks
}

/** Quem desligou os lembretes por e-mail ou não tem e-mail fica com email nulo. */
async function getRecipient(admin: Admin, userId: string) {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error) throw error
  const user = data.user
  const email = user?.user_metadata?.email_reminders === false ? null : (user?.email ?? null)
  return { user, email }
}

async function getAlreadySent(admin: Admin, kind: string, refs: string[]) {
  const sent = new Set<string>()
  for (const refsChunk of chunk(refs)) {
    const rows = await fetchAllPages<{ user_id: string; ref: string }>((from, to) =>
      admin
        .from('notification_log')
        .select('user_id, ref')
        .eq('kind', kind)
        .in('ref', refsChunk)
        .order('user_id', { ascending: true })
        .order('ref', { ascending: true })
        .range(from, to),
    )
    for (const row of rows) sent.add(`${row.user_id}:${row.ref}`)
  }
  return sent
}

/** O envio já aconteceu: a falha aqui só é registrada, ao custo de repetir o aviso amanhã. */
async function logSent(admin: Admin, rows: { user_id: string; kind: string; ref: string }[]) {
  const { error } = await admin.from('notification_log').upsert(rows)
  if (error) console.error('[Cron] Falha ao registrar envio:', error)
}

/** Sem isto, quem não abre o app no mês não recebe o lembrete, e é quem mais depende dele. */
async function generateRecurringBills(admin: Admin, today: string) {
  const recurring = await fetchAllPages<RecurringSourceRow & { user_id: string }>((from, to) =>
    admin
      .from('bills')
      .select('user_id, title, amount, due_date, category')
      .eq('is_recurring', true)
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (recurring.length === 0) return 0

  const byUser = groupByUser(recurring)
  const currentMonth = today.slice(0, 7)
  let generated = 0

  for (const { year, month } of monthsInRange(today, addDays(today, REMINDER_DAYS))) {
    const target = monthKey(year, month)
    const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)

    const existing = await fetchAllPages<{ user_id: string; title: string | null }>((from, to) =>
      admin
        .from('bills')
        .select('user_id, title')
        .gte('due_date', `${target}-01`)
        .lte('due_date', `${lastDay}T23:59:59`)
        .order('id', { ascending: true })
        .range(from, to),
    )
    const existingByUser = groupByUser(existing)

    let skips: (BillSkip & { user_id: string })[] = []
    try {
      skips = await fetchAllPages((from, to) =>
        admin
          .from('bill_skips')
          .select('user_id, title_key, month')
          .eq('month', target)
          .order('id', { ascending: true })
          .range(from, to),
      )
    } catch (error) {
      if (!isMissingTableError(error)) throw error
    }
    const skipsByUser = groupByUser(skips)

    const rows = [...byUser.entries()].flatMap(([userId, recurringRows]) =>
      buildRecurringRows({
        recurringRows,
        existingBills: existingByUser.get(userId) ?? [],
        skips: skipsByUser.get(userId) ?? [],
        year,
        month,
        currentMonth,
      }).map((row) => ({ ...row, user_id: userId })),
    )

    for (const batch of chunk(rows, INSERT_BATCH)) {
      const { error } = await admin.from('bills').insert(batch)
      if (error) {
        console.error('[Cron] Falha ao criar contas recorrentes:', error)
        continue
      }
      generated += batch.length
    }
  }
  return generated
}

interface ReminderItem {
  user_id: string
  title?: string
  amount: number
  due_date: string
  kind: 'bill_due' | 'card_bill_due'
  ref: string
}

async function collectBillItems(admin: Admin, today: string): Promise<ReminderItem[]> {
  const bills = await fetchAllPages<{
    id: string
    user_id: string
    title?: string
    amount: number
    due_date: string
    status: string
  }>((from, to) =>
    admin
      .from('bills')
      .select('id, user_id, title, amount, due_date, status')
      .neq('status', 'paid')
      .gte('due_date', today)
      .lte('due_date', `${addDays(today, REMINDER_DAYS)}T23:59:59`)
      .order('id', { ascending: true })
      .range(from, to),
  )

  return bills
    .filter((bill) => !isSettledBill(bill.status))
    .map((bill) => ({
      user_id: bill.user_id,
      title: bill.title,
      amount: bill.amount,
      due_date: bill.due_date,
      kind: 'bill_due',
      ref: `${bill.id}:${bill.due_date.slice(0, 10)}`,
    }))
}

interface InvoiceRow {
  user_id: string
  pluggy_bill_id: string
  pluggy_account_id: string
  account_name: string | null
  due_date: string
  total_amount: number
  payments_total?: number | string | null
}

async function loadUpcomingInvoices(admin: Admin, today: string) {
  const baseColumns = 'user_id, pluggy_bill_id, pluggy_account_id, account_name, due_date, total_amount'
  const query = (columns: string) =>
    fetchAllPages<InvoiceRow>((from, to) =>
      admin
        .from('synced_bills')
        .select(columns)
        .gte('due_date', today)
        .lte('due_date', addDays(today, REMINDER_DAYS + NEXT_INVOICE_WINDOW_DAYS))
        .order('pluggy_bill_id', { ascending: true })
        .range(from, to),
    )

  try {
    return await query(`${baseColumns}, payments_total`)
  } catch (error) {
    if (isMissingColumnError(error)) return query(baseColumns)
    if (isMissingTableError(error)) return []
    throw error
  }
}

async function getPremiumUsers(admin: Admin, userIds: string[]) {
  const premium = new Set<string>()
  for (const ids of chunk(userIds)) {
    const { data, error } = await admin
      .from('subscriptions')
      .select('user_id, plan, status, current_period_end')
      .in('user_id', ids)
    if (error) throw error
    for (const row of data ?? []) {
      if (hasPremiumAccess(row)) premium.add(row.user_id)
    }
  }
  return premium
}

/** Assinatura vencida deixa de receber dados do banco, e o lembrete estaria defasado. */
async function collectInvoiceItems(admin: Admin, today: string): Promise<ReminderItem[]> {
  const invoices = await loadUpcomingInvoices(admin, today)
  const limit = addDays(today, REMINDER_DAYS)
  const due = invoices.filter((invoice) => invoice.due_date <= limit)
  if (due.length === 0) return []

  const premium = await getPremiumUsers(admin, [...new Set(due.map((invoice) => invoice.user_id))])

  return due
    .filter((invoice) => premium.has(invoice.user_id))
    .flatMap((invoice): ReminderItem[] => {
      const totalAmount = Number(invoice.total_amount)
      const nextBillPayments = findNextBillPayments(invoice, invoices)
      const status = getInvoiceStatus({ totalAmount, dueDate: invoice.due_date, today, nextBillPayments })
      if (isSettledBill(status)) return []

      return [{
        user_id: invoice.user_id,
        title: `Fatura ${invoice.account_name || 'do cartão'}`,
        amount: status === 'partial' ? totalAmount - (nextBillPayments ?? 0) : totalAmount,
        due_date: invoice.due_date,
        kind: 'card_bill_due',
        ref: `${invoice.pluggy_bill_id}:${invoice.due_date}`,
      }]
    })
}

function reminderPush(items: ReminderItem[]) {
  // A tela de bloqueio é pública: nome e valor da conta ficam só dentro do app.
  return {
    title: items.length === 1 ? 'Você tem uma conta vencendo' : `Você tem ${items.length} contas vencendo`,
    body: 'Toque para ver os próximos vencimentos.',
    data: { url: '/' },
  }
}

async function sendBillReminders(admin: Admin, today: string, emailEnabled: boolean, pushEnabled: boolean) {
  const billItems = await collectBillItems(admin, today)
  let invoiceItems: ReminderItem[] = []
  try {
    invoiceItems = await collectInvoiceItems(admin, today)
  } catch (error) {
    // Faturas com problema não podem impedir o lembrete das contas.
    console.error('[Cron] Falha ao ler faturas:', error)
  }

  const items = [...billItems, ...invoiceItems]
  const [sentBills, sentInvoices] = await Promise.all([
    getAlreadySent(admin, 'bill_due', billItems.map((item) => item.ref)),
    getAlreadySent(admin, 'card_bill_due', invoiceItems.map((item) => item.ref)),
  ])
  const alreadySent = (item: ReminderItem) =>
    (item.kind === 'bill_due' ? sentBills : sentInvoices).has(`${item.user_id}:${item.ref}`)

  let delivered = 0
  for (const [userId, userItems] of groupByUser(items)) {
    const pending = userItems.filter((item) => !alreadySent(item))
    if (pending.length === 0) continue

    try {
      const { user, email } = await getRecipient(admin, userId)
      let reached = false

      if (emailEnabled && email) {
        try {
          await sendEmail(email, billReminderEmail(pending, getAppUrl()))
          reached = true
        } catch (emailError) {
          console.error('[Cron] Falha ao enviar lembrete por e-mail:', emailError)
        }
      }

      if (pushEnabled && user) {
        try {
          if ((await sendPushToUser(admin, user, reminderPush(pending))) > 0) reached = true
        } catch (pushError) {
          console.error('[Cron] Falha ao enviar lembrete por push:', pushError)
        }
      }

      if (!reached) continue

      await logSent(admin, pending.map((item) => ({ user_id: userId, kind: item.kind, ref: item.ref })))
      delivered += 1
    } catch (sendError) {
      // Uma falha não pode impedir os lembretes das outras pessoas.
      console.error('[Cron] Falha ao enviar lembrete:', sendError)
    }
  }
  return delivered
}

async function sendTrialNotices(admin: Admin, today: string) {
  const trials = await fetchAllPages<{ user_id: string; current_period_end: string }>((from, to) =>
    admin
      .from('subscriptions')
      .select('user_id, current_period_end')
      .eq('provider', 'trial')
      .eq('status', 'active')
      .gte('current_period_end', `${today}T00:00:00-03:00`)
      .lte('current_period_end', `${addDays(today, TRIAL_NOTICE_DAYS)}T23:59:59.999-03:00`)
      .order('user_id', { ascending: true })
      .range(from, to),
  )

  const ref = `trial_ending:${today}`
  const sent = await getAlreadySent(admin, 'trial_ending', [ref])
  const noticeDate = addDays(today, TRIAL_NOTICE_DAYS)
  let emails = 0

  for (const trial of trials) {
    if (sent.has(`${trial.user_id}:${ref}`)) continue

    const endDate = todayInBrazil(new Date(trial.current_period_end))
    if (endDate !== today && endDate !== noticeDate) continue

    try {
      const { email } = await getRecipient(admin, trial.user_id)
      if (!email) continue

      const daysLeft = endDate === today ? 0 : TRIAL_NOTICE_DAYS
      await sendEmail(email, trialEndingEmail({ endDate, daysLeft }, getAppUrl()))
      await logSent(admin, [{ user_id: trial.user_id, kind: 'trial_ending', ref }])
      emails += 1
    } catch (sendError) {
      console.error('[Cron] Falha ao avisar fim do teste:', sendError)
    }
  }
  return emails
}

async function sendMonthlySummaries(admin: Admin, today: string) {
  const { key, start, end } = previousMonthRange(today)
  const bills = await fetchAllPages<{ user_id: string; amount: number; status: string }>((from, to) =>
    admin
      .from('bills')
      .select('user_id, amount, status')
      .gte('due_date', start)
      .lte('due_date', `${end}T23:59:59`)
      .order('id', { ascending: true })
      .range(from, to),
  )

  const sent = await getAlreadySent(admin, 'monthly_summary', [key])
  const monthLabel = MONTHS[Number(key.split('-')[1]) - 1]
  let emails = 0
  // Falha ao ler planos não impede o resumo: só tira o link do relatório completo.
  const premium = await getPremiumUsers(admin, [...new Set(bills.map((bill) => bill.user_id))]).catch(() => new Set<string>())

  for (const [userId, userBills] of groupByUser(bills)) {
    if (sent.has(`${userId}:${key}`)) continue

    const total = userBills.reduce((acc, bill) => acc + Number(bill.amount || 0), 0)
    const paid = userBills
      .filter((bill) => isSettledBill(bill.status))
      .reduce((acc, bill) => acc + Number(bill.amount || 0), 0)

    try {
      const { email } = await getRecipient(admin, userId)
      if (!email) continue

      await sendEmail(
        email,
        monthlySummaryEmail(
          {
            monthLabel,
            total,
            paid,
            pending: total - paid,
            count: userBills.length,
            reportMonth: premium.has(userId) ? key : undefined,
          },
          getAppUrl(),
        ),
      )
      await logSent(admin, [{ user_id: userId, kind: 'monthly_summary', ref: key }])
      emails += 1
    } catch (sendError) {
      console.error('[Cron] Falha ao enviar resumo:', sendError)
    }
  }
  return emails
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 503 })
  if (!secretsMatch(req.headers.get('authorization'), `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = todayInBrazil()

  // Contadores de login antigos não servem mais.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString()
  await admin.from('rate_limits').delete().lt('window_start', yesterday)

  try {
    await retryFailedImports()
  } catch (error) {
    // Os lembretes não dependem dos bancos.
    console.error('[Cron] Falha ao tentar importar de novo:', error)
  }

  // Antes dos e-mails: as notícias não dependem de e-mail nem de push estarem configurados.
  let cvm: CvmSyncResult | 'falhou' = 'falhou'
  try {
    cvm = await syncCvmAnnouncements(admin, today)
  } catch (error) {
    // A CVM fora do ar não pode impedir os lembretes de contas.
    console.error('[Cron] Falha ao atualizar comunicados da CVM:', error)
  }

  const emailEnabled = isEmailConfigured()
  const pushEnabled = isPushEnabled()

  // Histórico das carteiras e alertas: depois dos comunicados, para avisar os do dia.
  let market: MarketJobsResult | 'falhou' = 'falhou'
  try {
    market = await runMarketJobs(admin, today, { email: emailEnabled, push: pushEnabled })
  } catch (error) {
    console.error('[Cron] Falha nas tarefas de mercado:', error)
  }

  // Por último: o que sobrar de tempo vai para as conquistas, que não dependem de e-mail nem de push.
  const runGamification = async (): Promise<GamificationJobsResult | 'sem_tabela' | 'falhou'> => {
    try {
      return await runGamificationJobs(admin, today, { push: pushEnabled })
    } catch (error) {
      console.error('[Cron] Falha ao conferir conquistas:', error)
      return 'falhou'
    }
  }

  if (!emailEnabled && !pushEnabled) {
    const gamification = await runGamification()
    return NextResponse.json({ ok: true, email: 'desativado', cvm, market, gamification })
  }

  try {
    let generated = 0
    try {
      generated = await generateRecurringBills(admin, today)
    } catch (error) {
      // Quem já tem a conta criada continua recebendo o lembrete.
      console.error('[Cron] Falha ao gerar contas recorrentes:', error)
    }

    const reminders = await sendBillReminders(admin, today, emailEnabled, pushEnabled)
    const summaries = emailEnabled && today.endsWith('-01') ? await sendMonthlySummaries(admin, today) : 0
    const trialNotices = emailEnabled ? await sendTrialNotices(admin, today) : 0
    const gamification = await runGamification()
    return NextResponse.json({ ok: true, generated, reminders, summaries, trialNotices, cvm, market, gamification })
  } catch (error) {
    console.error('[Cron] Falha na rotina diária:', error)
    return NextResponse.json({ error: 'Falha na rotina diária' }, { status: 500 })
  }
}
