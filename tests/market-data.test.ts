import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ getClaims: vi.fn() }))
const admin = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))

import { getAssetQuote } from '@/app/actions/quotes'
import { GET as searchRoute } from '@/app/api/assets/search/route'
import { GET as benchmarksRoute } from '@/app/api/benchmarks/route'
import { GET as dividendsRoute } from '@/app/api/dividends/route'
import { GET as quotesRoute } from '@/app/api/quotes/route'
import {
  classifyFromBrapi,
  classifyFromName,
  normalizeCategory,
  POPULAR_ASSETS,
} from '@/lib/asset-classification'
import { mapLimit } from '@/lib/market-data'
import { isExchangeTicker, isManualValueTicker, parseExchangeTickers } from '@/lib/tickers'

type Handler = (url: string) => Response | Promise<Response>

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const notFound = () => new Response('', { status: 404 })

function routeFetch(handler: Handler) {
  const fetchMock = vi.fn(async (url: string) => handler(String(url)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const seconds = (iso: string) => Date.parse(iso) / 1000

function yahooQuote(price: number, time = Date.now() / 1000, meta: object = {}) {
  return json({
    chart: { result: [{ meta: { regularMarketPrice: price, regularMarketTime: time, ...meta } }] },
  })
}

function yahooMonthly(closes: Record<string, number>, dividends?: Record<string, object>) {
  const months = Object.keys(closes)
  return json({
    chart: {
      result: [{
        meta: {},
        // Meia-noite em Brasília no dia 1º, como o Yahoo devolve.
        timestamp: months.map((month) => seconds(`${month}-01T03:00:00Z`)),
        indicators: { quote: [{ close: months.map((month) => closes[month]) }] },
        ...(dividends ? { events: { dividends } } : {}),
      }],
    },
  })
}

const request = (path: string) => new Request(`https://app.example${path}`)

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'user' } } })
  admin.rpc.mockResolvedValue({ data: true, error: null })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('/api/quotes', () => {
  it('devolve brapi e Yahoo juntos, com hora em ISO e lista de falhas', async () => {
    const brapiTime = new Date().toISOString()
    const yahooTime = Math.floor(Date.now() / 1000)
    routeFetch((url) => {
      if (url === 'https://brapi.dev/api/quote/PETR4,VALE3,ZZZZ3') {
        return json({ results: [{ symbol: 'PETR4', regularMarketPrice: 48.35, regularMarketTime: brapiTime }] })
      }
      if (url.includes('/chart/VALE3.SA')) return yahooQuote(60.5, yahooTime)
      return notFound()
    })

    const response = await quotesRoute(request('/api/quotes?tickers=PETR4,VALE3,ZZZZ3'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.quotes).toEqual([
      { ticker: 'PETR4', price: 48.35, marketTime: brapiTime },
      { ticker: 'VALE3', price: 60.5, marketTime: new Date(yahooTime * 1000).toISOString() },
    ])
    expect(body.failed).toEqual(['ZZZZ3'])
    expect(Date.parse(body.asOf)).not.toBeNaN()
  })

  it('repete um a um quando o lote é recusado, antes de ir ao Yahoo', async () => {
    const fetchMock = routeFetch((url) => {
      if (url === 'https://brapi.dev/api/quote/PETR4,ZZZZ3') return json({ error: true }, 401)
      if (url === 'https://brapi.dev/api/quote/PETR4') {
        return json({ results: [{ symbol: 'PETR4', regularMarketPrice: 48 }] })
      }
      if (url === 'https://brapi.dev/api/quote/ZZZZ3') return notFound()
      return notFound()
    })

    const body = await (await quotesRoute(request('/api/quotes?tickers=PETR4,ZZZZ3'))).json()

    expect(body.quotes).toEqual([{ ticker: 'PETR4', price: 48, marketTime: null }])
    expect(body.failed).toEqual(['ZZZZ3'])
    const urls = fetchMock.mock.calls.map(([url]) => url)
    expect(urls[0]).toBe('https://brapi.dev/api/quote/PETR4,ZZZZ3')
    expect(urls.filter((url) => url.includes('yahoo'))).toHaveLength(1)
  })

  it('não repete um a um quando a cota da brapi acabou', async () => {
    const fetchMock = routeFetch((url) => (url.includes('brapi') ? json({}, 429) : yahooQuote(10)))

    const response = await quotesRoute(request('/api/quotes?tickers=PETR4,VALE3'))

    expect(response.status).toBe(200)
    expect(fetchMock.mock.calls.filter(([url]) => url.includes('brapi'))).toHaveLength(1)
  })

  it('falha total responde 502, sem preço zero', async () => {
    routeFetch(() => {
      throw new Error('fora do ar')
    })

    const response = await quotesRoute(request('/api/quotes?tickers=PETR4,VALE3'))

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ quotes: [], failed: ['PETR4', 'VALE3'], asOf: null })
  })

  it('preço zero e cotação encerrada há meses contam como falha', async () => {
    routeFetch((url) => {
      if (url.includes('brapi')) return json({ results: [{ symbol: 'PETR4', regularMarketPrice: 0 }] })
      return yahooQuote(58.5, seconds('2020-01-01T00:00:00Z'))
    })

    const response = await quotesRoute(request('/api/quotes?tickers=PETR4'))

    expect(response.status).toBe(502)
    expect((await response.json()).failed).toEqual(['PETR4'])
  })

  it('o que passa do teto de 50 ativos entra em failed, sem consulta', async () => {
    const tickers = Array.from({ length: 52 }, (_, index) => `ABCD${index + 1}`)
    const fetchMock = routeFetch((url) => {
      if (url.includes('brapi')) return json({ results: [] })
      return yahooQuote(10)
    })

    const response = await quotesRoute(request(`/api/quotes?tickers=${tickers.join(',')}`))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.quotes).toHaveLength(50)
    expect(body.failed).toEqual(['ABCD51', 'ABCD52'])
    expect(fetchMock.mock.calls.some(([url]) => url.includes('ABCD51'))).toBe(false)
  })

  it('ignora renda fixa e valor manual sem consultar ninguém', async () => {
    const fetchMock = routeFetch(notFound)

    const response = await quotesRoute(request('/api/quotes?tickers=CDB-BANCO-XP,_RF-123'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ quotes: [], failed: [], asOf: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mantém 401 e 429', async () => {
    admin.rpc.mockResolvedValue({ data: false, error: null })
    expect((await quotesRoute(request('/api/quotes?tickers=PETR4'))).status).toBe(429)

    auth.getClaims.mockResolvedValue({ data: null })
    expect((await quotesRoute(request('/api/quotes?tickers=PETR4'))).status).toBe(401)
  })
})

