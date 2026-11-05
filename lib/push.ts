import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { isMissingTableError } from '@/lib/finance-insights'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
// Limite de mensagens por requisição definido pela Expo.
const EXPO_BATCH_SIZE = 100

type Admin = ReturnType<typeof createAdminClient>

export interface PushMessage {
  title: string
  body: string
  data?: Record<string, unknown>
}

export function isPushEnabled() {
  return process.env.PUSH_REMINDERS_ENABLED === 'true'
}

export function wantsPushReminders(user: { user_metadata?: Record<string, unknown> } | null | undefined) {
  return Boolean(user) && user?.user_metadata?.push_reminders !== false
}

/** A tabela vem de uma migração que pode não ter sido aplicada: sem ela, ninguém tem aparelho. */
export async function getPushTokens(admin: Admin, userId: string): Promise<string[]> {
  const { data, error } = await admin.from('push_tokens').select('token').eq('user_id', userId)
  if (error) {
    if (isMissingTableError(error)) return []
    throw error
  }
  return (data ?? []).map((row) => row.token as string)
}

export async function sendExpoPush(tokens: string[], message: PushMessage) {
  let sent = 0
  const invalidTokens: string[] = []

  for (let start = 0; start < tokens.length; start += EXPO_BATCH_SIZE) {
    const batch = tokens.slice(start, start + EXPO_BATCH_SIZE)
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch.map((to) => ({ to, sound: 'default', ...message }))),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`Expo retornou HTTP ${response.status}`)

    const payload = await response.json().catch(() => null)
    const tickets: any[] = Array.isArray(payload?.data) ? payload.data : []
    tickets.forEach((ticket, index) => {
      if (ticket?.status === 'ok') sent += 1
      else if (ticket?.details?.error === 'DeviceNotRegistered') invalidTokens.push(batch[index])
    })
  }
  return { sent, invalidTokens }
}

/** Retorna quantos aparelhos a Expo aceitou. Aparelho desinstalado sai da lista. */
export async function sendPushToUser(
  admin: Admin,
  user: { id: string; user_metadata?: Record<string, unknown> },
  message: PushMessage,
) {
  if (!wantsPushReminders(user)) return 0

  const tokens = await getPushTokens(admin, user.id)
  if (tokens.length === 0) return 0

  const { sent, invalidTokens } = await sendExpoPush(tokens, message)
  if (invalidTokens.length > 0) {
    const { error } = await admin
      .from('push_tokens')
      .delete()
      .eq('user_id', user.id)
      .in('token', invalidTokens)
    if (error) console.error('[Push] Falha ao remover aparelhos inválidos:', error)
  }
  return sent
}
