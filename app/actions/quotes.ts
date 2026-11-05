'use server'

import { classifyFromBrapi, classifyFromName } from '@/lib/asset-classification'
import { fetchBrapiList, fetchBrapiQuote } from '@/lib/brapi'
import { fetchYahooQuote, parseBrapiQuotes } from '@/lib/market-data'
import { createClient } from '@/lib/supabase/server'
import { normalizeTicker } from '@/lib/tickers'

/** O tipo da Brapi é a melhor fonte: o Yahoo chama até FII de EQUITY. O nome fica como reserva. */
async function classifyTicker(ticker: string, name: string | null) {
  const list = await fetchBrapiList(ticker)
  const match = list?.find((item) => item.stock === ticker)
  return match ? classifyFromBrapi(match) : classifyFromName(name)
}

export async function getAssetQuote(ticker: string) {
  try {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getClaims()
    if (!auth) return { error: 'Usuário não autenticado.' }

    const cleanTicker = normalizeTicker(ticker)
    if (!cleanTicker) return { error: 'Informe um código de ativo válido.' }

    // Tentativa 1: Brapi API
    const response = await fetchBrapiQuote([cleanTicker]).catch(() => null)
    const quote = response?.ok
      ? parseBrapiQuotes(await response.json().catch(() => null))[0]
      : undefined

    if (quote) {
      return {
        success: true,
        data: {
          ticker: quote.ticker,
          name: quote.name || quote.ticker,
          price: quote.price,
          category: await classifyTicker(quote.ticker, quote.name),
          marketTime: quote.marketTime,
        },
      }
    }

    // Tentativa 2: Yahoo Finance Fallback
    const yahoo = await fetchYahooQuote(cleanTicker)
    if (yahoo) {
      return {
        success: true,
        data: {
          ticker: cleanTicker,
          name: yahoo.name || cleanTicker,
          price: yahoo.price,
          category: await classifyTicker(cleanTicker, yahoo.classifiableName),
          marketTime: yahoo.marketTime,
        },
      }
    }

    return { error: `Cotação não encontrada para "${cleanTicker}".` }
  } catch (error) {
    return { error: 'Falha ao buscar cotação.' }
  }
}
