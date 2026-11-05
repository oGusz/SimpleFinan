import { safeRemove } from '@/lib/safe-storage'

/** Dados guardados no aparelho, que não podem ficar depois que a conta sai. */
export function clearAccountCache() {
  for (const key of [
    '@portfolio:assets',
    '@portfolio:assets:open_finance',
    '@portfolio:goal',
    '@portfolio:owner',
    '@portfolio:dividends',
    '@portfolio:quotes',
    '@simplefinan:mode',
    '@simplefinan:plan',
    '@simplefinan:analytics-consent',
    '@simplefinan:analytics-consent-pending',
    'carteira_sections_order_v1',
  ]) {
    safeRemove(key)
  }
}
