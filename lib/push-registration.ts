import { safeGet, safeRemove, safeSet } from '@/lib/safe-storage'

const TOKEN_KEY = '@simplefinan:push-token'
const UNREGISTER_TIMEOUT_MS = 3000

export function rememberPushToken(token: string) {
  safeSet(TOKEN_KEY, token)
}

/**
 * Chamar antes de sair da conta, enquanto a sessão existe. Uma falha aqui não impede a saída:
 * o token passa para quem entrar depois neste aparelho, e a rota de registro limpa o antigo.
 */
export async function unregisterPushToken() {
  const token = safeGet(TOKEN_KEY)
  if (!token) return
  safeRemove(TOKEN_KEY)
  try {
    const response = await fetch('/api/push/register', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(UNREGISTER_TIMEOUT_MS),
    })
    if (!response.ok) console.warn('Não foi possível remover o aparelho dos lembretes.', response.status)
  } catch (error) {
    console.warn('Não foi possível remover o aparelho dos lembretes.', error)
  }
}