describe('/api/dividends', () => {
  it('soma 12 meses, faz a média por 12 e separa ok, none e unavailable', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-04T15:00:00Z') })
    const closes = { '2026-08': 10, '2026-09': 10, '2026-10': 10 }
    routeFetch((url) => {
      if (url.includes('MXRF11.SA')) {
        return yahooMonthly(closes, {
          a: { date: seconds('2026-10-01T13:00:00Z'), amount: 0.1 },
          b: { date: seconds('2026-09-01T13:00:00Z'), amount: 0.2 },
          // Fora da janela de 12 meses: não pode entrar na soma.
          c: { date: seconds('2025-11-03T13:00:00Z'), amount: 9 },
        })
      }
      if (url.includes('BOVA11.SA')) return yahooMonthly(closes)
      return notFound()
    })

    const response = await dividendsRoute(request('/api/dividends?tickers=MXRF11,BOVA11,ZZZZ3,CDB-XP'))
    const { items } = await response.json()

    expect(response.status).toBe(200)
    expect(items).toHaveLength(3)
    expect(items[0]).toEqual({
      ticker: 'MXRF11',
      status: 'ok',
      total12m: 0.3,
      monthlyAverage: 0.025,
      lastDate: '2026-10-01',
      eventCount: 2,
      historyMonths: 3,
      // O radar de proventos usa cada pagamento para montar o calendário.
      events: [
        { date: '2026-09-01', amount: 0.2 },
        { date: '2026-10-01', amount: 0.1 },
      ],
    })
    expect(items[1]).toMatchObject({ ticker: 'BOVA11', status: 'none', total12m: null, monthlyAverage: null, historyMonths: 3, events: [] })
    expect(items[2]).toMatchObject({ ticker: 'ZZZZ3', status: 'unavailable', total12m: null, monthlyAverage: null })
  })

  it('conta o pagamento de 12 meses atrás e limita o histórico a 12 meses', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-04T15:00:00Z') })
    const closes = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => {
        const date = new Date(Date.UTC(2024, 10 + index, 1))
        return [date.toISOString().slice(0, 7), 10]
      }),
    )
    routeFetch(() =>
      yahooMonthly(closes, {
        a: { date: seconds('2025-11-05T13:00:00Z'), amount: 0.6 },
        b: { date: seconds('2026-10-01T13:00:00Z'), amount: 0.6 },
      }),
    )

    const { items } = await (await dividendsRoute(request('/api/dividends?tickers=MXRF11'))).json()

    expect(items[0]).toMatchObject({ total12m: 1.2, monthlyAverage: 0.1, eventCount: 2, historyMonths: 12 })
  })

  it('resposta sem nenhum pregão é indisponível, e não ausência de proventos', async () => {
    routeFetch(() => json({ chart: { result: [{ meta: {} }] } }))
    const { items } = await (await dividendsRoute(request('/api/dividends?tickers=MXRF11'))).json()
    expect(items[0]).toMatchObject({ status: 'unavailable', total12m: null })
  })

  it('o que passa do teto de 50 ativos volta como indisponível', async () => {
    const tickers = Array.from({ length: 51 }, (_, index) => `ABCD${index + 1}`)
    routeFetch(() => yahooMonthly({ '2026-10': 10 }))
    const { items } = await (await dividendsRoute(request(`/api/dividends?tickers=${tickers.join(',')}`))).json()
    expect(items).toHaveLength(51)
    expect(items[50]).toMatchObject({ ticker: 'ABCD51', status: 'unavailable', total12m: null })
  })

  it('usa a URL de proventos do Yahoo com o sufixo .SA', async () => {
    const fetchMock = routeFetch(() => yahooMonthly({ '2026-10': 10 }))
    await dividendsRoute(request('/api/dividends?tickers=MXRF11'))
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://query1.finance.yahoo.com/v8/finance/chart/MXRF11.SA?range=2y&interval=1mo&events=div',
    )
  })

  it('exige login e respeita o limite', async () => {
    admin.rpc.mockResolvedValue({ data: false, error: null })
    expect((await dividendsRoute(request('/api/dividends?tickers=MXRF11'))).status).toBe(429)

    auth.getClaims.mockResolvedValue({ data: null })
    expect((await dividendsRoute(request('/api/dividends?tickers=MXRF11'))).status).toBe(401)
  })
})

