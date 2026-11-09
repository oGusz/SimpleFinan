// Regras dos alertas de preço, compartilhadas entre as ações do servidor e a tela.

export const MAX_ACTIVE_ALERTS = 20

export interface PriceAlert {
  id: string
  ticker: string
  direction: 'above' | 'below'
  target: number
  created_at: string
  triggered_at: string | null
  triggered_price: number | null
}
