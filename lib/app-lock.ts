// Bloqueio local com Face ID/Touch ID via WebAuthn. Protege o app aberto em um celular
// emprestado ou perdido, mas não é autenticação: quem protege os dados é a sessão e o RLS.

const CREDENTIAL_KEY = '@simplefinan:lock-credential'

const randomBytes = (size: number) => crypto.getRandomValues(new Uint8Array(size))
const toBase64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

export function isLockEnabled() {
  return typeof window !== 'undefined' && Boolean(localStorage.getItem(CREDENTIAL_KEY))
}

export function disableLock() {
  localStorage.removeItem(CREDENTIAL_KEY)
}

export async function isLockSupported() {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false)
}

export async function enableLock() {
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

  if (!credential) throw new Error('Face ID não disponível')
  localStorage.setItem(CREDENTIAL_KEY, toBase64(credential.rawId))
}

export async function verifyLock() {
  const stored = localStorage.getItem(CREDENTIAL_KEY)
  if (!stored) return true

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: window.location.hostname,
      allowCredentials: [{ type: 'public-key', id: fromBase64(stored) }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })
  return Boolean(assertion)
}
