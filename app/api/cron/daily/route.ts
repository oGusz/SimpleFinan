/**
 * GET /api/cron/daily — chamado uma vez por dia pela Vercel (vercel.json).
 * Com CRON_SECRET no ambiente, a Vercel envia `Authorization: Bearer <CRON_SECRET>`.
 * Envia lembretes de vencimento e, no dia 1º, o resumo do mês anterior.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { secretsMatch } from '@/lib/secure-compare'
import { addDays, previousMonthRange, todayInBrazil } from '@/lib/finance-insights'
import { billReminderEmail, monthlySummaryEmail } from '@/lib/email/templates'
import { getAppUrl, isEmailConfigured, sendEmail } from '@/lib/email/send'

const REMINDER_DAYS = 3
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

type Admin = ReturnType<typeof createAdminClient>

function groupByUser<T extends { user_id: string }>(rows: T[]) {
  const groups = new Map<string, T[]>()
  for (const row of rows) groups.set(row.user_id, [...(groups.get(row.user_id) ?? []), row])
  return groups
}

/** Quem desligou os lembretes ou não tem e-mail não recebe nada. */
async function getRecipientEmail(admin: Admin, userId: string) {
  const { data } = await admin.auth.admin.getUserById(userId)
  if (data.user?.user_metadata?.email_reminders === false) return null
  return data.user?.email ?? null
}

async function getAlreadySent(admin: Admin, kind: string, refs: string[]) {
  if (refs.length === 0) return new Set<string>()
  const { data, error } = await admin.from('notification_log').select('user_id, ref').eq('kind', kind).in('ref', refs)
  if (error) throw error
  return new Set((data ?? []).map((row) => `${row.user_id}:${row.ref}`))
}

async function sendBillReminders(admin: Admin, today: string) {
  const { data: bills, error } = await admin
    .from('bills')
    .select('id, user_id, title, amount, due_date')
    .neq('status', 'paid')
    .gte('due_date', today)
    .lte('due_date', addDays(today, REMINDER_DAYS))
  if (error) throw error

  const refFor = (bill: { id: string; due_date: string }) => `${bill.id}:${bill.due_date.slice(0, 10)}`
  const sent = await getAlreadySent(admin, 'bill_due', (bills ?? []).map(refFor))
  let emails = 0

  for (const [userId, userBills] of groupByUser(bills ?? [])) {
    const pending = userBills.filter((bill) => !sent.has(`${userId}:${refFor(bill)}`))
    if (pending.length === 0) continue

    try {
      const email = await getRecipientEmail(admin, userId)
      if (!email) continue

      await sendEmail(email, billReminderEmail(pending, getAppUrl()))
      await admin.from('notification_log').upsert(
        pending.map((bill) => ({ user_id: userId, kind: 'bill_due', ref: refFor(bill) })),
      )
      emails += 1
    } catch (sendError) {
      // Uma falha não pode impedir os lembretes das outras pessoas.
      console.error('[Cron] Falha ao enviar lembrete:', sendError)
    }
  }
  return emails
}

async function sendMonthlySummaries(admin: Admin, today: string) {
  const { key, start, end } = previousMonthRange(today)
  const { data: bills, error } = await admin
    .from('bills')
    .select('user_id, amount, status')
    .gte('due_date', start)
    .lte('due_date', `${end}T23:59:59`)
  if (error) throw error

  const sent = await getAlreadySent(admin, 'monthly_summary', [key])
  const monthLabel = MONTHS[Number(key.split('-')[1]) - 1]
  let emails = 0

  for (const [userId, userBills] of groupByUser(bills ?? [])) {
    if (sent.has(`${userId}:${key}`)) continue

    const total = userBills.reduce((acc, bill) => acc + Number(bill.amount || 0), 0)
    const paid = userBills
      .filter((bill) => bill.status === 'paid')
      .reduce((acc, bill) => acc + Number(bill.amount || 0), 0)

    try {
      const email = await getRecipientEmail(admin, userId)
      if (!email) continue

      await sendEmail(
        email,
        monthlySummaryEmail({ monthLabel, total, paid, pending: total - paid, count: userBills.length }, getAppUrl()),
      )
      await admin.from('notification_log').upsert({ user_id: userId, kind: 'monthly_summary', ref: key })
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

  if (!isEmailConfigured()) return NextResponse.json({ ok: true, email: 'desativado' })

  try {
    const reminders = await sendBillReminders(admin, today)
    const summaries = today.endsWith('-01') ? await sendMonthlySummaries(admin, today) : 0
    return NextResponse.json({ ok: true, reminders, summaries })
  } catch (error) {
    console.error('[Cron] Falha na rotina diária:', error)
    return NextResponse.json({ error: 'Falha na rotina diária' }, { status: 500 })
  }
}
