// Tipos e regras da aba de notícias, compartilhados entre a rota e a tela.

/** Quem não é Premium vê os mais recentes e quantos ficaram de fora, para saber o que está perdendo. */
export const FREE_NEWS_PREVIEW = 3

export interface NewsItem {
  protocol: string
  company: string
  tickers: string[]
  category: string
  subject: string
  delivered_on: string
  url: string
}

export interface NewsResponse {
  status: 'ok' | 'unavailable'
  premium: boolean
  items: NewsItem[]
  locked: number
}

export const NEWS_CATEGORY_LABELS: Record<string, string> = {
  'Fato Relevante': 'Fato relevante',
  'Comunicado ao Mercado': 'Comunicado',
  'Aviso aos Acionistas': 'Aviso aos acionistas',
}
