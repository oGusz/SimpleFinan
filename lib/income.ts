// Cálculos do radar de proventos. Tudo parte dos ativos que a pessoa já tem: nada aqui sugere compra.
// Proventos usam o histórico dos últimos 12 meses com a quantidade atual, e não garantem pagamentos futuros.

export interface IncomeEvent {
  date: string
  amount: number
}

export interface IncomeAsset {
  ticker: string
  quantity: number
  price: number
  avgPrice: number | null
  status: 'ok' | 'none' | 'unavailable' | undefined
  total12m: number | null
  events: IncomeEvent[]
}

export interface AssetIncome {
  ticker: string
  /** Proventos de 12 meses com a quantidade atual. */
  annual: number
  monthly: number
  /** Proventos de 12 meses sobre a cotação atual, em %. */
  currentYield: number | null
  /** Proventos de 12 meses sobre o preço médio pago, em %. */
  yieldOnCost: number | null
  /** Meses (1 a 12) em que houve data ex nos últimos 12 meses. */
  paymentMonths: number[]
  /** Fatia dos proventos da carteira que vem deste ativo, em %. */
  shareOfIncome: number
}

export interface IncomeSummary {
  annual: number
  monthly: number
  /** Proventos sobre o valor atual dos ativos com histórico conhecido, em %. */
  portfolioYield: number | null
  /** Ativos de bolsa sem histórico disponível: ficam fora das contas e são informados. */
  unavailable: string[]
  assets: AssetIncome[]
  /** Últimos 12 meses fechados, do mais antigo ao mais recente. */
  months: { month: string; amount: number }[]
}

const isPositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0

function previousMonths(today: string, count: number) {
  const [year, month] = today.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - count + index, 1))
    return date.toISOString().slice(0, 7)
  })
}

export function summarizeIncome(assets: IncomeAsset[], today: string): IncomeSummary {
  const months = previousMonths(today, 12)
  const byMonth = new Map(months.map((month) => [month, 0]))
  const unavailable: string[] = []
  let coveredValue = 0
  const rows: Omit<AssetIncome, 'shareOfIncome'>[] = []

  for (const asset of assets) {
    if (asset.status === 'unavailable' || asset.status === undefined) {
      unavailable.push(asset.ticker)
      continue
    }
    if (!isPositive(asset.quantity)) continue

    const perShare = asset.status === 'ok' && isPositive(asset.total12m) ? asset.total12m : 0
    const annual = perShare * asset.quantity
    if (isPositive(asset.price)) coveredValue += asset.price * asset.quantity

    for (const event of asset.events) {
      const month = event.date.slice(0, 7)
      if (byMonth.has(month)) byMonth.set(month, (byMonth.get(month) ?? 0) + event.amount * asset.quantity)
    }

    rows.push({
      ticker: asset.ticker,
      annual,
      monthly: annual / 12,
      currentYield: isPositive(asset.price) && perShare > 0 ? (perShare / asset.price) * 100 : perShare === 0 ? 0 : null,
      yieldOnCost: isPositive(asset.avgPrice) ? (perShare / asset.avgPrice) * 100 : null,
      paymentMonths: [...new Set(asset.events.map((event) => Number(event.date.slice(5, 7))))].sort((a, b) => a - b),
    })
  }

  const annual = rows.reduce((sum, row) => sum + row.annual, 0)
  return {
    annual,
    monthly: annual / 12,
    portfolioYield: coveredValue > 0 ? (annual / coveredValue) * 100 : null,
    unavailable,
    assets: rows
      .map((row) => ({ ...row, shareOfIncome: annual > 0 ? (row.annual / annual) * 100 : 0 }))
      .sort((a, b) => b.annual - a.annual),
    months: months.map((month) => ({ month, amount: byMonth.get(month) ?? 0 })),
  }
}

export interface IncomeGoalPlan {
  /** Patrimônio que, no rendimento atual da carteira, pagaria a renda desejada. */
  neededCapital: number
  missing: number
  /** Meses de aporte até cobrir o que falta, sem valorização nem reinvestimento. null sem aporte. */
  monthsToGoal: number | null
}

/**
 * Quanto investir para receber `targetMonthly` por mês se a carteira mantiver o rendimento
 * dos últimos 12 meses. Conta simples de propósito: é uma referência, não uma projeção.
 */
export function planIncomeGoal(
  targetMonthly: number,
  portfolioYield: number | null,
  currentValue: number,
  monthlyContribution: number,
): IncomeGoalPlan | null {
  if (!isPositive(targetMonthly) || !isPositive(portfolioYield)) return null
  const neededCapital = (targetMonthly * 12) / (portfolioYield / 100)
  const missing = Math.max(0, neededCapital - Math.max(0, currentValue))
  return {
    neededCapital,
    missing,
    monthsToGoal: missing === 0 ? 0 : isPositive(monthlyContribution) ? Math.ceil(missing / monthlyContribution) : null,
  }
}

export interface Concentration {
  ticker: string
  share: number
}

/** Ativos que respondem por uma fatia grande da renda: informação, não recomendação. */
export function incomeConcentration(summary: IncomeSummary, threshold = 40): Concentration[] {
  if (summary.annual <= 0 || summary.assets.length < 2) return []
  return summary.assets
    .filter((asset) => asset.shareOfIncome >= threshold)
    .map((asset) => ({ ticker: asset.ticker, share: asset.shareOfIncome }))
}
