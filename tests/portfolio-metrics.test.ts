import { describe, expect, it } from 'vitest'
import {
  assetReturn,
  portfolioReturn,
  resolveAvgPrice,
  totalValue,
  weightedAvgPrice,
} from '@/lib/portfolio-metrics'

describe('assetReturn', () => {
  it('não inventa 0% quando o ativo nunca teve cotação', () => {
    expect(assetReturn({ quantity: 3, price: 10, avgPrice: 10, quoteMissing: true })).toBeNull()
    expect(portfolioReturn([{ quantity: 3, price: 10, avgPrice: 10, quoteMissing: true }])).toBeNull()
  })

  it('calcula ganho com custo conhecido', () => {
    const result = assetReturn({ quantity: 10, price: 12, avgPrice: 10 })
    expect(result?.pct).toBeCloseTo(20)
    expect(result?.amount).toBeCloseTo(20)
  })

  it('calcula retorno negativo', () => {
    const result = assetReturn({ quantity: 4, price: 7.5, avgPrice: 10 })
    expect(result?.pct).toBeCloseTo(-25)
    expect(result?.amount).toBeCloseTo(-10)
  })

  it('retorna null sem custo, sem cotação ou sem quantidade', () => {
    expect(assetReturn({ quantity: 10, price: 12, avgPrice: null })).toBeNull()
    expect(assetReturn({ quantity: 10, price: 12 })).toBeNull()
    expect(assetReturn({ quantity: 10, price: 0, avgPrice: 10 })).toBeNull()
    expect(assetReturn({ quantity: 0, price: 12, avgPrice: 10 })).toBeNull()
  })
})

describe('portfolioReturn', () => {
  it('considera apenas ativos com custo e informa a cobertura', () => {
    const result = portfolioReturn([
      { quantity: 10, price: 12, avgPrice: 10 },
      { quantity: 5, price: 8, avgPrice: 10 },
      { quantity: 100, price: 50, avgPrice: null },
    ])
    // Custo 150, ganho 20 - 10 = 10. O ativo sem custo não entra.
    expect(result?.amount).toBeCloseTo(10)
    expect(result?.pct).toBeCloseTo((10 / 150) * 100)
    expect(result?.coveredAssets).toBe(2)
    expect(result?.totalAssets).toBe(3)
  })

  it('retorna negativo quando a carteira perde', () => {
    const result = portfolioReturn([{ quantity: 10, price: 9, avgPrice: 10 }])
    expect(result?.pct).toBeCloseTo(-10)
    expect(result?.amount).toBeCloseTo(-10)
  })

  it('retorna null sem nenhum custo conhecido', () => {
    expect(portfolioReturn([{ quantity: 10, price: 12, avgPrice: null }])).toBeNull()
    expect(portfolioReturn([])).toBeNull()
  })
})

describe('weightedAvgPrice', () => {
  it('pondera pela quantidade', () => {
    expect(weightedAvgPrice(10, 10, 30, 20)).toBeCloseTo(17.5)
  })

  it('arredonda a 4 casas, como a coluna do banco', () => {
    expect(weightedAvgPrice(3, 10, 4, 10.01)).toBe(10.0057)
  })

  it('primeira compra usa o custo informado', () => {
    expect(weightedAvgPrice(0, null, 10, 12.5)).toBe(12.5)
    expect(weightedAvgPrice(0, null, 10, null)).toBeNull()
  })

  it('retorna null quando uma das partes não tem custo', () => {
    expect(weightedAvgPrice(10, null, 5, 20)).toBeNull()
    expect(weightedAvgPrice(10, 20, 5, null)).toBeNull()
  })
})

describe('resolveAvgPrice', () => {
  it('trata custo ausente ou zero como desconhecido', () => {
    expect(resolveAvgPrice(null, 10, 'manual')).toBeNull()
    expect(resolveAvgPrice(0, 10, 'manual')).toBeNull()
    expect(resolveAvgPrice('12.5', 10, 'manual')).toBe(12.5)
  })

  it('descarta avg_price igual ao preço só no Open Finance', () => {
    expect(resolveAvgPrice(10.12341, 10.12344, 'open_finance')).toBeNull()
    expect(resolveAvgPrice(10.1234, 10.1234, 'manual')).toBe(10.1234)
    expect(resolveAvgPrice(9, 10, 'open_finance')).toBe(9)
  })
})

describe('totalValue', () => {
  it('soma quantidade vezes preço', () => {
    expect(
      totalValue([
        { quantity: 2, price: 10 },
        { quantity: 1, price: 5.5 },
      ])
    ).toBeCloseTo(25.5)
    expect(totalValue([])).toBe(0)
  })
})
