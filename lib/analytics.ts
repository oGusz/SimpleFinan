import posthog from 'posthog-js'

// Sem a chave do PostHog no ambiente, nada é iniciado e estas funções não fazem nada.
const isActive = () => typeof window !== 'undefined' && posthog.__loaded

/** Nunca envie valores, nomes de contas ou e-mail nas propriedades. */
export function track(event: string, properties?: Record<string, string | number | boolean>) {
  if (isActive()) posthog.capture(event, properties)
}

export function identifyUser(userId: string) {
  if (isActive()) posthog.identify(userId)
}

export function resetAnalytics() {
  if (isActive()) posthog.reset()
}

export function isAnalyticsEnabled() {
  return isActive() && !posthog.has_opted_out_capturing()
}

export function isAnalyticsAvailable() {
  return isActive()
}

export function setAnalyticsEnabled(enabled: boolean) {
  if (!isActive()) return
  if (enabled) posthog.opt_in_capturing()
  else posthog.opt_out_capturing()
}
