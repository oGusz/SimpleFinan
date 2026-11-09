import posthog from 'posthog-js'
import { safeGet, safeRemove, safeSet } from '@/lib/safe-storage'
import { createClient } from '@/lib/supabase/client'

// A escolha vale por conta: fica em user_metadata e é copiada para o aparelho.
// Sem escolha registrada, nada é medido. A cópia local também governa o Analytics da Vercel.
const CONSENT_KEY = '@simplefinan:analytics-consent'
const PENDING_KEY = '@simplefinan:analytics-consent-pending'
const PENDING_EVENTS_KEY = '@simplefinan:analytics-pending-events'
const MAX_PENDING_EVENTS = 5

export type AnalyticsConsent = 'granted' | 'denied'

const isConsent = (value: unknown): value is AnalyticsConsent => value === 'granted' || value === 'denied'

const listeners = new Set<() => void>()
let currentUserId: string | null = null

const isActive = () => typeof window !== 'undefined' && posthog.__loaded

export function getAnalyticsConsent(): AnalyticsConsent | null {
  const stored = safeGet(CONSENT_KEY)
  return isConsent(stored) ? stored : null
}

export function subscribeAnalyticsConsent(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function applyToPosthog(granted: boolean) {
  if (!isActive()) return
  try {
    if (granted) {
      posthog.opt_in_capturing({ captureEventName: false })
      posthog.startSessionRecording()
      if (currentUserId) posthog.identify(currentUserId)
    } else {
      posthog.stopSessionRecording()
      posthog.opt_out_capturing()
    }
  } catch (error) {
    console.warn('Não foi possível aplicar a escolha de métricas.', error)
  }
}

function storeChoice(choice: AnalyticsConsent) {
  safeSet(CONSENT_KEY, choice)
  applyToPosthog(choice === 'granted')
  listeners.forEach((listener) => listener())
  flushPendingEvents()
}

async function persistChoice(choice: AnalyticsConsent) {
  // A marca evita que a conta, ainda com o valor antigo, desfaça a escolha se o envio falhar.
  safeSet(PENDING_KEY, '1')
  try {
    const { error } = await createClient().auth.updateUser({ data: { analytics_consent: choice } })
    if (error) throw error
    safeRemove(PENDING_KEY)
  } catch (error) {
    console.warn('Não foi possível salvar a escolha de métricas na conta.', error)
  }
}

/** Roda logo depois de iniciar o PostHog, que nasce desligado a cada carregamento. */
export function applyStoredAnalyticsConsent() {
  applyToPosthog(getAnalyticsConsent() === 'granted')
}

/**
 * Concilia a escolha da conta com a do aparelho.
 * Devolve true quando a pessoa ainda não escolheu e precisa ver o pedido.
 */
export function syncAnalyticsConsent(accountChoice: unknown) {
  const needsChoice = reconcileConsent(accountChoice)
  if (!needsChoice) flushPendingEvents()
  return needsChoice
}

function reconcileConsent(accountChoice: unknown) {
  const local = getAnalyticsConsent()
  if (local && safeGet(PENDING_KEY)) {
    void persistChoice(local)
    return false
  }
  if (isConsent(accountChoice)) {
    if (accountChoice !== local) storeChoice(accountChoice)
    return false
  }
  if (local) {
    void persistChoice(local)
    return false
  }
  return true
}

/** Nunca envie valores, nomes de contas ou e-mail nas propriedades. */
export function track(event: string, properties?: Record<string, string | number | boolean>) {
  if (isActive() && isAnalyticsEnabled()) posthog.capture(event, properties)
}

type PendingEvent = { event: string; properties?: Record<string, string | number | boolean> }

function readPendingEvents(): PendingEvent[] {
  try {
    const parsed = JSON.parse(safeGet(PENDING_EVENTS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Para eventos da tela de login, onde a escolha da conta ainda não é conhecida. Fica só no aparelho
 * e sai quando a conta entrar: é enviado com consentimento e descartado sem ele.
 */
export function trackAfterLogin(event: string, properties?: Record<string, string | number | boolean>) {
  const events = [...readPendingEvents(), { event, properties }].slice(-MAX_PENDING_EVENTS)
  safeSet(PENDING_EVENTS_KEY, JSON.stringify(events))
}

function flushPendingEvents() {
  const consent = getAnalyticsConsent()
  if (!consent) return
  const events = readPendingEvents()
  safeRemove(PENDING_EVENTS_KEY)
  if (consent !== 'granted' || !isActive()) return
  for (const { event, properties } of events) posthog.capture(event, properties)
}

export function identifyUser(userId: string) {
  currentUserId = userId
  if (isActive() && isAnalyticsEnabled()) posthog.identify(userId)
}

export function resetAnalytics() {
  currentUserId = null
  safeRemove(CONSENT_KEY)
  safeRemove(PENDING_KEY)
  if (isActive()) {
    posthog.stopSessionRecording()
    posthog.reset()
  }
  listeners.forEach((listener) => listener())
}

export function isAnalyticsEnabled() {
  return getAnalyticsConsent() === 'granted'
}

/** Falso quando não há nada a medir: sem chave do PostHog e fora de produção, onde a Vercel não roda. */
export function isAnalyticsAvailable() {
  return isActive() || (typeof window !== 'undefined' && process.env.NODE_ENV === 'production')
}

export function setAnalyticsEnabled(enabled: boolean) {
  const choice: AnalyticsConsent = enabled ? 'granted' : 'denied'
  storeChoice(choice)
  void persistChoice(choice)
}
