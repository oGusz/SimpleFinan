import { describe, expect, it } from 'vitest'
import { incomeConcentration, planIncomeGoal, summarizeIncome, type IncomeAsset } from '@/lib/income'

const TODAY = '2026-11-09'

const mxrf: IncomeAsset = {
  ticker: 'MXRF11',
  quantity: 100,
  price: 10,
  avgPrice: 9.5,
  status: 'ok',
  total12m: 1.2,
  events: Array.from({ length: 12 }, (_, index) => ({
    date: `${index < 1 ? '2025' : '2026'}-${String(((index + 10) % 12) + 1).padStart(2, '0')}-15`,
    amount: 0.1,
  })),
}

const petr: IncomeAsset = {
  ticker: 'PETR4',
  quantity: 10,
  price: 40,
  avgPrice: null,
  status: 'ok',
  total12m: 4,
  events: [
    { date: '2026-02-20', amount: 2 },
    { date: '2026-08-20', amount: 2 },
  ],
}

describe('summarizeIncome', () => {
  const summary = summarizeIncome(
    [mxrf, petr, { ...petr, ticker: 'VALE3', status: 'unavailable', total12m: null, events: [] }],
    TODAY,
  )

  it('soma a renda de 12 meses com a quantidade atual', () => {
    expect(summary.annual).toBeCloseTo(120 + 40)
    expect(summary.monthly).toBeCloseTo(160 / 12)
  })

  it('calcula o rendimento sobre o valor só dos ativos com histórico', () => {
    // 160 / (1000 + 400): VALE3 sem dado fica fora do denominador.
    expect(summary.portfolioYield).toBeCloseTo((160 / 1400) * 100)
    expect(summary.unavailable).toEqual(['VALE3'])
  })

  it('separa yield sobre a cotação e sobre o preço pago', () => {
    const row = summary.assets.find((asset) => asset.ticker === 'MXRF11')
    expect(row?.currentYield).toBeCloseTo(12)
    expect(row?.yieldOnCost).toBeCloseTo((1.2 / 9.5) * 100)
    expect(summary.assets.find((asset) => asset.ticker === 'PETR4')?.yieldOnCost).toBeNull()
  })

  it('distribui os proventos pelos 12 meses fechados', () => {
    expect(summary.months.map((item) => item.month)).toEqual([
      '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
      '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10',
    ])
    expect(summary.months.find((item) => item.month === '2026-02')?.amount).toBeCloseTo(10 + 20)
  })

  it('informa os meses em que o ativo paga', () => {
    expect(summary.assets.find((asset) => asset.ticker === 'PETR4')?.paymentMonths).toEqual([2, 8])
  })

  it('mostra 0 para quem não paga, sem confundir com dado indisponível', () => {
    const none = summarizeIncome([{ ...petr, status: 'none', total12m: null, events: [] }], TODAY)
    expect(none.assets[0].annual).toBe(0)
    expect(none.assets[0].currentYield).toBe(0)
    expect(none.unavailable).toEqual([])
  })
})

describe('planIncomeGoal', () => {
  it('calcula o patrimônio necessário e o tempo de aporte', () => {
    const plan = planIncomeGoal(1000, 12, 50_000, 2_000)
    expect(plan?.neededCapital).toBeCloseTo(100_000)
    expect(plan?.missing).toBeCloseTo(50_000)
    expect(plan?.monthsToGoal).toBe(25)
  })

  it('não inventa resultado sem rendimento conhecido', () => {
    expect(planIncomeGoal(1000, null, 50_000, 2_000)).toBeNull()
    expect(planIncomeGoal(1000, 0, 50_000, 2_000)).toBeNull()
  })

  it('sem aporte informa só quanto falta', () => {
    expect(planIncomeGoal(1000, 12, 0, 0)?.monthsToGoal).toBeNull()
    expect(planIncomeGoal(100, 12, 50_000, 0)?.monthsToGoal).toBe(0)
  })
})

describe('incomeConcentration', () => {
  it('aponta ativos que pagam boa parte da renda', () => {
    const summary = summarizeIncome([mxrf, petr], TODAY)
    expect(incomeConcentration(summary)).toEqual([{ ticker: 'MXRF11', share: 75 }])
  })
})
