import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // Pega o parâmetro "tickers" enviado pelo PortfolioContext
  const tickers = searchParams.get('tickers')

  if (!tickers) {
    return NextResponse.json([])
  }

  try {
    // Exemplo buscando da Brapi (Substitua pela URL / API key que você utiliza)
    const token = process.env.BRAPI_TOKEN // ou coloque seu token direto se for dev
    const response = await fetch(
      `https://brapi.dev/api/quote/${tickers}?token=${token}`
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