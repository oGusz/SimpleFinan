export interface FIIAsset {
  ticker: string
  name: string
  quantity: number
  price: number
  pvp?: number // Preço sobre Valor Patrimonial (ex: 0.85 = 15% de desconto)
  category?: 'TIJOLO_DESCONTO' | 'PAPEL_HY' | 'DESENVOLVIMENTO' | 'OUTROS'
  targetAllocation: number // Porcentagem meta (ex: 15 para 15%)
}

export interface RebalanceRecommendation {
  ticker: string
  name: string
  currentQuantity: number
  currentValue: number
  currentPercent: number
  targetPercent: number
  suggestedQuantityToBuy: number
  suggestedInvestment: number
  newPercentAfterAporte: number
  pvpAlert?: string
}

export function calculateFiiRebalance(
  assets: FIIAsset[],
  aporteAmount: number
): RebalanceRecommendation[] {
  const currentTotalValue = assets.reduce(
    (acc, item) => acc + item.quantity * item.price,
    0
  )
  const totalFutureValue = currentTotalValue + aporteAmount

  if (totalFutureValue === 0) return []

  let remainingAporte = aporteAmount

  // 1. Calcula o estado atual e a necessidade teórica de aporte por ativo
  const draftRecommendations = assets.map((asset) => {
    const currentValue = asset.quantity * asset.price
    const currentPercent = currentTotalValue > 0 ? (currentValue / currentTotalValue) * 100 : 0
    
    // Valor total ideal que o ativo deveria ter após o aporte completo
    const targetValue = (totalFutureValue * asset.targetAllocation) / 100
    
    // Valor necessário para atingir a meta
    const neededAmount = Math.max(0, targetValue - currentValue)

    // Alerta de P/VP para evitar comprar Tijolo muito esticado (P/VP > 1.05)
    let pvpAlert: string | undefined
    if (asset.pvp && asset.pvp > 1.05 && asset.category === 'TIJOLO_DESCONTO') {
      pvpAlert = 'P/VP alto para ganho de capital (> 1.05)'
    }

    return {
      ticker: asset.ticker,
      name: asset.name,
      price: asset.price,
      currentQuantity: asset.quantity,
      currentValue,
      currentPercent,
      targetPercent: asset.targetAllocation,
      neededAmount,
      suggestedQuantityToBuy: 0,
      suggestedInvestment: 0,
      newPercentAfterAporte: 0,
      pvpAlert,
    }
  })

  // 2. Ordena priorizando quem está mais "atrás" da meta e com P/VP mais atraente (menor P/VP)
  draftRecommendations.sort((a, b) => b.neededAmount - a.neededAmount)

  // 3. Distribuição gulosa do aporte disponível em cotas inteiras
  draftRecommendations.forEach((rec) => {
    if (remainingAporte <= 0 || rec.price <= 0) return

    // Quanto podemos aportar neste ativo sem estourar o restante nem a meta individual
    const maxToInvestInAsset = Math.min(remainingAporte, rec.neededAmount)
    const cotasToBuy = Math.floor(maxToInvestInAsset / rec.price)

    if (cotasToBuy > 0) {
      const investmentAmount = cotasToBuy * rec.price
      rec.suggestedQuantityToBuy = cotasToBuy
      rec.suggestedInvestment = investmentAmount
      remainingAporte -= investmentAmount
    }
  })

  // 4. Se ainda sobrou troco do aporte que não compra 1 cota dos mais necessitados, tenta encaixar nos demais
  if (remainingAporte > 0) {
    draftRecommendations.forEach((rec) => {
      if (remainingAporte >= rec.price && rec.price > 0) {
        const extraCotas = Math.floor(remainingAporte / rec.price)
        rec.suggestedQuantityToBuy += extraCotas
        rec.suggestedInvestment += extraCotas * rec.price
        remainingAporte -= extraCotas * rec.price
      }
    })
  }

  // 5. Finaliza o cálculo das novas porcentagens projetadas pós-aporte
  return draftRecommendations.map((rec) => {
    const newValue = rec.currentValue + rec.suggestedInvestment
    const newPercentAfterAporte = (newValue / totalFutureValue) * 100

    return {
      ticker: rec.ticker,
      name: rec.name,
      currentQuantity: rec.currentQuantity,
      currentValue: rec.currentValue,
      currentPercent: rec.currentPercent,
      targetPercent: rec.targetPercent,
      suggestedQuantityToBuy: rec.suggestedQuantityToBuy,
      suggestedInvestment: rec.suggestedInvestment,
      newPercentAfterAporte,
      pvpAlert: rec.pvpAlert,
    }
  })
}