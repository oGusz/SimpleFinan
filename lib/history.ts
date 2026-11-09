// Tipos do histórico real da carteira, compartilhados entre a rota e a tela.

export interface HistoryResponse {
  status: 'ok' | 'unavailable'
  premium: boolean
  /** Primeiro dia com foto da carteira. */
  since: string | null
  /** Quantos dias de pregão já foram registrados. */
  days: number
  lastValue: number | null
  points: { day: string; pct: number }[]
  cdi: { day: string; pct: number }[] | null
  ibov: { day: string; pct: number }[] | null
}

/** Com menos que isso, a comparação mostraria só ruído de um ou dois pregões. */
export const MIN_HISTORY_DAYS = 5
