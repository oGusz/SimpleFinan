export interface MagicNumberResult {
  magicNumber: number
  remainingShares: number
  isGoalReached: boolean
  monthlyIncome: number
  progressPercent: number
}

export function calculateMagicNumber(
  price: number,
  lastDividend: number,
  currentQuantity: number
): MagicNumberResult | null {
  if (!price || !lastDividend || lastDividend <= 0) return null

  // Quantidade de cotas necessárias para comprar 1 cota por mês
  const magicNumber = Math.ceil(price / lastDividend)
  
  // Cotas que ainda faltam comprar
  const remainingShares = Math.max(0, magicNumber - currentQuantity)
  
  // Renda mensal atual gerada pelo ativo
  const monthlyIncome = currentQuantity * lastDividend
  
  // Se atingiu o número mágico
  const isGoalReached = currentQuantity >= magicNumber
  
  // Porcentagem de progresso até o Magic Number (máx 100%)
  const progressPercent = Math.min(100, (currentQuantity / magicNumber) * 100)

  return {
    magicNumber,
    remainingShares,
    isGoalReached,
    monthlyIncome,
    progressPercent,
  }
}