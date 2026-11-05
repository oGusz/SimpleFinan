import { beforeEach, describe, expect, it, vi } from 'vitest'

const posthog = vi.hoisted(() => ({
  __loaded: true,
  capture: vi.fn(),
  identify: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
}))

vi.mock('posthog-js', () => ({ default: posthog }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { updateUser: async () => ({ error: null }) } }),
}))

import { resetAnalytics, setAnalyticsEnabled, syncAnalyticsConsent, trackAfterLogin } from '@/lib/analytics'

beforeEach(() => {
  vi.clearAllMocks()
  const store = new Map<string, string>()
  vi.stubGlobal('window', {})
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  })
})

describe('eventos da tela de login', () => {
  it('saem quando a conta já tinha aceitado, mesmo com o consentimento apagado pelo login', () => {
    resetAnalytics()
    trackAfterLogin('login_completed')
    expect(posthog.capture).not.toHaveBeenCalled()

    expect(syncAnalyticsConsent('granted')).toBe(false)
    expect(posthog.capture).toHaveBeenCalledExactlyOnceWith('login_completed', undefined)

    syncAnalyticsConsent('granted')
    expect(posthog.capture).toHaveBeenCalledTimes(1)
  })

  it('são descartados quando a conta recusou', () => {
    resetAnalytics()
    trackAfterLogin('login_completed')
    syncAnalyticsConsent('denied')
    setAnalyticsEnabled(true)
    expect(posthog.capture).not.toHaveBeenCalled()
  })

  it('esperam a primeira escolha e só saem se a pessoa permitir', () => {
    resetAnalytics()
    trackAfterLogin('oauth_started', { provider: 'google' })
    expect(syncAnalyticsConsent(undefined)).toBe(true)
    expect(posthog.capture).not.toHaveBeenCalled()

    setAnalyticsEnabled(true)
    expect(posthog.capture).toHaveBeenCalledExactlyOnceWith('oauth_started', { provider: 'google' })
  })
})
