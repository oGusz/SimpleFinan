// Ponte com o app nativo (WebView). Fora dele, e no servidor, tudo aqui é inofensivo.

export type NativeInfo = { platform: 'ios' | 'android'; biometric: boolean; version: string | null }

export type NativeMessage =
  | { type: 'offerings'; userId: string }
  | { type: 'purchase'; userId: string; packageId: string }
  | { type: 'restore'; userId: string }
  | { type: 'biometric-auth'; requestId: string }
  | { type: 'push-register' }
  | { type: 'push-sync' }
  | { type: 'haptic' }

export type NativePackage = {
  identifier: string
  title: string
  priceString: string
  period: string
  introPrice?: string
  /** Duração de cada ciclo da oferta, em ISO 8601 (P7D, P1M). */
  introPeriod?: string
  introCycles?: number
}

export type NativeEventMap = {
  'simplefinan:iap': { status: 'success' | 'restored' | 'nothing_to_restore' | 'cancelled' | 'error'; message?: string }
  'simplefinan:offerings': { status: 'ok' | 'empty' | 'error'; packages: NativePackage[] }
  'simplefinan:biometric': { requestId: string; success: boolean; available: boolean }
  'simplefinan:push-token': { token: string; platform: string }
  'simplefinan:back': null
}

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void }
    __SIMPLEFINAN_NATIVE__?: { platform?: unknown; biometric?: unknown; version?: unknown }
  }
}

const BIOMETRIC_TIMEOUT_MS = 60_000

export function isNativeApp() {
  return typeof window !== 'undefined' && Boolean(window.ReactNativeWebView)
}

export function getNativeInfo(): NativeInfo | null {
  if (typeof window === 'undefined') return null
  const info = window.__SIMPLEFINAN_NATIVE__
  if (!info || (info.platform !== 'ios' && info.platform !== 'android')) return null
  return {
    platform: info.platform,
    biometric: info.biometric === true,
    version: typeof info.version === 'string' ? info.version : null,
  }
}

/** Devolve false quando não há app nativo para receber a mensagem. */
export function postToNative(message: NativeMessage) {
  if (!isNativeApp()) return false
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(message))
    return true
  } catch {
    return false
  }
}

export function onNativeEvent<K extends keyof NativeEventMap>(
  name: K,
  handler: (detail: NativeEventMap[K]) => void,
) {
  if (typeof window === 'undefined') return () => {}
  const listener = (event: Event) => handler((event as CustomEvent<NativeEventMap[K]>).detail)
  window.addEventListener(name, listener)
  return () => window.removeEventListener(name, listener)
}

export function requestNativeBiometric(): Promise<{ success: boolean; available: boolean }> {
  if (!isNativeApp()) return Promise.resolve({ success: false, available: false })

  const requestId = `bio-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return new Promise((resolve) => {
    // Sem resposta, o resultado é falha com biometria disponível: quem chama nunca deve destravar.
    const timer = setTimeout(() => finish({ success: false, available: true }), BIOMETRIC_TIMEOUT_MS)
    const unsubscribe = onNativeEvent('simplefinan:biometric', (detail) => {
      if (detail?.requestId === requestId) {
        finish({ success: detail.success === true, available: detail.available === true })
      }
    })
    function finish(result: { success: boolean; available: boolean }) {
      clearTimeout(timer)
      unsubscribe()
      resolve(result)
    }
    if (!postToNative({ type: 'biometric-auth', requestId })) finish({ success: false, available: false })
  })
}

export function requestPushRegistration() {
  return postToNative({ type: 'push-register' })
}
