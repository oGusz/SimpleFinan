/**
 * POST /api/pluggy/webhook
 *
 * A Pluggy não assina os webhooks. A autenticação é um cabeçalho secreto definido
 * ao registrar o webhook, o que só pode ser feito pela API:
 *   node --env-file=.env.local scripts/register-pluggy-webhook.mjs https://seu-dominio.com
 *
 * Regras da Pluggy: responder 2XX em até 10 segundos e processar depois da resposta.
 * Respostas 400/401/403/404/405 não geram nova tentativa; as demais falhas, sim.
 */

import * as Sentry from '@sentry/nextjs'
import { after, NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_CONNECTED_BANKS } from '@/lib/plans'
import { itemStatusFields } from '@/lib/pluggy/errors'
import {
  deleteOrphanInvestments,
  deletePluggyItem,
  deleteSyncedItemData,
  getPluggyApiKey,
  getPluggyItem,
  PluggyError,
  recordImportFailure,
  syncPluggyItem,
  userHasPremium,
} from '@/lib/pluggy/server'
import { secretsMatch } from '@/lib/secure-compare'

const WEBHOOK_SECRET_HEADER = 'x-simplefinan-webhook-secret'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID_CHUNK = 200

interface PluggyWebhookPayload {
  event: string
  eventId?: string
  itemId?: string
  transactionIds?: string[]
}

/**
 * A pessoa pode autorizar no banco e não voltar ao app: o item existe na Pluggy, com
 * consentimento ativo, e sem registro aqui. Consulta o item em vez de confiar no payload.
 */
async function adoptOrphanItem(itemId: string) {
  const supabase = createAdminClient()
  const apiKey = await getPluggyApiKey()
  let item
  try {
    item = await getPluggyItem(itemId, apiKey)
  } catch (error) {
    // Evento atrasado de um banco que a pessoa acabou de desconectar: não há o que registrar.
    if (error instanceof PluggyError && error.status === 404) {
      console.log(`[Webhook] Item ${itemId} não existe mais na Pluggy. Ignorando.`)
      return
    }
    throw error
  }
  const userId = item.clientUserId

  if (typeof userId !== 'string' || !UUID.test(userId)) {
    console.log(`[Webhook] Item ${itemId} sem usuário válido. Ignorando.`)
    return
  }
  if (!(await userHasPremium(userId))) {
    console.log(`[Webhook] Item ${itemId} de usuário sem Premium. Ignorando.`)
    return
  }

  const { count, error: countError } = await supabase
    .from('connected_banks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (countError) throw countError
  if ((count ?? 0) >= MAX_CONNECTED_BANKS) {
    // Mesma regra de savePluggyBank: acima do limite, o consentimento não fica ativo.
    await deletePluggyItem(itemId, apiKey)
    console.log(`[Webhook] Item ${itemId} removido: limite de bancos atingido.`)
    return
  }

  const { error } = await supabase.from('connected_banks').upsert({
    user_id: userId,
    item_id: itemId,
    provider: 'pluggy',
    institution_name: item.connector?.name || 'Instituição bancária',
    institution_logo: item.connector?.imageUrl || null,
    status: 'active',
    item_status: item.status || 'UPDATING',
  }, { onConflict: 'user_id,item_id' })
  if (error) throw error

  if (item.status === 'UPDATED') await syncPluggyItem(itemId, userId)
}

async function processEvent({ event, itemId, transactionIds }: PluggyWebhookPayload) {
  if (!itemId) return

  const supabase = createAdminClient()
  const { data: bank, error } = await supabase
    .from('connected_banks')
    .select('user_id')
    .eq('item_id', itemId)
    .maybeSingle()

  if (error) throw error
  if (!bank) {
    if (event === 'item/created' || event === 'item/updated') {
      await adoptOrphanItem(itemId)
    } else {
      console.log(`[Webhook] Item ${itemId} não encontrado. Ignorando.`)
    }
    return
  }

  switch (event) {
    case 'transactions/updated':
    case 'item/updated': {
      // Assinatura vencida não recebe novos dados.
      if (await userHasPremium(bank.user_id)) {
        await syncPluggyItem(itemId, bank.user_id)
      }
      break
    }

    case 'transactions/deleted': {
      const ids = Array.isArray(transactionIds) ? transactionIds.map(String) : []
      for (let start = 0; start < ids.length; start += ID_CHUNK) {
        const { error: removeError } = await supabase
          .from('synced_transactions')
          .delete()
          .eq('item_id', itemId)
          .in('pluggy_transaction_id', ids.slice(start, start + ID_CHUNK))
        if (removeError) throw removeError
      }
      break
    }

    case 'item/error':
    case 'item/waiting_user_input':
    case 'item/waiting_user_action': {
      // A Pluggy recomenda consultar o item em vez de confiar só no payload.
      const item = await getPluggyItem(itemId, await getPluggyApiKey())
      const { error: updateError } = await supabase
        .from('connected_banks')
        .update(itemStatusFields(item))
        .eq('item_id', itemId)
      if (updateError) throw updateError
      break
    }

    case 'item/deleted': {
      // O consentimento acabou: extrato e saldos desse banco não podem continuar guardados.
      await deleteSyncedItemData(itemId)

      const { error: deleteError } = await supabase
        .from('connected_banks')
        .delete()
        .eq('item_id', itemId)
      if (deleteError) throw deleteError

      await deleteOrphanInvestments(bank.user_id)
      break
    }
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.PLUGGY_WEBHOOK_SECRET?.trim()
  if (!secret) {
    console.error('[Webhook] PLUGGY_WEBHOOK_SECRET não configurado.')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 }) // gera nova tentativa
  }

  if (!secretsMatch(req.headers.get(WEBHOOK_SECRET_HEADER), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: PluggyWebhookPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  after(async () => {
    try {
      await processEvent(payload)
    } catch (error) {
      // Já respondemos 200, então a Pluggy não repete o evento: o erro precisa aparecer na tela.
      console.error(`[Webhook] Falha ao processar ${payload.event} (${payload.eventId}):`, error)
      Sentry.captureException(error)
      if (payload.itemId) await recordImportFailure(payload.itemId)
    }
  })

  return NextResponse.json({ ok: true })
}
