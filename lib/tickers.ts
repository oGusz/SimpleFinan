// O ticker entra na URL de APIs externas: formatos inesperados nunca chegam até lá.
const VALID_TICKER = /^[A-Z0-9][A-Z0-9.-]{0,14}$/
const EXCHANGE_TICKER = /^[A-Z]{4}\d{1,2}[A-Z]?$/

/** Prefixo dos ativos cujo valor a própria pessoa informa, sem cotação de mercado. */
export const MANUAL_VALUE_PREFIX = '_RF-'

export function normalizeTicker(raw: string): string | null {
  const ticker = raw.trim().toUpperCase()
  return VALID_TICKER.test(ticker) ? ticker : null
}

/** Separa códigos da B3 de nomes vindos do Open Finance, como 'CDB-BANCO-XP', que não têm cotação. */
export function isExchangeTicker(ticker: string): boolean {
  return EXCHANGE_TICKER.test(ticker)
}

export function isManualValueTicker(ticker: string): boolean {
  return ticker.startsWith(MANUAL_VALUE_PREFIX)
}

/**
 * Lê o parâmetro 'A,B,C' das rotas de mercado: só códigos de bolsa, sem repetição e com teto.
 * O que passa do teto volta em overflow, para a rota avisar em vez de sumir com o ativo em silêncio.
 */
export function parseExchangeTickers(
  raw: string | null,
  max: number,
): { tickers: string[]; overflow: string[] } {
  const valid = (raw ?? '')
    .split(',')
    .map(normalizeTicker)
    .filter((ticker): ticker is string => ticker !== null && isExchangeTicker(ticker))
  const unique = [...new Set(valid)]
  return { tickers: unique.slice(0, max), overflow: unique.slice(max) }
}
