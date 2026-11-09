import 'server-only'

import { createHash, createHmac } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Guarda só o hash: a tabela não vira uma lista de e-mails e IPs.
 * Sem segredo, dá para descobrir o valor testando IPs e e-mails conhecidos; com ele, não.
 * Definir ou trocar o segredo só zera os contadores em andamento.
 */
export function rateLimitKey(scope: string, value: string) {
  const normalized = value.trim().toLowerCase()
  const secret = process.env.RATE_LIMIT_SECRET?.trim()
  const hash = secret ? createHmac('sha256', secret) : createHash('sha256')
  return `${scope}:${hash.update(normalized).digest('hex')}`
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