describe('/api/benchmarks', () => {
  const allCloses = {
    '2026-04': 100, '2026-05': 101, '2026-06': 102, '2026-07': 103,
    '2026-08': 104, '2026-09': 105, '2026-10': 110, '2026-11': 999,
  }
  const sgs = (months: string[]) =>
    json(months.map((month) => ({ data: `01/${month.slice(5)}/${month.slice(0, 4)}`, valor: '1.00' })))

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-04T15:00:00Z') })
  })

  it('uma fonte fora do ar não derruba as outras, e o mês parcial não entra', async () => {
    const fetchMock = routeFetch((url) => {
      if (url.includes('sgs.4391')) {
        return sgs(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
      }
      if (url.includes('sgs.433')) return sgs(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
      if (url.includes('%5EBVSP')) return yahooMonthly(allCloses)
      if (url.includes('XFIX11.SA')) return json({}, 500)
      if (url.includes('PETR4.SA')) return yahooMonthly(allCloses)
      return notFound()
    })

    const response = await benchmarksRoute(request('/api/benchmarks?range=6m&tickers=PETR4,ZZZZ3,CDB-XP'))
    const body = await response.json()
    const byId = Object.fromEntries(body.series.map((series: any) => [series.id, series]))

    expect(response.status).toBe(200)
    expect(body.months.at(-1)).toBe('2026-10')
    expect(byId.cdi.status).toBe('ok')
    expect(byId.cdi.lastMonth).toBe('2026-10')
    expect(byId.ipca.lastMonth).toBe('2026-09')
    expect(byId.ipca.note).toBe('até 09/2026')
    expect(byId.ibov.points.at(-1)).toEqual({ month: '2026-10', accumulatedPct: 10 })
    expect(byId.ifix).toMatchObject({
      status: 'unavailable',
      lastMonth: null,
      points: [],
      label: 'IFIX (aprox. pelo ETF XFIX11, só preço)',
    })
    expect(body.tickerCloses.PETR4['2026-04']).toBe(100)
    expect(body.tickerCloses.PETR4['2026-11']).toBeUndefined()
    expect(body.failedTickers).toEqual(['ZZZZ3'])
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
      'https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados?formato=json&dataInicial=01/11/2025&dataFinal=01/10/2026',
    )
  })

  it('ytd em janeiro responde sem meses', async () => {
    vi.setSystemTime(new Date('2026-01-15T15:00:00Z'))
    routeFetch(() => sgs([]))

    const body = await (await benchmarksRoute(request('/api/benchmarks?range=ytd'))).json()

    expect(body.months).toEqual([])
    expect(body.series.every((series: any) => series.points.length === 0)).toBe(true)
  })

  it('recusa período inválido, falta de login e excesso de uso', async () => {
    expect((await benchmarksRoute(request('/api/benchmarks?range=5y'))).status).toBe(400)

    admin.rpc.mockResolvedValue({ data: false, error: null })
    expect((await benchmarksRoute(request('/api/benchmarks?range=6m'))).status).toBe(429)

    auth.getClaims.mockResolvedValue({ data: null })
    expect((await benchmarksRoute(request('/api/benchmarks?range=6m'))).status).toBe(401)
  })
})

