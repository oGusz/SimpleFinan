import 'server-only'

const TIMEOUT_MS = 10_000
const CACHE_SECONDS = 60

/**
 * O token vai no cabeçalho, e não na URL, para não aparecer em logs. O cache de 60 segundos
 * é compartilhado: várias pessoas com o mesmo ativo gastam uma consulta só da cota.
 */
export function fetchBrapiQuote(tickers: string[]) {
  return fetch(`https://brapi.dev/api/quote/${tickers.join(',')}`, {
    headers: { Authorization: `Bearer ${process.env.BRAPI_TOKEN?.trim()}` },
    next: { revalidate: CACHE_SECONDS },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}
