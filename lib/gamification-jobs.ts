import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { fetchAllPages } from '@/lib/finance-insights'
import { shiftMonth, type UnseenItem } from '@/lib/gamification'
import { syncUserGamification } from '@/lib/gamification-server'
import { hasPremiumAccess } from '@/lib/plans'
import { sendPushToUser, type PushMessage } from '@/lib/push'

type Admin = SupabaseClient

const CHUNK = 200
/** A rotina inteira tem 60 s: as conquistas ficam com uma parte e o resto continua amanhã. */
const TIME_BUDGET_MS = 20_000

export interface GamificationJobsResult {
  users: number
  /** Quem ficou para a próxima rodada por falta de tempo. */
  pending: number
  pushes: number
}

const kindOf = (item: UnseenItem) => (item.kind === 'achievement' ? 'achievement' : 'challenge')

function chunk<T>(items: T[], size = CHUNK) {
  const chunks: T[][] = []
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size))
  return chunks
}

async function distinctUsers(admin: Admin, today: string) {
  const ids = new Set<string>()
  // Contas antigas não destravam nada novo: basta quem teve conta nos últimos 13 meses.
  const since = `${shiftMonth(today.slice(0, 7), -12)}-01`
  const sources = [
    (from: number, to: number) =>
      admin.from('bills').select('user_id').gte('due_date', since).order('user_id', { ascending: true }).range(from, to),
    (from: number, to: number) => admin.from('goals').select('user_id').order('user_id', { ascending: true }).range(from, to),
    (from: number, to: number) => admin.from('investments').select('user_id').order('user_id', { ascending: true }).range(from, to),
  ]
  for (const source of sources) {
    for (const row of await fetchAllPages<{ user_id: string }>(source)) ids.add(row.user_id)
  }
  return [...ids].sort()
}

async function premiumUsers(admin: Admin, userIds: string[]) {
  const premium = new Set<string>()
  for (const ids of chunk(userIds)) {
    const { data, error } = await admin.from('subscriptions').select('user_id, plan, status, current_period_end').in('user_id', ids)
    if (error) throw error
    for (const row of data ?? []) if (hasPremiumAccess(row)) premium.add(row.user_id)
  }
  return premium
}

function pushFor(items: UnseenItem[]): PushMessage {
  const points = items.reduce((sum, item) => sum + item.points, 0)
  if (items.length === 1) {
    const [item] = items
    return {
      title: item.kind === 'challenge' ? 'Desafio do mês concluído' : 'Conquista desbloqueada',
      body: `${item.title} · +${item.points} pontos`,
      data: { url: '/conquistas' },
    }
  }
  return { title: 'Conquistas desbloqueadas', body: `${items.length} conquistas novas · +${points} pontos`, data: { url: '/conquistas' } }
}

/** Avisa por push o que ainda não foi visto no app nem avisado antes. Só registra o que chegou a algum aparelho. */
async function notify(admin: Admin, userId: string, unseen: UnseenItem[]) {
  const { data: logged, error } = await admin
    .from('notification_log')
    .select('kind, ref')
    .eq('user_id', userId)
    .in('kind', ['achievement', 'challenge'])
    .in('ref', unseen.map((item) => item.code))
  if (error) throw error
  const sent = new Set((logged ?? []).map((row) => `${row.kind}:${row.ref}`))
  const fresh = unseen.filter((item) => !sent.has(`${kindOf(item)}:${item.code}`))
  if (fresh.length === 0) return false

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
  if (userError || !userData.user) return false
  if (userData.user.user_metadata?.push_achievements === false) return false

  if ((await sendPushToUser(admin, userData.user, pushFor(fresh))) === 0) return false
  const { error: logError } = await admin
    .from('notification_log')
    .upsert(fresh.map((item) => ({ user_id: userId, kind: kindOf(item), ref: item.code })))
  // O push já saiu: a falha só faz o aviso se repetir amanhã.
  if (logError) console.error('[Conquistas] Falha ao registrar push:', logError)
  return true
}

/**
 * Confere conquistas e desafio de todos que usam o app: assim quem fecha o mês em dia ganha o selo
 * mesmo sem abrir o app, e fica sabendo pelo celular.
 */
export async function runGamificationJobs(
  admin: Admin,
  today: string,
  options: { push: boolean; now?: () => number },
): Promise<GamificationJobsResult | 'sem_tabela'> {
  const now = options.now ?? Date.now
  const startedAt = now()
  const users = await distinctUsers(admin, today)
  if (users.length === 0) return { users: 0, pending: 0, pushes: 0 }

  // Começa num ponto diferente a cada dia: se faltar tempo, os mesmos não ficam sempre de fora.
  const dayNumber = Math.round(Date.parse(`${today}T00:00:00Z`) / 86_400_000)
  const offset = ((dayNumber % users.length) + users.length) % users.length
  const ordered = [...users.slice(offset), ...users.slice(0, offset)]
  const premium = await premiumUsers(admin, ordered).catch(() => new Set<string>())

  let processed = 0
  let pushes = 0
  for (const userId of ordered) {
    if (now() - startedAt > TIME_BUDGET_MS) break
    processed += 1
    try {
      const state = await syncUserGamification(admin, userId, today, { isPremium: premium.has(userId), write: true })
      if (state.status === 'unavailable') return 'sem_tabela'
      if (options.push && state.unseen.length > 0 && (await notify(admin, userId, state.unseen))) pushes += 1
    } catch (error) {
      // Uma pessoa com problema não pode impedir as outras.
      console.error('[Conquistas] Falha ao conferir conquistas de um usuário:', error)
    }
  }
  return { users: processed, pending: ordered.length - processed, pushes }
}