describe('/api/assets/search', () => {
  it('usa o tipo da brapi e esconde o mercado fracionário', async () => {
    routeFetch(() =>
      json({
        stocks: [
          { stock: 'TAEE11F', name: 'TAESA', type: 'stock', subType: 'stock' },
          { stock: 'TAEE11', name: 'TAESA', type: 'stock', subType: 'unit' },
        ],
      }),
    )
    const { results } = await (await searchRoute(request('/api/assets/search?q=taee'))).json()
    expect(results).toEqual([{ ticker: 'TAEE11', name: 'TAESA', category: 'Ações' }])
  })

  it('cai para /api/available e depois para a lista local', async () => {
    routeFetch((url) => {
      if (url.includes('/quote/list')) return json({}, 500)
      return json({ stocks: ['ABCD3'], indexes: [] })
    })
    const remote = await (await searchRoute(request('/api/assets/search?q=abcd'))).json()
    expect(remote.results).toEqual([{ ticker: 'ABCD3', name: 'ABCD3', category: 'Não classificado' }])

    routeFetch(() => {
      throw new Error('fora do ar')
    })
    const local = await (await searchRoute(request('/api/assets/search?q=logistica'))).json()
    expect(local.results.map((asset: any) => asset.ticker)).toEqual(['HGLG11', 'BTLG11'])
  })

  it('exige login', async () => {
    auth.getClaims.mockResolvedValue({ data: null })
    expect((await searchRoute(request('/api/assets/search?q=petr'))).status).toBe(401)
  })

  it('a lista local não tem códigos sem cotação e corrige o nome', () => {
    const tickers = POPULAR_ASSETS.map((asset) => asset.ticker)
    expect(tickers).not.toContain('BCCR11')
    expect(tickers).not.toContain('MALU11')
    expect(POPULAR_ASSETS.find((asset) => asset.ticker === 'HGLG11')?.name).toBe('Cshg Logística')
  })
})

