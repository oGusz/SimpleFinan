import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeTicker } from '@/lib/tickers'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ticker: rawTicker } = await params
  const ticker = normalizeTicker(rawTicker || '')
  if (!ticker) {
    return NextResponse.json({ error: 'Código de ativo inválido' }, { status: 400 })
  }

  try {
    // Busca cotação e histórico de dividendos na Brapi
    const response = await fetch(
      `https://brapi.dev/api/quote/${ticker}?dividends=true&token=${process.env.BRAPI_TOKEN}`,
      { next: { revalidate: 3600 } } // Cache por 1 hora para dados de proventos
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Ativo não encontrado ou erro na API externa' },
        { status: 404 }
      )
    }

    const data = await response.json()
    const result = data.results?.[0]

    if (!result) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 404 })
    }

    // Identifica o último rendimento (dividendo) distribuído
    const dividendsHistory = result.dividendsData?.cashDividends || []
    const lastDividend = dividendsHistory.length > 0 ? dividendsHistory[0].rate : null

    return NextResponse.json({
      ticker: result.symbol,
      price: result.regularMarketPrice,
      lastDividend: lastDividend,
      updatedAt: result.regularMarketTime,
    })
  } catch (error) {
    console.error('Erro ao buscar cotação e dividendos:', error)
    return NextResponse.json(
      { error: 'Erro interno ao buscar dados do ativo' },
      { status: 500 }
    )
  }
}
