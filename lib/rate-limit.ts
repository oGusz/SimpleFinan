import 'server-only'

import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/** Guarda só o hash: a tabela não vira uma lista de e-mails e IPs. */
export function rateLimitKey(scope: string, value: string) {
  const digest = createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
  return `${scope}:${digest}`
}

/**
 * Retorna false quando o limite estourou. Falha do banco libera o acesso: uma instabilidade
 * aqui não pode impedir todo mundo de entrar, e o Supabase Auth tem limites próprios.
 */
export async function consumeRateLimit(key: string, max: number, windowSeconds: number) {
  try {
    const { data, error } = await createAdminClient().rpc('consume_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    })
    if (error) throw error
    return data !== false
  } catch (error) {
    console.error('[RateLimit] Falha ao consultar limite:', error)
    return true
  }
}