describe('getAssetQuote', () => {
  it('inclui categoria e hora da cotação', async () => {
    const marketTime = new Date().toISOString()
    routeFetch((url) => {
      if (url.includes('/quote/list')) {
        return json({ stocks: [{ stock: 'MXRF11', name: 'MAXI RENDA', type: 'fund', subType: 'fii' }] })
      }
      return json({
        results: [{ symbol: 'MXRF11', longName: 'Maxi Renda', regularMarketPrice: 8.42, regularMarketTime: marketTime }],
      })
    })

    expect(await getAssetQuote('mxrf11')).toEqual({
      success: true,
      data: { ticker: 'MXRF11', name: 'Maxi Renda', price: 8.42, category: 'Fundos imobiliários', marketTime },
    })
  })

  it('no Yahoo classifica pelo nome quando a busca da brapi falha', async () => {
    const time = Math.floor(Date.now() / 1000)
    routeFetch((url) => {
      if (url.includes('brapi')) return json({}, 500)
      return yahooQuote(39.7, time, {
        longName: 'Transmissora Aliança de Energia Elétrica S.A.',
        shortName: 'TAESA       UNT     N2',
      })
    })

    expect(await getAssetQuote('TAEE11')).toEqual({
      success: true,
      data: {
        ticker: 'TAEE11',
        name: 'Transmissora Aliança de Energia Elétrica S.A.',
        price: 39.7,
        category: 'Ações',
        marketTime: new Date(time * 1000).toISOString(),
      },
    })
  })

  it('mantém o erro quando ninguém tem cotação', async () => {
    routeFetch(notFound)
    expect(await getAssetQuote('ZZZZ3')).toEqual({ error: 'Cotação não encontrada para "ZZZZ3".' })
  })

  it('mantém a resposta sem login, sem chamar serviços', async () => {
    const fetchMock = routeFetch(notFound)
    auth.getClaims.mockResolvedValue({ data: null })
    expect(await getAssetQuote('PETR4')).toEqual({ error: 'Usuário não autenticado.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('classificação', () => {
  it.each([
    ['FII', 'PETR4', 'Ações'],
    ['Tijolo', 'VALE3', 'Ações'],
    ['FII', 'AAPL34', 'BDRs'],
    ['Tijolo', 'MSFT35', 'BDRs'],
    ['FII', 'MXRF11', 'Fundos imobiliários'],
    ['Tijolo', 'MXRF11', 'Não classificado'],
    ['FII', 'CDB-BANCO-XP', 'Não classificado'],
    ['Ações', 'PETR4', 'Ações'],
    ['Fundos imobiliários', 'PETR4', 'Fundos imobiliários'],
    ['Renda fixa', 'CDB-BANCO-XP', 'Renda fixa'],
    ['Investimento', 'FUNDO-X', 'Outros'],
    ['', 'PETR4', 'Não classificado'],
    [null, 'PETR4', 'Não classificado'],
    ['qualquer coisa', 'PETR4', 'Não classificado'],
  ])('normalizeCategory(%s, %s) = %s', (raw, ticker, expected) => {
    expect(normalizeCategory(raw, ticker)).toBe(expected)
  })

  it('classifyFromBrapi segue tipo e subtipo', () => {
    expect(classifyFromBrapi({ type: 'fund', subType: 'fii' })).toBe('Fundos imobiliários')
    expect(classifyFromBrapi({ type: 'fund', subType: 'etf' })).toBe('ETFs')
    expect(classifyFromBrapi({ type: 'stock', subType: 'unit' })).toBe('Ações')
    expect(classifyFromBrapi({ type: 'bdr', subType: 'bdr' })).toBe('BDRs')
    expect(classifyFromBrapi({ type: 'fund', subType: 'outro' })).toBe('Fundos')
    expect(classifyFromBrapi({})).toBe('Não classificado')
  })

  it.each([
    ['Cshg Logistica - Fundo De Investimento Imobiliario', 'Fundos imobiliários'],
    ['Xp Malls Fundo Investimentos Imobiliarios', 'Fundos imobiliários'],
    ['FII MAXI RENCI', 'Fundos imobiliários'],
    ['ISHARES IBOVESPA CLASSE DE ÍNDICE - RESPONSABILIDADE LIMITADA', 'ETFs'],
    ['Banco Santander (Brasil) S.A.', 'Ações'],
    ['PETROBRAS   PN      N2', 'Ações'],
    ['APPLE       DRN', 'BDRs'],
    // Sem indicação no nome, o final 11 não basta: é melhor admitir a dúvida.
    ['BOVA11', 'Não classificado'],
    ['TAEE11', 'Não classificado'],
    ['SANB11', 'Não classificado'],
    ['Cshg Logistica', 'Não classificado'],
    ['', 'Não classificado'],
    [null, 'Não classificado'],
  ])('classifyFromName(%s) = %s', (name, expected) => {
    expect(classifyFromName(name)).toBe(expected)
  })
})

describe('tickers e concorrência', () => {
  it('reconhece só códigos de bolsa', () => {
    expect(isExchangeTicker('PETR4')).toBe(true)
    expect(isExchangeTicker('MXRF11')).toBe(true)
    expect(isExchangeTicker('PETR4F')).toBe(true)
    expect(isExchangeTicker('CDB-BANCO-XP')).toBe(false)
    expect(isExchangeTicker('_RF-123')).toBe(false)
    expect(isManualValueTicker('_RF-123')).toBe(true)
    expect(isManualValueTicker('PETR4')).toBe(false)
  })

  it('parseExchangeTickers limpa, remove repetidos e respeita o teto', () => {
    expect(parseExchangeTickers(' petr4,PETR4,CDB-XP,,vale3,mxrf11', 2)).toEqual({
      tickers: ['PETR4', 'VALE3'],
      overflow: ['MXRF11'],
    })
    expect(parseExchangeTickers(null, 2)).toEqual({ tickers: [], overflow: [] })
  })

  it('mapLimit mantém a ordem e não passa do teto', async () => {
    let running = 0
    let peak = 0
    const results = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      running += 1
      peak = Math.max(peak, running)
      await Promise.resolve()
      await Promise.resolve()
      running -= 1
      return item * 2
    })
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14])
    expect(peak).toBe(3)
  })
})
