import { describe, expect, it } from 'vitest'
import { buildMonthlyReport, monthBounds, type ReportInput } from '@/lib/report'

const base: ReportInput = {
  month: '2026-10',
  today: '2026-11-09',
  bills: [
    { amount: 1500, status: 'paid', category: 'Moradia' },
    { amount: 99.9, status: 'pending', category: 'Moradia' },
    { amount: 200.5, status: 'paid', category: null },
  ],
  snapshots: [
    { day: '2026-09-30', value: 1000, holdings: { PETR4: { q: 10, p: 100 } } },
    { day: '2026-10-15', value: 2200, holdings: { PETR4: { q: 20, p: 110 } } },
    { day: '2026-10-30', value: 2420, holdings: { PETR4: { q: 20, p: 121 } } },
    { day: '2026-11-03', value: 2500, holdings: { PETR4: { q: 20, p: 125 } } },
  ],
  dividendEvents: new Map([['PETR4', [{ date: '2026-10-10', amount: 1 }, { date: '2026-10-20', amount: 0.5 }, { date: '2026-11-02', amount: 9 }]]]),
  currentQuantities: new Map([['PETR4', 20]]),
  goals: [{ title: 'Reserva', current_amount: 2500, target_amount: 10000 }],
  cdiRates: [
    { date: '2026-10-01', rate: 0.05 },
    { date: '2026-10-30', rate: 0.05 },
  ],
  ibovCloses: [
    { date: '2026-09-30', close: 100 },
    { date: '2026-10-30', close: 105 },
  ],
}

describe('monthBounds', () => {
  it('acerta o último dia, inclusive em fevereiro', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(monthBounds('2028-02').end).toBe('2028-02-29')
  })
})

describe('buildMonthlyReport', () => {
  const report = buildMonthlyReport(base)

  it('soma as contas e agrupa por categoria, com "Outros" para as sem categoria', () => {
    expect(report.bills).toMatchObject({ total: 1800.4, paid: 1700.5, pending: 99.9, count: 3 })
    expect(report.bills.byCategory).toEqual([
      { category: 'Moradia', total: 1599.9 },
      { category: 'Outros', total: 200.5 },
    ])
  })

  it('mede a carteira do fim do mês anterior ao último pregão do mês, sem contar o aporte', () => {
    expect(report.portfolio).toMatchObject({ startDay: '2026-09-30', endDay: '2026-10-30', startValue: 1000, endValue: 2420 })
    expect(report.portfolio?.returnPct).toBeCloseTo(21)
    expect(report.portfolio?.ibovPct).toBeCloseTo(5)
    expect(report.portfolio?.cdiPct).toBeCloseTo((1.0005 ** 2 - 1) * 100, 8)
  })

  it('usa a quantidade da data ex: 10 cotas em 10/10 e 20 cotas em 20/10', () => {
    expect(report.dividends).toEqual({ total: 20, items: [{ ticker: 'PETR4', amount: 20 }], estimated: false })
  })

  it('sem fotos da carteira, usa a quantidade de hoje e avisa que é estimativa', () => {
    const estimated = buildMonthlyReport({ ...base, snapshots: [] })
    expect(estimated.portfolio).toBeNull()
    expect(estimated.dividends).toEqual({ total: 30, items: [{ ticker: 'PETR4', amount: 30 }], estimated: true })
  })

  it('marca o mês corrente como aberto e calcula o progresso das metas', () => {
    expect(report.closed).toBe(true)
    expect(buildMonthlyReport({ ...base, month: '2026-11' }).closed).toBe(false)
    expect(report.goals).toEqual([{ title: 'Reserva', current: 2500, target: 10000, pct: 25 }])
  })
})
