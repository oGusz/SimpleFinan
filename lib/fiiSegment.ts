// /lib/fiiSegment.ts

export type FIISegment = 'Tijolo' | 'Papel' | 'Agronegócio' | 'FOF'

/**
 * Mapeia a resposta da API (setor, segmento ou nome curto) para as 4 categorias do gráfico.
 */
export function categorizeFIISegment(
  ticker: string,
  rawSectorOrSegment?: string,
  shortName?: string
): FIISegment {
  const textToSearch = `${ticker} ${rawSectorOrSegment || ''} ${shortName || ''}`.toLowerCase()

  // 1. Agronegócio / Fiagro
  if (
    textToSearch.includes('agro') ||
    textToSearch.includes('fiagro') ||
    textToSearch.includes('agronegocio')
  ) {
    return 'Agronegócio'
  }

  // 2. FOFs (Fundos de Fundos)
  if (
    textToSearch.includes('fof') ||
    textToSearch.includes('fundo de fundo') ||
    textToSearch.includes('titulos e valores') ||
    textToSearch.includes('títulos e valores')
  ) {
    return 'FOF'
  }

  // 3. Papel (CRI / Recebíveis)
  if (
    textToSearch.includes('papel') ||
    textToSearch.includes('recebiveis') ||
    textToSearch.includes('recebíveis') ||
    textToSearch.includes('cri') ||
    textToSearch.includes('credito imobiliario')
  ) {
    return 'Papel'
  }

  // 4. Tijolo (Logística, Shopping, Lajes Corporativas, Renda Urbana, Hospital, Varejo, etc)
  return 'Tijolo'
}