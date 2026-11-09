'use client'

import { useSyncExternalStore } from 'react'
import { Analytics } from '@vercel/analytics/next'
import { getAnalyticsConsent, isAnalyticsEnabled, subscribeAnalyticsConsent } from '@/lib/analytics'

// O script da Vercel continua na página depois de injetado, mesmo sem o componente.
// Por isso a escolha também é conferida a cada evento, valendo quando a pessoa desliga.
function dropWithoutConsent<T>(event: T) {
  return isAnalyticsEnabled() ? event : null
}

export function AnalyticsGate() {
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, getAnalyticsConsent, () => null)
  if (process.env.NODE_ENV !== 'production' || consent !== 'granted') return null
  return <Analytics beforeSend={dropWithoutConsent} />
}
