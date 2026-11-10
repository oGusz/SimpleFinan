'use server'

import { actionError, actionOk, type ActionResult } from '@/lib/action-result'
import { isMissingTableError } from '@/lib/finance-insights'
import type { UnseenItem } from '@/lib/gamification'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// O estado das conquistas vem de GET /api/gamification, que não entra na fila das ações.
const MAX_SEEN_ITEMS = 30
const CODE_PATTERN = /^[a-z0-9_]{1,40}$/
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

async function requireUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims.sub
  return { supabase, userId: typeof userId === 'string' ? userId : null }
}

/** Marca como vistos os avisos que o app já mostrou. Para desafio, code é o mês (AAAA-MM). */
export async function markGamificationSeen(items: Pick<UnseenItem, 'kind' | 'code'>[]): Promise<ActionResult> {
  const { userId } = await requireUser()
  if (!userId) return actionError('Entre na sua conta.')
  if (!Array.isArray(items) || items.length === 0) return actionOk()

  const valid = items.slice(0, MAX_SEEN_ITEMS).filter((item) => item && typeof item.code === 'string')
  const codes = [...new Set(valid.filter((item) => item.kind === 'achievement' && CODE_PATTERN.test(item.code)).map((item) => item.code))]
  const months = [...new Set(valid.filter((item) => item.kind === 'challenge' && MONTH_PATTERN.test(item.code)).map((item) => item.code))]

  const admin = createAdminClient()
  const seenAt = new Date().toISOString()
  // Filtrar por user_id impede marcar os avisos de outra pessoa.
  const results = await Promise.all([
    codes.length > 0
      ? admin.from('user_achievements').update({ seen_at: seenAt }).eq('user_id', userId).in('code', codes).is('seen_at', null)
      : null,
    months.length > 0
      ? admin.from('user_challenges').update({ seen_at: seenAt }).eq('user_id', userId).in('month', months).is('seen_at', null)
      : null,
  ])
  for (const result of results) {
    if (result?.error && !isMissingTableError(result.error)) {
      console.error('[Conquistas] Falha ao marcar avisos:', result.error.code)
      return actionError('Não foi possível atualizar os avisos.')
    }
  }
  return actionOk()
}

export async function setAchievementPush(enabled: boolean): Promise<ActionResult> {
  const { supabase, userId } = await requireUser()
  if (!userId) return actionError('Entre na sua conta.')
  const { error } = await supabase.auth.updateUser({ data: { push_achievements: Boolean(enabled) } })
  if (error) return actionError('Não foi possível salvar a preferência.')
  return actionOk()
}
