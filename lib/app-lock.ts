// Bloqueio local por biometria. Protege o app aberto em um celular emprestado ou perdido,
// mas não é autenticação: quem protege os dados é a sessão e o RLS.
// No app nativo quem confirma é o aparelho, pela ponte: WebAuthn na WebView depende de domínio
// associado, que o app não tem. Por isso WebAuthn fica só no navegador.

import { getNativeInfo, isNativeApp, requestNativeBiometric } from '@/lib/native-bridge'
import { safeGet, safeRemove, safeSet } from '@/lib/safe-storage'

const CREDENTIAL_KEY = '@simplefinan:lock-credential'
const NATIVE_MARKER = 'native'

export type LockResult = 'ok' | 'failed' | 'unavailable'

const randomBytes = (size: number) => crypto.getRandomValues(new Uint8Array(size))
const toBase64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

export function isLockEnabled() {
  return Boolean(safeGet(CREDENTIAL_KEY))
}

export function disableLock() {
  safeRemove(CREDENTIAL_KEY)
}

export async function isLockSupported() {
  if (typeof window === 'undefined') return false
  if (isNativeApp()) return getNativeInfo()?.biometric === true
  if (!window.PublicKeyCredential) return false
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false)
}

async function confirmOnDevice(): Promise<LockResult> {
  if (getNativeInfo()?.biometric !== true) return 'unavailable'
  const { success, available } = await requestNativeBiometric()
  if (success) return 'ok'
  return available ? 'failed' : 'unavailable'
}

export async function enableLock(): Promise<LockResult> {
  if (isNativeApp()) {
    const result = await confirmOnDevice()
    if (result !== 'ok') return result
    return safeSet(CREDENTIAL_KEY, NATIVE_MARKER) ? 'ok' : 'failed'
  }

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: 'SimpleFinan', id: window.location.hostname },
        user: { id: randomBytes(16), name: 'SimpleFinan', displayName: 'SimpleFinan' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged',
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null

    if (!credential) return 'failed'
    return safeSet(CREDENTIAL_KEY, toBase64(credential.rawId)) ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}

export async function verifyLock(): Promise<LockResult> {
  const stored = safeGet(CREDENTIAL_KEY)
  if (!stored) return 'ok'
  if (isNativeApp()) return confirmOnDevice()
  if (stored === NATIVE_MARKER) return 'unavailable'

  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        rpId: window.location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromBase64(stored) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return assertion ? 'ok' : 'failed'
  } catch {
    return 'failed'
  }
}
