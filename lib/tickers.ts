// O ticker entra na URL de APIs externas: formatos inesperados nunca chegam até lá.
const VALID_TICKER = /^[A-Z0-9][A-Z0-9.-]{0,14}$/

export function normalizeTicker(raw: string): string | null {
  const ticker = raw.trim().toUpperCase()
  return VALID_TICKER.test(ticker) ? ticker : null
}
