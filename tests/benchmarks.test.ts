import { describe, expect, it } from 'vitest'
import {
  accumulateCloses,
  accumulateRates,
  buildCompositionSeries,
  closedMonths,
  monthKeyInSaoPaulo,
  toBenchmarkSeries,
} from '@/lib/benchmarks'

describe('meses fechados', () => {
  const now = new Date('2026-11-04T15:00:00Z')

  it('6m e 12m são os últimos meses fechados, sem o mês em andamento', () => {
    const six = closedMonths('6m', now)
    expect(six.months).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    expect(six.baseMonth).toBe('2026-04')

    const twelve = closedMonths('12m', now)
    expect(twelve.months).toHaveLength(12)
    expect(twelve.months[0]).toBe('2025-11')
    expect(twelve.baseMonth).toBe('2025-10')
  })

  it('ytd parte do fechamento de dezembro do ano anterior', () => {
    const ytd = closedMonths('ytd', now)
    expect(ytd.months[0]).toBe('2026-01')
    expect(ytd.months.at(-1)).toBe('2026-10')
    expect(ytd.baseMonth).toBe('2025-12')
  })

  it('ytd em janeiro não tem meses', () => {
    const ytd = closedMonths('ytd', new Date('2026-01-20T15:00:00Z'))
    expect(ytd.months).toEqual([])
    expect(ytd.baseMonth).toBe('2025-12')
  })

  it('usa o fuso de São Paulo na virada do mês', () => {
    // 02:00 UTC de 1º de novembro ainda é 31 de outubro em Brasília.
    expect(monthKeyInSaoPaulo(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10')
    expect(closedMonths('6m', new Date('2026-11-01T02:00:00Z')).months.at(-1)).toBe('2026-09')
  })
})

describe('acumulados', () => {
  it('taxas acumulam o produto de (1+r), inclusive com deflação', () => {
    const points = accumulateRates(
      { '2026-01': 1, '2026-02': 1, '2026-03': -1 },
      ['2026-01', '2026-02', '2026-03'],
    )
    expect(points.map((point) => point.accumulatedPct)).toEqual([1, 2.01, 0.9899])
  })

  it('a série de taxa para na primeira lacuna, sem fingir mês com 0%', () => {
    const points = accumulateRates({ '2026-01': 1, '2026-03': 1 }, ['2026-01', '2026-02', '2026-03'])
    expect(points.map((point) => point.month)).toEqual(['2026-01'])
  })

  it('preços acumulam contra o fechamento da base, com sinal real', () => {
    const points = accumulateCloses(
      { '2025-12': 100, '2026-01': 110, '2026-02': 90 },
      ['2026-01', '2026-02'],
    )
    expect(points).toEqual([
      { month: '2026-01', accumulatedPct: 10 },
      { month: '2026-02', accumulatedPct: -10 },
    ])
  })

  it('sem fechamento na base não há variação a mostrar', () => {
    expect(accumulateCloses({ '2026-01': 110 }, ['2026-01'])).toEqual([])
  })

  it('descarta o ponto parcial, pois ele não está entre os meses fechados', () => {
    const { months } = closedMonths('6m', new Date('2026-11-04T15:00:00Z'))
    const closes = Object.fromEntries(
      ['2026-04', ...months].map((month, index) => [month, 100 + index]),
    )
    const points = accumulateCloses({ ...closes, '2026-11': 999 }, months)
    expect(points.at(-1)).toEqual({ month: '2026-10', accumulatedPct: 6 })
  })
})

describe('série com atraso', () => {
  const info = { id: 'ipca' as const, label: 'IPCA' }
  const months = ['2026-08', '2026-09', '2026-10']

  it('IPCA defasado termina em lastMonth e informa até quando vai', () => {
    const series = toBenchmarkSeries(info, accumulateRates({ '2026-08': -0.32, '2026-09': 0.82 }, months), months)
    expect(series.status).toBe('ok')
    expect(series.lastMonth).toBe('2026-09')
    expect(series.note).toBe('até 09/2026')
    expect(series.points).toHaveLength(2)
  })

  it('série completa não leva nota', () => {
    const series = toBenchmarkSeries(
      info,
      accumulateRates({ '2026-08': 1, '2026-09': 1, '2026-10': 1 }, months),
      months,
    )
    expect(series.note).toBeUndefined()
  })

  it('sem nenhum ponto a série fica indisponível, salvo em período sem meses', () => {
    expect(toBenchmarkSeries(info, [], months).status).toBe('unavailable')
    expect(toBenchmarkSeries(info, [], []).status).toBe('ok')
  })
})

describe('buildCompositionSeries', () => {
  const months = ['2026-01', '2026-02']

  it('soma quantidade atual x fechamento contra o valor na base', () => {
    const { points, includedTickers, excludedTickers } = buildCompositionSeries(
      {
        PETR4: { '2025-12': 10, '2026-01': 11, '2026-02': 12 },
        MXRF11: { '2025-12': 10, '2026-01': 10, '2026-02': 10 },
      },
      [
        { ticker: 'PETR4', quantity: 10 },
        { ticker: 'MXRF11', quantity: 10 },
      ],
      months,
    )
    expect(includedTickers).toEqual(['PETR4', 'MXRF11'])
    expect(excludedTickers).toEqual([])
    expect(points).toEqual([
      { month: '2026-01', accumulatedPct: 5 },
      { month: '2026-02', accumulatedPct: 10 },
    ])
  })

  it('exclui quem não tem fechamento em todos os meses, inclusive na base', () => {
    const { points, includedTickers, excludedTickers } = buildCompositionSeries(
      {
        PETR4: { '2025-12': 10, '2026-01': 11, '2026-02': 12 },
        NOVO3: { '2026-01': 50, '2026-02': 500 },
      },
      [
        { ticker: 'PETR4', quantity: 1 },
        { ticker: 'NOVO3', quantity: 1 },
        { ticker: 'FALHA3', quantity: 1 },
      ],
      months,
    )
    expect(includedTickers).toEqual(['PETR4'])
    expect(excludedTickers).toEqual(['NOVO3', 'FALHA3'])
    expect(points.at(-1)).toEqual({ month: '2026-02', accumulatedPct: 20 })
  })

  it('mantém o sinal quando o valor cai', () => {
    const { points } = buildCompositionSeries(
      { PETR4: { '2025-12': 20, '2026-01': 15, '2026-02': 10 } },
      [{ ticker: 'PETR4', quantity: 3 }],
      months,
    )
    expect(points.map((point) => point.accumulatedPct)).toEqual([-25, -50])
  })

  it('sem ativo completo não desenha linha', () => {
    const { points, excludedTickers } = buildCompositionSeries({}, [{ ticker: 'PETR4', quantity: 1 }], months)
    expect(points).toEqual([])
    expect(excludedTickers).toEqual(['PETR4'])
  })
})
