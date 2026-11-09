import * as Sentry from '@sentry/nextjs'
import posthog from 'posthog-js'
import { applyStoredAnalyticsConsent } from '@/lib/analytics'
import { sentryOptions } from '@/lib/sentry-options'

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN

if (sentryOptions.dsn) Sentry.init(sentryOptions)

if (posthogToken) {
  posthog.init(posthogToken, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    defaults: '2026-08-30',
    person_profiles: 'identified_only',
    // Nada é capturado nem gravado até a pessoa permitir (lib/analytics.ts).
    opt_out_capturing_by_default: true,
    disable_session_recording: true,
    // App financeiro: textos, valores e campos nunca saem do aparelho nas gravações e cliques.
    mask_all_text: true,
    mask_all_element_attributes: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
    },
  })
  applyStoredAnalyticsConsent()
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
