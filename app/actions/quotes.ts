'use server'

// Lista local com os principais FIIs e Ações da B3 para autocompletar instantâneo
const POPULAR_ASSETS = [
  // FIIs
  { ticker: 'MXRF11', name: 'Màuá Capital Hedge Fund', type: 'FII' },
  { ticker: 'XPML11', name: 'XP Malls', type: 'FII' },
  { ticker: 'HGLG11', name: 'CSG HG Logística', type: 'FII' },
  { ticker: 'KNCR11', name: 'Kinea Rendimentos Imobiliários', type: 'FII' },
  { ticker: 'KNSC11', name: 'Kinea Securities', type: 'FII' },
  { ticker: 'VISC11', name: 'Vinci Shopping Centers', type: 'FII' },
  { ticker: 'BCCR11', name: 'BC Fund', type: 'FII' },
  { ticker: 'BTLG11', name: 'BTG Pactual Logística', type: 'FII' },
  { ticker: 'TGAR11', name: 'TG Ativo Real', type: 'FII' },
  { ticker: 'XPIN11', name: 'XP Industrial', type: 'FII' },
  { ticker: 'MCCI11', name: 'Màuá Capital Recebíveis', type: 'FII' },
  { ticker: 'MALU11', name: 'Màuá Capital High Yield', type: 'FII' },
  { ticker: 'CPTS11', name: 'Capitânia Securities II', type: 'FII' },
  { ticker: 'RECR11', name: 'Rec Recebíveis Imobiliários', type: 'FII' },
  { ticker: 'IRDM11', name: 'Iridium Recebíveis Imobiliários', type: 'FII' },
  { ticker: 'VGHF11', name: 'Valora Hedge Fund', type: 'FII' },
  
  // Ações Principais
  { ticker: 'PETR4', name: 'Petrobras PN', type: 'Ações' },
  { ticker: 'VALE3', name: 'Vale ON', type: 'Ações' },
  { ticker: 'ITUB4', name: 'Itaú Unibanco PN', type: 'Ações' },
  { ticker: 'BBAS3', name: 'Banco do Brasil ON', type: 'Ações' },
  { ticker: 'BBDC4', name: 'Bradesco PN', type: 'Ações' },
  { ticker: 'MGLU3', name: 'Magazine Luiza ON', type: 'Ações' },
]

// Define o formato completo de um ativo na carteira
export interface AssetPosition {
  id: string
  ticker: string
  name: string
  quantity: number
  price: number // Cotação atual
  avgPrice: number // Preço médio pago
  totalValue: number
  type: 'FII' | 'Ações'
  dividendYieldAvg?: number // DY Anual estimado (%)
}

export interface PortfolioGoal {
  targetAmount: number // Ex: 10000
  targetYear: number // Ex: 2026
}

export async function searchAssets(query: string) {
  const cleanQuery = query.trim().toUpperCase()
  if (!cleanQuery) return []

  // Filtra por Ticker ou Nome que comece ou contenha o que foi digitado
  return POPULAR_ASSETS.filter(
    (asset) =>
      asset.ticker.startsWith(cleanQuery) ||
      asset.name.toUpperCase().includes(cleanQuery)
  ).slice(0, 6) // Retorna até 6 sugestões
}

export async function getAssetQuote(ticker: string) {
  try {
    const cleanTicker = ticker.trim().toUpperCase()
    if (!cleanTicker) return { error: 'Informe o código do ativo.' }

    // Tentativa 1: Brapi API
    const response = await fetch(`https://brapi.dev/api/quotes/${cleanTicker}?token=public`, {
      next: { revalidate: 60 },
    })

    if (response.ok) {
      const data = await response.json()
      const result = data.results?.[0]
      if (result?.regularMarketPrice) {
        return {
          success: true,
          data: {
            ticker: result.symbol,
            name: result.longName || result.symbol,
            price: result.regularMarketPrice,
          },
        }
      }
    }

    // Tentativa 2: Yahoo Finance Fallback
    const yahooRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${cleanTicker}.SA`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })

    if (yahooRes.ok) {
      const yahooData = await yahooRes.json()
      const meta = yahooData.chart?.result?.[0]?.meta
      if (meta?.regularMarketPrice) {
        return {
          success: true,
          data: {
            ticker: cleanTicker,
            name: meta.shortName || meta.symbol || cleanTicker,
            price: meta.regularMarketPrice,
          },
        }
      }
    }

    return { error: `Cotação não encontrada para "${cleanTicker}".` }
  } catch (error) {
    return { error: 'Falha ao buscar cotação.' }
  }
}