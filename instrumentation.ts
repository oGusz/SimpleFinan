import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from '@/lib/sentry-options'

export async function register() {
  // O mesmo init serve aos runtimes Node e Edge.
  if (sentryOptions.dsn) Sentry.init(sentryOptions)
}

export const onRequestError = Sentry.captureRequestError
