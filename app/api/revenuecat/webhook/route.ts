/**
 * POST /api/revenuecat/webhook
 *
 * Mantém a tabela `subscriptions` atualizada com as compras feitas nas lojas.
 * No painel da RevenueCat:
 *   - Authorization header: o mesmo valor de REVENUECAT_WEBHOOK_AUTH
 *   - App User ID do SDK: o id do usuário no Supabase
 *   - Transfer behavior: "Keep with original App User ID" (evita mover a assinatura
 *     entre contas; por isso o evento TRANSFER não é tratado aqui)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { secretsMatch } from '@/lib/secure-compare'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FOREIGN_KEY_VIOLATION = '23503'

// CANCELLATION mantém o acesso até expiration_at_ms; quem remove o acesso é EXPIRATION.
const STATUS_BY_EVENT: Record<string, string> = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  UNCANCELLATION: 'active',
  SUBSCRIPTION_EXTENDED: 'active',
  REFUND_REVERSED: 'active',
  TEMPORARY_ENTITLEMENT_GRANT: 'active',
  CANCELLATION: 'canceled',
  BILLING_ISSUE: 'billing_issue',
  EXPIRATION: 'expired',
}

export async function POST(req: NextRequest) {
  if (!secretsMatch(req.headers.get('authorization'), process.env.REVENUECAT_WEBHOOK_AUTH?.trim())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const event = body?.event
  const status = STATUS_BY_EVENT[event?.type]
  const userId = event?.app_user_id

  // Eventos irrelevantes respondem 200 para não gerar novas tentativas.
  if (!status || typeof userId !== 'string' || !UUID.test(userId)) {
    return NextResponse.json({ ok: true })
  }

  // Compras de teste não liberam Premium em produção. Para a revisão das lojas,
  // use uma conta de demonstração liberada manualmente (migration_premium.sql).
  if (event.environment === 'SANDBOX' && process.env.REVENUECAT_ALLOW_SANDBOX !== 'true') {
    return NextResponse.json({ ok: true })
  }

  const supabase = createAdminClient()
  const { data: current, error: readError } = await supabase
    .from('subscriptions')
    .select('provider, last_event_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (readError) {
    console.error('[RevenueCat] Falha ao ler assinatura:', readError)
    return NextResponse.json({ error: 'Retry' }, { status: 500 })
  }

  // Concessão manual não é sobrescrita pela loja.
  if (current?.provider === 'manual') return NextResponse.json({ ok: true })

  // A entrega pode repetir ou chegar fora de ordem: eventos antigos são ignorados.
  // Data inválida faria o evento falhar para sempre: a RevenueCat repetiria sem nunca aplicar.
  const timestamp = Number(event.event_timestamp_ms)
  const expiration = Number(event.expiration_at_ms)
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    console.warn(`[RevenueCat] Evento ${event.id} sem data válida.`)
    return NextResponse.json({ ok: true })
  }

  const eventAt = new Date(timestamp).toISOString()
  if (current?.last_event_at && new Date(current.last_event_at) > new Date(eventAt)) {
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase.from('subscriptions').upsert({
    user_id: userId,
    plan: 'premium',
    status,
    provider: 'revenuecat',
    product_id: event.product_id ?? null,
    store: event.store ?? null,
    current_period_end: Number.isFinite(expiration) && expiration > 0
      ? new Date(expiration).toISOString()
      : null,
    last_event_at: eventAt,
  })

  if (error?.code === FOREIGN_KEY_VIOLATION) {
    // Conta já excluída: repetir o evento não resolveria.
    console.warn(`[RevenueCat] Evento ${event.id} para usuário inexistente.`)
    return NextResponse.json({ ok: true })
  }
  if (error) {
    console.error('[RevenueCat] Falha ao salvar assinatura:', error)
    return NextResponse.json({ error: 'Retry' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
