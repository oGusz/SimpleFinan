'use server'

import { actionError, actionOk, type ActionResult } from '@/lib/action-result'
import { MAX_ACTIVE_ALERTS, type PriceAlert } from '@/lib/alerts'
import { isMissingTableError } from '@/lib/finance-insights'
import { userHasPremium } from '@/lib/pluggy/server'
import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isExchangeTicker, normalizeTicker } from '@/lib/tickers'

const UNAVAILABLE = 'Os alertas ainda não estão disponíveis. Tente mais tarde.'

async function requireUser() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims.sub
  return { supabase, userId: typeof userId === 'string' ? userId : null }
}

export async function listPriceAlerts(): Promise<{ status: 'ok' | 'unavailable'; alerts: PriceAlert[] }> {
  const { supabase, userId } = await requireUser()
  if (!userId) return { status: 'ok', alerts: [] }
  const { data, error } = await supabase
    .from('price_alerts')
    .select('id, ticker, direction, target, created_at, triggered_at, triggered_price')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60)
  if (error) {
    if (isMissingTableError(error)) return { status: 'unavailable', alerts: [] }
    throw error
  }
  return {
    status: 'ok',
    alerts: (data ?? []).map((row) => ({
      ...row,
      target: Number(row.target),
      triggered_price: row.triggered_price === null ? null : Number(row.triggered_price),
    })) as PriceAlert[],
  }
}

export async function createPriceAlert(input: { ticker: string; direction: string; target: number }): Promise<ActionResult> {
  const { userId } = await requireUser()
  if (!userId) return actionError('Entre na sua conta para criar alertas.')

  const ticker = normalizeTicker(String(input.ticker ?? ''))
  if (!ticker || !isExchangeTicker(ticker)) return actionError('Escolha um ativo da bolsa, como PETR4 ou MXRF11.')
  if (input.direction !== 'above' && input.direction !== 'below') return actionError('Escolha se o alerta é acima ou abaixo do valor.')
  const target = Number(input.target)
  if (!Number.isFinite(target) || target <= 0 || target > 1_000_000) return actionError('Informe um valor válido.')

  const allowed = await consumeRateLimit(rateLimitKey('price-alert', userId), 60, 3600)
  if (!allowed) return actionError('Muitas tentativas em pouco tempo. Aguarde e tente de novo.')

  try {
    if (!(await userHasPremium(userId))) return actionError('Alertas de preço fazem parte do Premium.')
  } catch {
    return actionError('Não foi possível confirmar seu plano. Tente de novo.')
  }

  const admin = createAdminClient()
  const { count, error: countError } = await admin
    .from('price_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('triggered_at', null)
  if (countError) return actionError(isMissingTableError(countError) ? UNAVAILABLE : 'Não foi possível criar o alerta.')
  if ((count ?? 0) >= MAX_ACTIVE_ALERTS) return actionError(`Você já tem ${MAX_ACTIVE_ALERTS} alertas ativos. Exclua um para criar outro.`)

  const { error } = await admin
    .from('price_alerts')
    .insert({ user_id: userId, ticker, direction: input.direction, target: Math.round(target * 10000) / 10000 })
  if (error) {
    console.error('[Alertas] Falha ao criar alerta:', error.code)
    return actionError(isMissingTableError(error) ? UNAVAILABLE : 'Não foi possível criar o alerta.')
  }
  return actionOk()
}

export async function deletePriceAlert(id: string): Promise<ActionResult> {
  const { userId } = await requireUser()
  if (!userId) return actionError('Entre na sua conta.')
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return actionError('Alerta inválido.')

  // Filtrar por user_id impede apagar o alerta de outra pessoa com o id dela.
  const { error } = await createAdminClient().from('price_alerts').delete().eq('id', id).eq('user_id', userId)
  if (error) return actionError('Não foi possível excluir o alerta.')
  return actionOk()
}

export async function setAnnouncementAlerts(enabled: boolean): Promise<ActionResult> {
  const { supabase, userId } = await requireUser()
  if (!userId) return actionError('Entre na sua conta.')
  const { error } = await supabase.auth.updateUser({ data: { alert_announcements: Boolean(enabled) } })
  if (error) return actionError('Não foi possível salvar a preferência.')
  return actionOk()
}
