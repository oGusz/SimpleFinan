// Cálculos puros da carteira. Sem custo conhecido não há retorno: o resultado é null, nunca 0%.

export interface PositionLike {
  quantity: number
  price: number
  avgPrice?: number | null
  /** Nunca houve cotação: `price` pode ser o próprio preço médio, e o retorno daria um falso 0%. */
  quoteMissing?: boolean
}

export interface AssetReturn {
  pct: number
  amount: number
}

export interface PortfolioReturn extends AssetReturn {
  coveredAssets: number
  totalAssets: number
}

const isPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

// avg_price é NUMERIC(12,4) no banco: arredondar aqui mantém a tela igual ao que será relido.
const round4 = (value: number) => Math.round(value * 10000) / 10000

/**
 * Custo vindo do banco. Linhas antigas do Open Finance gravaram o preço atual em avg_price,
 * o que daria sempre 0% de retorno: nesse caso o custo é tratado como desconhecido.
 */
export function resolveAvgPrice(rawAvg: unknown, rawPrice: unknown, source: string): number | null {
  const avg = Number(rawAvg)
  if (!isPositive(avg)) return null
  if (source === 'open_finance' && round4(avg) === round4(Number(rawPrice))) return null
  return avg
}

export function assetReturn(asset: PositionLike): AssetReturn | null {
  if (asset.quoteMissing || !isPositive(asset.avgPrice) || !isPositive(asset.quantity) || !isPositive(asset.price)) {
    return null
  }
  return {
    pct: (asset.price / asset.avgPrice - 1) * 100,
    amount: (asset.price - asset.avgPrice) * asset.quantity,
  }
}

/** Considera só os ativos com custo conhecido; coveredAssets diz quantos entraram na conta. */
export function portfolioReturn(assets: PositionLike[]): PortfolioReturn | null {
  let cost = 0
  let amount = 0
  let coveredAssets = 0

  for (const asset of assets) {
    const result = assetReturn(asset)
    if (!result) continue
    cost += (asset.avgPrice as number) * asset.quantity
    amount += result.amount
    coveredAssets += 1
  }

  if (coveredAssets === 0) return null
  return { pct: (amount / cost) * 100, amount, coveredAssets, totalAssets: assets.length }
}

export function totalValue(assets: PositionLike[]): number {
  return assets.reduce((sum, asset) => {
    const value = asset.quantity * asset.price
    return Number.isFinite(value) ? sum + value : sum
  }, 0)
}

/** Sem o custo de uma das partes a média seria inventada, então o resultado é null. */
export function weightedAvgPrice(
  oldQty: number,
  oldAvg: number | null,
  addQty: number,
  addAvg: number | null
): number | null {
  if (!isPositive(oldQty)) return isPositive(addAvg) ? round4(addAvg) : null
  if (!isPositive(addQty)) return isPositive(oldAvg) ? round4(oldAvg) : null
  if (!isPositive(oldAvg) || !isPositive(addAvg)) return null
  return round4((oldQty * oldAvg + addQty * addAvg) / (oldQty + addQty))
}
