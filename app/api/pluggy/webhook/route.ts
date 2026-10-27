/**
 * POST /api/pluggy/webhook
 *
 * Endpoint que a Pluggy chama automaticamente sempre que um item (banco conectado)
 * é atualizado, tem erro, ou precisa de ação do usuário.
 *
 * CONFIGURAÇÃO NO PAINEL PLUGGY:
 *   Dashboard → Webhooks → Add Webhook
 *   URL: https://seu-dominio.com/api/pluggy/webhook
 *   Events: item/updated, item/error, item/waiting_user_input, item/login_error
 *   Secret: valor de PLUGGY_WEBHOOK_SECRET no .env
 *
 * SEGURANÇA:
 *   A Pluggy assina cada request com HMAC-SHA256 usando o PLUGGY_WEBHOOK_SECRET.
 *   Verificamos a assinatura antes de processar qualquer dado.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { syncBankDataToSupabase } from '@/app/actions/pluggy'

// ─── Tipos de eventos que a Pluggy envia ──────────────────────────────────────
type PluggyEvent =
  | 'item/updated'
  | 'item/error'
  | 'item/waiting_user_input'
  | 'item/login_error'

interface PluggyWebhookPayload {
  event: PluggyEvent
  itemId: string
  triggeredBy?: 'USER' | 'SYSTEM'
  error?: {
    code: string
    message: string
  }
}

// ─── Cliente Supabase com SERVICE ROLE (bypass de RLS para o webhook) ─────────
// O webhook roda fora do contexto de autenticação do usuário, então usamos
// a service role key para escrever no Supabase em nome de qualquer usuário.
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // ← nunca expor no browser!
    { auth: { persistSession: false } }
  )
}

// ─── Verificação de assinatura HMAC-SHA256 ────────────────────────────────────
function verifyPluggySignature(rawBody: string, signature: string): boolean {
  const secret = process.env.PLUGGY_WEBHOOK_SECRET
  if (!secret) {
    // Em desenvolvimento sem secret configurado, logar aviso e permitir
    console.warn('[Webhook] PLUGGY_WEBHOOK_SECRET não configurado. Pulando verificação.')
    return true
  }

  try {
    const expectedSig = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')

    // A Pluggy envia no formato "sha256=<hex>"
    const receivedHex = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature

    // Comparação segura (evita timing attacks)
    return expectedSig === receivedHex
  } catch {
    return false
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-pluggy-signature') || ''

  // 1. Verificar assinatura
  if (!verifyPluggySignature(rawBody, signature)) {
    console.error('[Webhook] Assinatura inválida recebida')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: PluggyWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { event, itemId, error: pluggyError } = payload
  console.log(`[Webhook] Evento recebido: ${event} para item ${itemId}`)

  const supabase = getServiceClient()

  // 2. Buscar qual usuário tem este item_id conectado
  const { data: bankRow, error: dbError } = await supabase
    .from('connected_banks')
    .select('user_id, institution_name')
    .eq('item_id', itemId)
    .single()

  if (dbError || !bankRow) {
    // Item não encontrado — pode ser de outro ambiente (sandbox vs prod)
    console.log(`[Webhook] Item ${itemId} não encontrado no banco. Ignorando.`)
    return NextResponse.json({ ok: true })
  }

  const { user_id: userId } = bankRow

  // 3. Processar conforme o tipo de evento
  switch (event) {
    case 'item/updated': {
      // ✅ Banco atualizou com sucesso → sincronizar tudo
      console.log(`[Webhook] Sincronizando dados do item ${itemId} para usuário ${userId}`)
      // Executar sync em background (não await para responder rápido à Pluggy)
      syncBankDataToSupabase(itemId, userId).catch((err) =>
        console.error('[Webhook] Erro no sync em background:', err)
      )
      break
    }

    case 'item/login_error': {
      // 🔴 Credenciais expiraram → usuário precisa reconectar
      await supabase
        .from('connected_banks')
        .update({
          item_status: 'LOGIN_ERROR',
          error_type: 'LOGIN_ERROR',
          error_message: 'Sessão expirada. Reconecte sua conta bancária.',
        })
        .eq('item_id', itemId)
        .eq('user_id', userId)
      break
    }

    case 'item/error': {
      // ⚠️ Erro no banco → registrar
      await supabase
        .from('connected_banks')
        .update({
          item_status: 'ERROR',
          error_type: pluggyError?.code || 'UNKNOWN',
          error_message: pluggyError?.message || 'Erro na sincronização',
        })
        .eq('item_id', itemId)
        .eq('user_id', userId)
      break
    }

    case 'item/waiting_user_input': {
      // ⏳ Aguardando MFA (segundo fator do usuário)
      await supabase
        .from('connected_banks')
        .update({
          item_status: 'WAITING_USER_INPUT',
          error_message: 'Autenticação adicional necessária.',
        })
        .eq('item_id', itemId)
        .eq('user_id', userId)
      break
    }

    default:
      console.log(`[Webhook] Evento não tratado: ${event}`)
  }

  // Sempre retornar 200 rapidamente para a Pluggy não retentar
  return NextResponse.json({ ok: true })
}

// A Pluggy pode enviar um GET para verificar que o endpoint existe
export async function GET() {
  return NextResponse.json({ status: 'Pluggy webhook endpoint ativo' })
}

