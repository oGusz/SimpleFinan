import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeTicker } from '@/lib/tickers'

const MAX_TICKERS = 50

export async function GET(request: Request) {
  // Sem esta checagem, qualquer pessoa consumiria a cota do BRAPI_TOKEN.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const tickers = (searchParams.get('tickers') ?? '')
    .split(',')
    .map(normalizeTicker)
    .filter((ticker): ticker is string => ticker !== null)
    .slice(0, MAX_TICKERS)

  if (tickers.length === 0) {
    return NextResponse.json([])
  }

  try {
    const response = await fetch(
      `https://brapi.dev/api/quote/${tickers.join(',')}?token=${process.env.BRAPI_TOKEN}`
    )

    if (!response.ok) {
      return NextResponse.json([])
    }

    const data = await response.json()

    // Formata o retorno para o padrão [{ ticker: 'MXRF11', price: 10.25 }]
    const formattedQuotes = (data.results || []).map((item: any) => ({
      ticker: item.symbol,
      price: item.regularMarketPrice || 0,
    }))

    return NextResponse.json(formattedQuotes)
  } catch (error) {
    console.error('Erro ao buscar cotações:', error)
    return NextResponse.json([])
  }
}
