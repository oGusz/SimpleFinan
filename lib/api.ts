import { categorizeFIISegment } from './fiiSegment'

export async function fetchAssetData(ticker: string) {
    const cleanTicker = ticker.trim().toUpperCase()

    try {
        // Consulta a API da Brapi
        const res = await fetch(`https://brapi.dev/api/quotes/${cleanTicker}`)

        if (!res.ok) {
            throw new Error('Ativo não encontrado')
        }

        const data = await res.json()
        const result = data.results?.[0]

        if (!result) {
            throw new Error('Dados do ativo indisponíveis')
        }

        // Extrai o segmento do retorno da API
        const rawSector = result.sector || result.segment || ''
        const shortName = result.shortName || ''

        // Classificação automática
        const segment = categorizeFIISegment(cleanTicker, rawSector, shortName)

        return {
            ticker: cleanTicker,
            name: shortName || cleanTicker,
            price: result.regularMarketPrice || 0,
            segment, // Categorizado automaticamente!
        }
    } catch (error) {
        console.error('Erro ao buscar dados do ativo:', error)
        return null
    }
}