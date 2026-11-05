import 'server-only'

const TIMEOUT_MS = 8_000
const CACHE_SECONDS = 60
const SEARCH_CACHE_SECONDS = 3_600
const SEARCH_LIMIT = 20

export interface BrapiListItem {
  stock: string
  name: string | null
  type: string | null
  subType: string | null
}

function brapiHeaders(): Record<string, string> {
  // Sem token a Brapi ainda atende a busca: 'Bearer undefined' faria a chamada ser recusada.
  const token = process.env.BRAPI_TOKEN?.trim()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * O token vai no cabeçalho, e não na URL, para não aparecer em logs. O cache de 60 segundos
 * é compartilhado: várias pessoas com o mesmo ativo gastam uma consulta só da cota.
 */
export function fetchBrapiQuote(tickers: string[]) {
  return fetch(`https://brapi.dev/api/quote/${tickers.join(',')}`, {
    headers: brapiHeaders(),
    next: { revalidate: CACHE_SECONDS },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

async function fetchSearchJson(url: string): Promise<any | null> {
  try {
    const response = await fetch(url, {
      headers: brapiHeaders(),
      next: { revalidate: SEARCH_CACHE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return response.ok ? await response.json() : null
  } catch (error) {
    console.error('[Brapi] Falha na busca de ativos:', error)
    return null
  }
}

/** Traz nome, tipo e subtipo de cada ativo. Retorna null em falha, para diferenciar de busca sem resultado. */
export async function fetchBrapiList(search: string): Promise<BrapiListItem[] | null> {
  const data = await fetchSearchJson(
    `https://brapi.dev/api/quote/list?search=${encodeURIComponent(search)}&limit=${SEARCH_LIMIT}`,
  )
  if (!Array.isArray(data?.stocks)) return null

  return data.stocks
    .filter((item: any) => typeof item?.stock === 'string')
    .map((item: any) => ({
      stock: item.stock,
      name: item.name ?? null,
      type: item.type ?? null,
      subType: item.subType ?? null,
    }))
}

/** Reserva da busca: só devolve códigos, sem nome nem tipo. */
export async function fetchBrapiAvailable(search: string): Promise<string[] | null> {
  const data = await fetchSearchJson(
    `https://brapi.dev/api/available?search=${encodeURIComponent(search)}`,
  )
  if (!Array.isArray(data?.stocks)) return null
  return data.stocks.filter((ticker: unknown): ticker is string => typeof ticker === 'string')
}
