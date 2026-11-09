'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { onNativeEvent, postToNative, type NativeEventMap } from '@/lib/native-bridge'
import { rememberPushToken } from '@/lib/push-registration'

export function NativePushListener() {
  const pathname = usePathname()
  const pending = useRef<NativeEventMap['simplefinan:push-token'] | null>(null)

  const register = useCallback(async () => {
    const detail = pending.current
    if (!detail) return
    try {
      const response = await fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: detail.token, platform: detail.platform }),
      })
      if (response.ok) pending.current = null
      else console.warn('Não foi possível registrar as notificações.', response.status)
    } catch (error) {
      console.warn('Não foi possível registrar as notificações.', error)
    }
  }, [])

  useEffect(
    () =>
      onNativeEvent('simplefinan:push-token', (detail) => {
        rememberPushToken(detail.token)
        pending.current = detail
        void register()
      }),
    [register],
  )

  // O evento que o app manda depois do login pode chegar antes desta montagem. Sem pedir permissão.
  useEffect(() => {
    postToNative({ type: 'push-sync' })
  }, [])

  // O token pode chegar antes do login, quando a rota responde 401; tenta de novo ao mudar de tela.
  useEffect(() => {
    void register()
  }, [pathname, register])

  return null
}
