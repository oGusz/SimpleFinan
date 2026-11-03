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

import { after, NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPluggyApiKey, getPluggyItem, syncPluggyItem, userHasPremium } from '@/lib/pluggy/server'
import { secretsMatch } from '@/lib/secure-compare'

const WEBHOOK_SECRET_HEADER = 'x-simplefinan-webhook-secret'

interface PluggyWebhookPayload {
  event: string
  eventId?: string
  itemId?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  LOGIN_ERROR: 'O acesso ao banco expirou. Remova a conexão e conecte novamente.',
  OUTDATED: 'Não foi possível atualizar os dados deste banco.',
  WAITING_USER_INPUT: 'O banco pediu uma autenticação adicional.',
  WAITING_USER_ACTION: 'O banco pediu uma ação sua para continuar.',
}

async function processEvent({ event, itemId }: PluggyWebhookPayload) {
  if (!itemId) return

  const supabase = createAdminClient()
  const { data: bank, error } = await supabase
    .from('connected_banks')
    .select('user_id')
    .eq('item_id', itemId)
    .maybeSingle()

  if (error) throw error
  if (!bank) {
    console.log(`[Webhook] Item ${itemId} não encontrado. Ignorando.`)
    return
  }

  switch (event) {
    case 'item/updated': {
      // Assinatura vencida não recebe novos dados.
      if (await userHasPremium(bank.user_id)) {
        await syncPluggyItem(itemId, bank.user_id)
      }
      break
    }

    case 'item/error':
    case 'item/waiting_user_input':
    case 'item/waiting_user_action': {
      // A Pluggy recomenda consultar o item em vez de confiar só no payload.
      const item = await getPluggyItem(itemId, await getPluggyApiKey())
      const status = String(item.status || 'OUTDATED')
      const { error: updateError } = await supabase
        .from('connected_banks')
        .update({
          item_status: status,
          error_type: item.error?.code || null,
          error_message: ERROR_MESSAGES[status] || ERROR_MESSAGES.OUTDATED,
        })
        .eq('item_id', itemId)
      if (updateError) throw updateError
      break
    }

    case 'item/deleted': {
      const { error: deleteError } = await supabase
        .from('connected_banks')
        .delete()
        .eq('item_id', itemId)
      if (deleteError) throw deleteError
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
      console.error(`[Webhook] Falha ao processar ${payload.event} (${payload.eventId}):`, error)
    }
  })

  return NextResponse.json({ ok: true })
}
