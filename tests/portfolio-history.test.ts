import { describe, expect, it } from 'vitest'
import { accumulateDailyRates, buildHoldings, closesToSeries, twrSeries, type Snapshot } from '@/lib/portfolio-history'

describe('buildHoldings', () => {
  it('usa a cotação nova, cai na última conhecida e informa quem ficou sem preço', () => {
    const result = buildHoldings(
      [
        { ticker: 'PETR4', quantity: 10 },
        { ticker: 'VALE3', quantity: 5 },
        { ticker: 'XPTO3', quantity: 2 },
        { ticker: 'ZERO3', quantity: 0 },
      ],
      new Map([['PETR4', 40]]),
      { VALE3: { q: 5, p: 60 } },
    )
    expect(result.holdings).toEqual({ PETR4: { q: 10, p: 40 }, VALE3: { q: 5, p: 60 } })
    expect(result.value).toBe(700)
    expect(result.missing).toEqual(['XPTO3'])
  })
})

describe('twrSeries', () => {
  it('não conta um aporte como ganho', () => {
    const snapshots: Snapshot[] = [
      { day: '2026-11-02', value: 1000, holdings: { PETR4: { q: 10, p: 100 } } },
      // Comprou mais 10 cotas e o preço não mudou: rentabilidade 0, mesmo com o valor dobrando.
      { day: '2026-11-03', value: 2000, holdings: { PETR4: { q: 20, p: 100 } } },
      // Preço subiu 10%.
      { day: '2026-11-04', value: 2200, holdings: { PETR4: { q: 20, p: 110 } } },
    ]
    const points = twrSeries(snapshots)
    expect(points.map((point) => point.pct)).toEqual([0, 0, expect.closeTo(10, 6)])
  })

  it('compõe os dias e ignora ativo vendido ou sem preço no dia', () => {
    const points = twrSeries([
      { day: '2026-11-02', value: 0, holdings: { A: { q: 1, p: 100 }, B: { q: 1, p: 100 } } },
      // B vendido: só A conta no dia, que subiu 10%.
      { day: '2026-11-03', value: 0, holdings: { A: { q: 1, p: 110 } } },
      { day: '2026-11-04', value: 0, holdings: { A: { q: 1, p: 121 } } },
    ])
    expect(points.at(-1)?.pct).toBeCloseTo(21)
  })

  it('ordena por dia e começa em zero', () => {
    const points = twrSeries([
      { day: '2026-11-03', value: 0, holdings: { A: { q: 1, p: 90 } } },
      { day: '2026-11-02', value: 0, holdings: { A: { q: 1, p: 100 } } },
    ])
    expect(points).toEqual([
      { day: '2026-11-02', pct: 0 },
      { day: '2026-11-03', pct: expect.closeTo(-10, 6) },
    ])
  })
})

describe('accumulateDailyRates', () => {
  const rates = [
    { date: '2026-11-03', rate: 0.05 },
    { date: '2026-11-04', rate: 0.05 },
    { date: '2026-11-05', rate: 0.05 },
  ]

  it('acumula só os dias depois da primeira foto', () => {
    const points = accumulateDailyRates(rates, ['2026-11-03', '2026-11-05'])
    expect(points?.[1].pct).toBeCloseTo((1.0005 ** 2 - 1) * 100, 8)
  })

  it('não estica a série além da última taxa publicada', () => {
    const points = accumulateDailyRates(rates, ['2026-11-03', '2026-11-04', '2026-11-06'])
    expect(points?.map((point) => point.day)).toEqual(['2026-11-03', '2026-11-04'])
  })

  it('sem taxas suficientes devolve null', () => {
    expect(accumulateDailyRates([], ['2026-11-03', '2026-11-04'])).toBeNull()
  })
})

describe('closesToSeries', () => {
  it('usa o último fechamento até cada dia', () => {
    const points = closesToSeries(
      [
        { date: '2026-10-30', close: 100 },
        { date: '2026-11-03', close: 110 },
      ],
      ['2026-11-01', '2026-11-04'],
    )
    expect(points?.map((point) => point.pct)).toEqual([0, expect.closeTo(10, 6)])
  })

  it('sem fechamento na data inicial devolve null', () => {
    expect(closesToSeries([{ date: '2026-11-03', close: 110 }], ['2026-11-01'])).toBeNull()
  })
})
