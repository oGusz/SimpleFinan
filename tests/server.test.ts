import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const admin = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  auth: { admin: { getUserById: vi.fn() } },
}))

const serverAuth = vi.hoisted(() => ({ getUser: vi.fn(), getClaims: vi.fn() }))
const afterTasks = vi.hoisted(() => [] as Promise<unknown>[])
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: serverAuth, from: (table: string) => admin.from(table) }),
}))
vi.mock('@sentry/nextjs', () => sentry)
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// after() exige o contexto de uma requisição real; aqui guarda a tarefa para o teste aguardar.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (task: () => Promise<unknown>) => {
    afterTasks.push(task())
  },
}))

import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { startFreeTrial } from '@/app/actions/subscription'
import { POST as revenueCatWebhook } from '@/app/api/revenuecat/webhook/route'
import { GET as dailyCron } from '@/app/api/cron/daily/route'
import { POST as pluggyWebhook } from '@/app/api/pluggy/webhook/route'
import { DELETE as unregisterPush, POST as registerPush } from '@/app/api/push/register/route'
import {
  addFundsToGoal,
  createGoal,
  deleteBill,
  getBillsByMonth,
  getDashboardData,
  getGoals,
  updateBill,
} from '@/app/actions/finance'
import { createBill } from '@/app/actions/bills'
import {
  disconnectBank,
  getConnectedBanks,
  getPluggyConnectToken,
  getSyncedAccounts,
  getTransactions,
  refreshBankStatus,
  requestBankRefresh,
  savePluggyBank,
} from '@/app/actions/pluggy'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER_USER = '22222222-2222-4222-8222-222222222222'

type Row = Record<string, any>
type FailureContext = { columns: string; payload: unknown }
type Failure = { code: string } | ((context: FailureContext) => { code: string } | null)

/** Banco em memória que aplica os filtros de verdade, para os testes verem o resultado final. */
function createDb(seed: Record<string, Row[]> = {}, failures: Record<string, Failure> = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((row) => ({ ...row }))
  let nextId = 1

  const from = (table: string) => {
    tables[table] ??= []
    const filters: ((row: Row) => boolean)[] = []
    let op = ''
    let columns = ''
    let payload: any
    let conflict: string[] = []
    let single = false
    let head = false
    let window: [number, number] | null = null

    const execute = () => {
      const failure = failures[`${table}.${op}`]
      const error = typeof failure === 'function' ? failure({ columns, payload }) : failure
      if (error) return { data: null, error, count: null }

      const matches = () => tables[table].filter((row) => filters.every((filter) => filter(row)))

      if (op === 'insert') {
        const rows = [payload].flat().map((row: Row) => ({ id: `id-${nextId++}`, ...row }))
        tables[table].push(...rows)
        return { data: rows, error: null }
      }
      if (op === 'upsert') {
        for (const row of [payload].flat() as Row[]) {
          const existing = conflict.length
            ? tables[table].find((item) => conflict.every((column) => item[column] === row[column]))
            : undefined
          if (existing) Object.assign(existing, row)
          else tables[table].push({ id: `id-${nextId++}`, ...row })
        }
        return { data: null, error: null }
      }
      if (op === 'update') {
        const updated = matches()
        for (const row of updated) Object.assign(row, payload)
        return { data: columns ? updated : null, error: null }
      }
      if (op === 'delete') {
        const removed = new Set(matches())
        tables[table] = tables[table].filter((row) => !removed.has(row))
        return { data: null, error: null }
      }

      const rows = matches()
      if (head) return { data: null, error: null, count: rows.length }
      if (single) return { data: rows[0] ?? null, error: null }
      return { data: window ? rows.slice(window[0], window[1] + 1) : rows, error: null }
    }

    const query: any = {
      select(selected = '*', options?: { head?: boolean }) {
        if (!op) op = 'select'
        columns = selected
        head = Boolean(options?.head)
        return query
      },
      insert(rows: unknown) {
        op = 'insert'
        payload = rows
        return query
      },
      upsert(rows: unknown, options?: { onConflict?: string }) {
        op = 'upsert'
        payload = rows
        conflict = options?.onConflict?.split(',') ?? []
        return query
      },
      update(values: unknown) {
        op = 'update'
        payload = values
        return query
      },
      delete() {
        op = 'delete'
        return query
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value)
        return query
      },
      // NULL nunca passa em neq no SQL, e o código depende disso.
      neq(column: string, value: unknown) {
        filters.push((row) => row[column] != null && row[column] !== value)
        return query
      },
      gte(column: string, value: string) {
        filters.push((row) => row[column] >= value)
        return query
      },
      lte(column: string, value: string) {
        filters.push((row) => row[column] <= value)
        return query
      },
      lt(column: string, value: string) {
        filters.push((row) => row[column] < value)
        return query
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]))
        return query
      },
      is(column: string, value: unknown) {
        filters.push((row) => (row[column] ?? null) === value)
        return query
      },
      order: () => query,
      range(start: number, end: number) {
        window = [start, end]
        return query
      },
      maybeSingle() {
        single = true
        return query
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve().then(execute).then(resolve, reject)
      },
    }
    return query
  }

  admin.from.mockImplementation(from)
  return { tables, from }
}

const PREMIUM = { plan: 'premium', status: 'active', current_period_end: null }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

interface PluggyRoutes {
  item?: Row | number
  patchStatus?: number
  accounts?: Row[] | number
  investments?: Row[] | number
  bills?: Row[] | number
  transactions?: Row[] | number
  connectTokens?: unknown[]
}

/** Responde como a API da Pluggy. Um número no lugar da lista vira esse status de erro. */
function stubPluggy(routes: PluggyRoutes) {
  const list = (value: Row[] | number | undefined) =>
    typeof value === 'number' ? json({ message: 'falha' }, value) : json({ results: value ?? [], totalPages: 1 })

  const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    const { pathname } = new URL(String(url))
    if (pathname === '/auth') return json({ apiKey: 'chave' })
    if (pathname === '/connect_token') {
      routes.connectTokens?.push(JSON.parse(String(init.body)))
      return json({ accessToken: 'token' })
    }
    if (pathname.startsWith('/items/')) {
      if (init.method === 'PATCH') return json({}, routes.patchStatus ?? 200)
      if (init.method === 'DELETE') return json({})
      return typeof routes.item === 'number' ? json({ message: 'falha' }, routes.item) : json(routes.item ?? {})
    }
    if (pathname === '/accounts') return list(routes.accounts)
    if (pathname === '/investments') return list(routes.investments)
    if (pathname === '/bills') return list(routes.bills)
    if (pathname === '/v2/transactions') {
      return typeof routes.transactions === 'number'
        ? json({ message: 'falha' }, routes.transactions)
        : json({ results: routes.transactions ?? [], next: null })
    }
    throw new Error(`Rota inesperada no teste: ${pathname}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function login(userId = USER) {
  serverAuth.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  serverAuth.getClaims.mockResolvedValue({ data: { claims: { sub: userId } } })
}

function freezeToday() {
  vi.useFakeTimers({ toFake: ['Date'] })
  // 09h no horário de Brasília.
  vi.setSystemTime(new Date('2026-11-04T12:00:00Z'))
}

function subscriptionsMock(current: unknown, upsertError: unknown = null) {
  const upsert = vi.fn().mockResolvedValue({ error: upsertError })
  admin.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: current, error: null }) }) }),
    upsert,
  })
  return upsert
}

function revenueCatRequest(event: object, auth = 'segredo') {
  return new NextRequest('https://app.example/api/revenuecat/webhook', {
    method: 'POST',
    headers: { authorization: auth },
    body: JSON.stringify({ event }),
  })
}

const purchase = {
  type: 'INITIAL_PURCHASE',
  app_user_id: USER,
  environment: 'PRODUCTION',
  event_timestamp_ms: Date.now(),
  expiration_at_ms: Date.now() + 86_400_000,
}

beforeEach(() => {
  vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', 'segredo')
  vi.stubEnv('CRON_SECRET', 'cron-secreto')
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('EMAIL_FROM', '')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
  admin.rpc.mockReset()
  admin.from.mockReset()
  admin.auth.admin.getUserById.mockReset()
  serverAuth.getUser.mockReset()
  serverAuth.getClaims.mockReset()
  sentry.captureException.mockReset()
  afterTasks.length = 0
})

describe('limite de tentativas', () => {
  it('não guarda o e-mail em texto e ignora maiúsculas', () => {
    const key = rateLimitKey('login-email', 'Pessoa@Exemplo.com ')
    expect(key).not.toContain('exemplo')
    expect(key).toBe(rateLimitKey('login-email', 'pessoa@exemplo.com'))
  })

  it('bloqueia quando o banco diz que estourou', async () => {
    admin.rpc.mockResolvedValue({ data: false, error: null })
    expect(await consumeRateLimit('k', 1, 60)).toBe(false)
  })

  it('libera se o banco falhar, para não trancar todo mundo', async () => {
    admin.rpc.mockResolvedValue({ data: null, error: new Error('fora do ar') })
    expect(await consumeRateLimit('k', 1, 60)).toBe(true)
  })
})

describe('teste grátis', () => {
  it('exige login', async () => {
    serverAuth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await startFreeTrial()).toEqual({ error: 'Usuário não autenticado' })
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('cria 14 dias como trial', async () => {
    serverAuth.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null })
    const insert = vi.fn().mockResolvedValue({ error: null })
    admin.from.mockReturnValue({ insert })

    expect(await startFreeTrial()).toEqual({ success: true })
    const row = insert.mock.calls[0][0]
    expect(row).toMatchObject({ user_id: USER, provider: 'trial', status: 'active', plan: 'premium' })
    const days = (new Date(row.current_period_end).getTime() - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(14)
  })

  it('não permite um segundo teste', async () => {
    serverAuth.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null })
    admin.from.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: { code: '23505' } }) })
    expect(await startFreeTrial()).toEqual({ error: 'O teste grátis já foi usado nesta conta.' })
  })
})

describe('webhook da RevenueCat', () => {
  it('recusa autorização errada', async () => {
    const response = await revenueCatWebhook(revenueCatRequest(purchase, 'errado'))
    expect(response.status).toBe(401)
  })

  it('a compra substitui o teste grátis', async () => {
    const upsert = subscriptionsMock({ provider: 'trial', last_event_at: null })
    const response = await revenueCatWebhook(revenueCatRequest(purchase))
    expect(response.status).toBe(200)
    expect(upsert.mock.calls[0][0]).toMatchObject({ user_id: USER, provider: 'revenuecat', status: 'active' })
  })

  it('não sobrescreve concessão manual', async () => {
    const upsert = subscriptionsMock({ provider: 'manual', last_event_at: null })
    await revenueCatWebhook(revenueCatRequest(purchase))
    expect(upsert).not.toHaveBeenCalled()
  })

  it('ignora compra de sandbox em produção', async () => {
    const upsert = subscriptionsMock(null)
    await revenueCatWebhook(revenueCatRequest({ ...purchase, environment: 'SANDBOX' }))
    expect(upsert).not.toHaveBeenCalled()
  })

  it('ignora evento mais antigo que o último processado', async () => {
    const upsert = subscriptionsMock({ provider: 'revenuecat', last_event_at: new Date().toISOString() })
    await revenueCatWebhook(revenueCatRequest({ ...purchase, event_timestamp_ms: Date.now() - 60_000 }))
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('rotina diária', () => {
  const cronRequest = (auth?: string) =>
    new NextRequest('https://app.example/api/cron/daily', {
      headers: auth ? { authorization: auth } : {},
    })

  it('não roda sem CRON_SECRET', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await dailyCron(cronRequest('Bearer '))).status).toBe(503)
  })

  it('recusa quem não tem o segredo', async () => {
    expect((await dailyCron(cronRequest())).status).toBe(401)
    expect((await dailyCron(cronRequest('Bearer errado'))).status).toBe(401)
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('sem Resend configurado, só faz a limpeza e não falha', async () => {
    const lt = vi.fn().mockResolvedValue({ error: null })
    admin.from.mockReturnValue({ delete: () => ({ lt }) })
    const response = await dailyCron(cronRequest('Bearer cron-secreto'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, email: 'desativado' })
    expect(admin.from).toHaveBeenCalledWith('rate_limits')
  })

  it('tenta de novo a importação que falhou, mesmo sem e-mail nem push', async () => {
    vi.stubEnv('PLUGGY_CLIENT_ID', 'id')
    vi.stubEnv('PLUGGY_CLIENT_SECRET', 'secret')
    const db = createDb({
      subscriptions: [{ user_id: USER, ...PREMIUM }],
      connected_banks: [
        {
          user_id: USER,
          item_id: 'item-1',
          error_type: 'IMPORT_FAILED',
          item_status: 'ERROR',
          last_synced_at: '2026-10-01T00:00:00.000Z',
        },
      ],
    })
    stubPluggy({ item: { status: 'UPDATED', lastUpdatedAt: '2026-11-03T00:00:00.000Z' } })

    const response = await dailyCron(cronRequest('Bearer cron-secreto'))

    expect(response.status).toBe(200)
    expect(db.tables.connected_banks[0]).toMatchObject({
      item_status: 'UPDATED',
      error_type: null,
      last_synced_at: '2026-11-03T00:00:00.000Z',
    })
  })

  it('não importa banco ainda em coleta nem de quem não tem Premium', async () => {
    vi.stubEnv('PLUGGY_CLIENT_ID', 'id')
    vi.stubEnv('PLUGGY_CLIENT_SECRET', 'secret')
    const db = createDb({
      subscriptions: [{ user_id: USER, ...PREMIUM }],
      connected_banks: [
        { user_id: USER, item_id: 'item-1', error_type: 'IMPORT_FAILED', item_status: 'ERROR', last_synced_at: null },
        { user_id: 'sem-plano', item_id: 'item-2', error_type: 'IMPORT_FAILED', item_status: 'ERROR', last_synced_at: null },
      ],
    })
    const fetchMock = stubPluggy({ item: { status: 'UPDATING' } })

    await dailyCron(cronRequest('Bearer cron-secreto'))

    const paths = fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname)
    expect(paths).toContain('/items/item-1')
    expect(paths).not.toContain('/items/item-2')
    expect(paths).not.toContain('/accounts')
    expect(db.tables.connected_banks.map((bank) => bank.item_status)).toEqual(['ERROR', 'ERROR'])
  })

  describe('lembretes', () => {
    const run = async () => (await dailyCron(cronRequest('Bearer cron-secreto'))).json()

    const recipient = (metadata: Row = {}) =>
      admin.auth.admin.getUserById.mockImplementation(async (id: string) => ({
        data: { user: { id, email: `${id}@exemplo.com`, user_metadata: metadata } },
        error: null,
      }))

    function stubDelivery() {
      const fetchMock = vi.fn(async (url: string | URL) =>
        String(url).includes('exp.host') ? json({ data: [{ status: 'ok' }] }) : json({ id: 'email' }),
      )
      vi.stubGlobal('fetch', fetchMock)
      const callsTo = (host: string) =>
        fetchMock.mock.calls.filter(([url]) => String(url).includes(host)) as unknown as [string, RequestInit][]
      return { fetchMock, callsTo }
    }

    const enableEmail = () => {
      vi.stubEnv('RESEND_API_KEY', 'chave')
      vi.stubEnv('EMAIL_FROM', 'avisos@exemplo.com')
    }

    beforeEach(() => {
      freezeToday()
      recipient()
    })

    const recurringBill = {
      id: 'b1',
      user_id: USER,
      title: 'Aluguel',
      amount: 1000,
      due_date: '2026-10-05',
      status: 'paid',
      is_recurring: true,
    }

    it('com push ligado e sem e-mail, cria a recorrente e avisa o aparelho sem expor a conta', async () => {
      vi.stubEnv('PUSH_REMINDERS_ENABLED', 'true')
      const db = createDb({
        bills: [recurringBill],
        push_tokens: [{ user_id: USER, token: 'ExponentPushToken[a]' }],
      })
      const { callsTo } = stubDelivery()

      const result = await run()

      expect(result).toMatchObject({ ok: true, generated: 1, reminders: 1 })
      expect(db.tables.bills.find((bill) => bill.due_date === '2026-11-05')).toMatchObject({
        title: 'Aluguel',
        amount: 1000,
        status: 'pending',
        is_recurring: true,
      })
      expect(callsTo('exp.host')).toHaveLength(1)
      const pushBody = String(callsTo('exp.host')[0][1].body)
      expect(pushBody).not.toContain('Aluguel')
      expect(pushBody).not.toContain('1000')
      expect(callsTo('resend')).toHaveLength(0)
      expect(db.tables.notification_log).toHaveLength(1)
    })

    it('não repete o lembrete na execução seguinte nem recria a conta', async () => {
      vi.stubEnv('PUSH_REMINDERS_ENABLED', 'true')
      createDb({ bills: [recurringBill], push_tokens: [{ user_id: USER, token: 'ExponentPushToken[a]' }] })
      const { callsTo } = stubDelivery()

      await run()
      const second = await run()

      expect(second).toMatchObject({ generated: 0, reminders: 0 })
      expect(callsTo('exp.host')).toHaveLength(1)
    })

    it('respeita quem desligou o push', async () => {
      vi.stubEnv('PUSH_REMINDERS_ENABLED', 'true')
      recipient({ push_reminders: false })
      const db = createDb({ bills: [recurringBill], push_tokens: [{ user_id: USER, token: 'ExponentPushToken[a]' }] })
      const { callsTo } = stubDelivery()

      expect(await run()).toMatchObject({ reminders: 0 })
      expect(callsTo('exp.host')).toHaveLength(0)
      // Ninguém foi avisado: nada entra no registro.
      expect(db.tables.notification_log ?? []).toHaveLength(0)
    })

    it('funciona sem as tabelas e colunas da migração', async () => {
      enableEmail()
      createDb(
        {
          bills: [recurringBill],
          subscriptions: [{ user_id: USER, ...PREMIUM }],
          synced_bills: [
            { user_id: USER, pluggy_bill_id: 'f1', pluggy_account_id: 'a', account_name: 'Cartão', due_date: '2026-11-06', total_amount: 500 },
          ],
        },
        {
          'bill_skips.select': { code: 'PGRST205' },
          'push_tokens.select': { code: 'PGRST205' },
          'synced_bills.select': ({ columns }) => (columns.includes('payments_total') ? { code: '42703' } : null),
        },
      )
      const { callsTo } = stubDelivery()

      expect(await run()).toMatchObject({ generated: 1, reminders: 1 })
      const html = String(callsTo('resend')[0][1].body)
      expect(html).toContain('Aluguel')
      expect(html).toContain('Fatura Cartão')
    })

    it('inclui só a fatura em aberto de quem tem Premium, com a regra nova de status', async () => {
      enableEmail()
      const invoice = (user_id: string, pluggy_account_id: string, due_date: string, total_amount: number, payments_total: number) => ({
        user_id,
        pluggy_bill_id: `${pluggy_account_id}-${due_date}`,
        pluggy_account_id,
        account_name: `Cartão ${pluggy_account_id}`,
        due_date,
        total_amount,
        payments_total,
      })
      const db = createDb({
        subscriptions: [
          { user_id: USER, ...PREMIUM },
          { user_id: OTHER_USER, plan: 'premium', status: 'expired', current_period_end: null },
        ],
        synced_bills: [
          invoice(USER, 'Aberta', '2026-11-06', 500, 0),
          invoice(USER, 'Aberta', '2026-12-06', 300, 0),
          invoice(USER, 'Paga', '2026-11-06', 500, 0),
          invoice(USER, 'Paga', '2026-12-06', 300, 500),
          invoice(USER, 'Parcial', '2026-11-06', 500, 0),
          invoice(USER, 'Parcial', '2026-12-06', 300, 200),
          invoice(OTHER_USER, 'Vencida', '2026-11-06', 500, 0),
        ],
      })
      const { callsTo } = stubDelivery()

      expect(await run()).toMatchObject({ reminders: 1 })

      const body = JSON.parse(String(callsTo('resend')[0][1].body))
      expect(body.html).toContain('Fatura Cartão Aberta')
      expect(body.html).toContain('Fatura Cartão Parcial')
      // Do parcial, cobra só o que falta: R$ 300,00 dos R$ 500,00.
      expect(body.html).toMatch(/Cartão Parcial<?[^<]*300,00/)
      expect(body.html).not.toContain('Cartão Paga')
      expect(body.html).not.toContain('Cartão Vencida')
      expect(db.tables.notification_log.map((row) => row.kind)).toEqual(['card_bill_due', 'card_bill_due'])
    })

    it('registra a falha ao gravar o envio', async () => {
      vi.stubEnv('PUSH_REMINDERS_ENABLED', 'true')
      createDb(
        { bills: [recurringBill], push_tokens: [{ user_id: USER, token: 'ExponentPushToken[a]' }] },
        { 'notification_log.upsert': { code: '500' } },
      )
      stubDelivery()

      await run()

      expect(console.error).toHaveBeenCalledWith('[Cron] Falha ao registrar envio:', { code: '500' })
    })

    it('avisa o fim do teste 3 dias antes e no dia, sem repetir nem revogar banco', async () => {
      enableEmail()
      const trial = (user_id: string, current_period_end: string) => ({
        user_id,
        provider: 'trial',
        status: 'active',
        plan: 'premium',
        current_period_end,
      })
      const db = createDb({
        subscriptions: [
          trial(USER, '2026-11-07T15:00:00.000Z'),
          trial(OTHER_USER, '2026-11-04T20:00:00.000Z'),
          // Dois dias: não é data de aviso.
          trial('33333333-3333-4333-8333-333333333333', '2026-11-06T15:00:00.000Z'),
        ],
        connected_banks: [{ user_id: USER, item_id: 'item-1' }],
      })
      const { callsTo } = stubDelivery()

      expect(await run()).toMatchObject({ trialNotices: 2 })
      const subjects = callsTo('resend').map(([, init]) => JSON.parse(String(init.body)).subject)
      expect(subjects.sort()).toEqual(['Seu teste grátis termina em 3 dias', 'Seu teste grátis termina hoje'])
      expect(db.tables.notification_log[0]).toMatchObject({ kind: 'trial_ending', ref: 'trial_ending:2026-11-04' })
      expect(db.tables.connected_banks).toHaveLength(1)

      expect(await run()).toMatchObject({ trialNotices: 0 })
    })
  })
})

describe('webhook da Pluggy', () => {
  const ITEM = 'item-1'
  const BANK = { user_id: USER, item_id: ITEM, item_status: 'UPDATED', last_synced_at: '2026-10-01T00:00:00.000Z' }
  const SUBSCRIPTION = { user_id: USER, ...PREMIUM }

  async function send(event: string, extra: Row = {}) {
    const response = await pluggyWebhook(
      new NextRequest('https://app.example/api/pluggy/webhook', {
        method: 'POST',
        headers: { 'x-simplefinan-webhook-secret': 'segredo-pluggy' },
        body: JSON.stringify({ event, eventId: 'e1', itemId: ITEM, ...extra }),
      }),
    )
    await Promise.all(afterTasks.splice(0))
    return response
  }

  beforeEach(() => {
    vi.stubEnv('PLUGGY_WEBHOOK_SECRET', 'segredo-pluggy')
    vi.stubEnv('PLUGGY_CLIENT_ID', 'id')
    vi.stubEnv('PLUGGY_CLIENT_SECRET', 'secret')
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  it('recusa quem não tem o segredo', async () => {
    createDb()
    const response = await pluggyWebhook(
      new NextRequest('https://app.example/api/pluggy/webhook', {
        method: 'POST',
        headers: { 'x-simplefinan-webhook-secret': 'errado' },
        body: JSON.stringify({ event: 'item/updated', itemId: ITEM }),
      }),
    )
    expect(response.status).toBe(401)
  })

  it('importação que falha marca o banco com erro, avisa o Sentry e mantém a data antiga', async () => {
    const db = createDb({ connected_banks: [BANK], subscriptions: [SUBSCRIPTION] })
    stubPluggy({ item: { status: 'UPDATED', lastUpdatedAt: '2026-11-04T10:00:00.000Z' }, accounts: 500 })

    const response = await send('item/updated')

    expect(response.status).toBe(200)
    expect(db.tables.connected_banks[0]).toMatchObject({
      item_status: 'ERROR',
      error_type: 'IMPORT_FAILED',
      last_synced_at: BANK.last_synced_at,
    })
    expect(db.tables.connected_banks[0].error_message).toBeTruthy()
    expect(sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('banco com erro mantém o erro depois de importar, com a data real dos dados', async () => {
    const db = createDb({
      connected_banks: [{ ...BANK, item_status: 'LOGIN_ERROR', error_message: 'antigo' }],
      subscriptions: [SUBSCRIPTION],
    })
    stubPluggy({ item: { status: 'LOGIN_ERROR', lastUpdatedAt: '2026-09-01T00:00:00.000Z' } })

    await send('item/updated')

    expect(db.tables.connected_banks[0]).toMatchObject({
      item_status: 'LOGIN_ERROR',
      error_message: 'O acesso expirou. Toque em Reconectar; seu histórico é mantido',
      last_synced_at: '2026-09-01T00:00:00.000Z',
    })
  })

  it('fatura que falha fica registrada, sem impedir o restante da importação', async () => {
    const db = createDb({ connected_banks: [BANK], subscriptions: [SUBSCRIPTION] })
    stubPluggy({
      item: { status: 'UPDATED', lastUpdatedAt: '2026-11-04T10:00:00.000Z' },
      accounts: [{ id: 'cartao', type: 'CREDIT', name: 'Cartão' }],
      bills: 500,
    })

    await send('item/updated')

    expect(db.tables.synced_accounts).toHaveLength(1)
    expect(db.tables.connected_banks[0]).toMatchObject({
      item_status: 'UPDATED',
      error_type: 'BILLS_PARTIAL',
      last_synced_at: '2026-11-04T10:00:00.000Z',
    })
  })

  it('sem as colunas novas em synced_bills, repete a gravação sem elas', async () => {
    const db = createDb(
      { connected_banks: [BANK], subscriptions: [SUBSCRIPTION] },
      {
        'synced_bills.upsert': ({ payload }) =>
          (payload as Row[]).some((row) => 'payments_total' in row) ? { code: 'PGRST204' } : null,
      },
    )
    stubPluggy({
      item: { status: 'UPDATED' },
      accounts: [{ id: 'cartao', type: 'CREDIT', name: 'Cartão' }],
      bills: [{ id: 'f1', dueDate: '2026-11-10', totalAmount: 100, payments: [] }],
    })

    await send('item/updated')

    expect(db.tables.synced_bills).toHaveLength(1)
    expect(db.tables.connected_banks[0].error_type).toBeNull()
  })

  it('remove o ativo vendido e não sobrescreve o mesmo ativo de outro banco', async () => {
    const db = createDb({
      connected_banks: [BANK, { user_id: USER, item_id: 'item-2' }],
      subscriptions: [SUBSCRIPTION],
      investments: [
        { user_id: USER, source: 'open_finance', ticker: 'BOVA11', item_id: 'item-2', price: 90 },
        { user_id: USER, source: 'open_finance', ticker: 'VENDIDO', item_id: ITEM, price: 10 },
        { user_id: USER, source: 'manual', ticker: 'VENDIDO', item_id: null, price: 10 },
      ],
    })
    stubPluggy({
      item: { status: 'UPDATED' },
      investments: [{ id: 'abcdefgh-1', code: 'BOVA11', quantity: 1, value: 120 }],
    })

    await send('item/updated')

    const tickers = (db.tables.investments as Row[]).map((row) => `${row.source}:${row.ticker}:${row.item_id ?? ''}`).sort()
    expect(tickers).toEqual([
      'manual:VENDIDO:',
      'open_finance:BOVA11-ABCDEFGH:item-1',
      'open_finance:BOVA11:item-2',
    ])
    expect(db.tables.investments.find((row) => row.ticker === 'BOVA11')?.price).toBe(90)
  })

  it('durante a coleta, lista incompleta não apaga ativo', async () => {
    const db = createDb({
      connected_banks: [BANK],
      subscriptions: [SUBSCRIPTION],
      investments: [{ user_id: USER, source: 'open_finance', ticker: 'BOVA11', item_id: ITEM }],
    })
    stubPluggy({ item: { status: 'UPDATING' }, investments: [] })

    await send('item/updated')

    expect(db.tables.investments).toHaveLength(1)
  })

  it('sem a coluna item_id, grava sem ela e não remove nada', async () => {
    const db = createDb(
      {
        connected_banks: [BANK],
        subscriptions: [SUBSCRIPTION],
        investments: [{ user_id: USER, source: 'open_finance', ticker: 'ANTIGO' }],
      },
      {
        'investments.select': { code: '42703' },
      },
    )
    stubPluggy({ item: { status: 'UPDATED' }, investments: [{ id: 'i1', code: 'PETR4', quantity: 1, value: 30 }] })

    await send('item/updated')

    const tickers = (db.tables.investments as Row[]).map((row) => row.ticker).sort()
    expect(tickers).toEqual(['ANTIGO', 'PETR4'])
    expect(db.tables.investments.find((row) => row.ticker === 'PETR4')).not.toHaveProperty('item_id')
    expect(db.tables.connected_banks[0].item_status).toBe('UPDATED')
  })

  it('assinatura vencida não recebe novos dados', async () => {
    const db = createDb({ connected_banks: [BANK], subscriptions: [] })
    const fetchMock = stubPluggy({ item: { status: 'UPDATED' } })

    await send('item/updated')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(db.tables.connected_banks[0].last_synced_at).toBe(BANK.last_synced_at)
  })

  it('erro ao ler a assinatura não é tratado como falta de plano', async () => {
    const db = createDb(
      { connected_banks: [BANK], subscriptions: [SUBSCRIPTION] },
      { 'subscriptions.select': { code: '500' } },
    )
    stubPluggy({ item: { status: 'UPDATED' } })

    await send('item/updated')

    expect(db.tables.connected_banks[0].item_status).toBe('ERROR')
  })

  it('apaga as transações que o banco removeu', async () => {
    const db = createDb({
      connected_banks: [BANK],
      synced_transactions: [
        { item_id: ITEM, pluggy_transaction_id: 't1' },
        { item_id: ITEM, pluggy_transaction_id: 't2' },
      ],
    })

    await send('transactions/deleted', { accountId: 'a', transactionIds: ['t1'] })

    expect(db.tables.synced_transactions.map((row) => row.pluggy_transaction_id)).toEqual(['t2'])
  })

  describe('item removido', () => {
    const data = {
      subscriptions: [SUBSCRIPTION],
      synced_accounts: [{ item_id: ITEM }],
      investments: [
        { user_id: USER, source: 'open_finance', ticker: 'DO-ITEM', item_id: ITEM },
        { user_id: USER, source: 'open_finance', ticker: 'ANTIGO', item_id: null },
        { user_id: USER, source: 'manual', ticker: 'MANUAL', item_id: null },
      ],
    }

    it('último banco: apaga também as linhas antigas sem banco de origem, nunca as manuais', async () => {
      const db = createDb({ connected_banks: [BANK], ...data })

      await send('item/deleted')

      expect(db.tables.connected_banks).toHaveLength(0)
      expect(db.tables.synced_accounts).toHaveLength(0)
      expect(db.tables.investments.map((row) => row.ticker)).toEqual(['MANUAL'])
    })

    it('com outro banco conectado: as linhas antigas ficam, pois podem ser dele', async () => {
      const db = createDb({ connected_banks: [BANK, { user_id: USER, item_id: 'item-2' }], ...data })

      await send('item/deleted')

      expect(db.tables.investments.map((row) => row.ticker).sort()).toEqual(['ANTIGO', 'MANUAL'])
    })
  })

  describe('consentimento órfão', () => {
    const orphan = { status: 'UPDATING', clientUserId: USER, connector: { name: 'Banco X', imageUrl: null } }

    it('registra o item de quem tem Premium', async () => {
      const db = createDb({ subscriptions: [SUBSCRIPTION] })
      stubPluggy({ item: orphan })

      await send('item/created')

      expect(db.tables.connected_banks[0]).toMatchObject({
        user_id: USER,
        item_id: ITEM,
        institution_name: 'Banco X',
        item_status: 'UPDATING',
      })
      expect(db.tables.connected_banks[0]).not.toHaveProperty('last_synced_at')
    })

    it('ignora quem não tem Premium e clientUserId inválido', async () => {
      const db = createDb({ subscriptions: [] })
      stubPluggy({ item: orphan })
      await send('item/created')
      expect(db.tables.connected_banks ?? []).toHaveLength(0)

      const other = createDb({ subscriptions: [SUBSCRIPTION] })
      stubPluggy({ item: { ...orphan, clientUserId: 'nao-e-uuid' } })
      await send('item/updated')
      expect(other.tables.connected_banks ?? []).toHaveLength(0)
    })

    it('evento atrasado de banco já desconectado não vira erro', async () => {
      createDb({ subscriptions: [SUBSCRIPTION] })
      stubPluggy({ item: 404 })

      await send('item/updated')

      expect(sentry.captureException).not.toHaveBeenCalled()
    })

    it('outros eventos de item desconhecido não consultam a Pluggy', async () => {
      createDb()
      const fetchMock = stubPluggy({})
      await send('item/error')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})

describe('registro de aparelho para push', () => {
  const TOKEN = 'ExponentPushToken[abc123]'
  const request = (body: unknown) =>
    new Request('https://app.example/api/push/register', { method: 'POST', body: JSON.stringify(body) })

  beforeEach(() => {
    admin.rpc.mockResolvedValue({ data: true, error: null })
  })

  it('exige login', async () => {
    serverAuth.getClaims.mockResolvedValue({ data: null })
    createDb()
    expect((await registerPush(request({ token: TOKEN }))).status).toBe(401)
  })

  it('respeita o limite de tentativas', async () => {
    login()
    admin.rpc.mockResolvedValue({ data: false, error: null })
    createDb()
    expect((await registerPush(request({ token: TOKEN }))).status).toBe(429)
  })

  it('recusa token inválido', async () => {
    login()
    const db = createDb()
    for (const token of ['qualquer', 'ExponentPushToken[]', 'ExponentPushToken[a b]', 123, undefined]) {
      expect((await registerPush(request({ token }))).status).toBe(400)
    }
    expect(db.tables.push_tokens ?? []).toHaveLength(0)
  })

  it('grava o aparelho e o tira da conta anterior', async () => {
    login()
    const db = createDb({ push_tokens: [{ user_id: OTHER_USER, token: TOKEN }] })

    const response = await registerPush(request({ token: TOKEN, platform: 'ios' }))

    expect(response.status).toBe(200)
    expect(db.tables.push_tokens).toHaveLength(1)
    expect(db.tables.push_tokens[0]).toMatchObject({ user_id: USER, token: TOKEN, platform: 'ios' })
  })

  it('sem a tabela, responde indisponível', async () => {
    login()
    createDb({}, { 'push_tokens.delete': { code: 'PGRST205' }, 'push_tokens.upsert': { code: 'PGRST205' } })
    expect((await registerPush(request({ token: TOKEN }))).status).toBe(503)
  })
})

describe('contas recorrentes', () => {
  const bill = (id: string, due_date: string, extra: Row = {}) => ({
    id,
    user_id: USER,
    title: 'Netflix',
    amount: 50,
    due_date,
    status: 'pending',
    is_recurring: true,
    category: 'Lazer',
    ...extra,
  })

  beforeEach(() => {
    freezeToday()
    login()
  })

  it('"este e os próximos" encerra a série sem migração', async () => {
    const db = createDb(
      {
        bills: [
          bill('out', '2026-10-05'),
          bill('nov', '2026-11-05'),
          bill('dez', '2026-12-05'),
          bill('outra', '2026-12-05', { title: 'Aluguel' }),
          bill('alheia', '2026-12-05', { user_id: OTHER_USER }),
        ],
      },
      { 'bill_skips.select': { code: 'PGRST205' }, 'bill_skips.upsert': { code: 'PGRST205' } },
    )

    expect(await deleteBill('nov', 'following')).toEqual({ success: true })

    expect(db.tables.bills.map((row) => row.id).sort()).toEqual(['alheia', 'out', 'outra'])
    expect(db.tables.bills.find((row) => row.id === 'out')?.is_recurring).toBe(false)
    expect(db.tables.bills.find((row) => row.id === 'alheia')?.is_recurring).toBe(true)

    // A série acabou: abrir os meses seguintes não a traz de volta.
    expect((await getBillsByMonth(1, 2027)).map((row) => row.title)).toEqual(['Aluguel'])
  })

  it('"só este mês" registra o pulo e a conta não volta', async () => {
    const db = createDb({ bills: [bill('out', '2026-10-05'), bill('nov', '2026-11-05')] })

    expect(await deleteBill('nov', 'only')).toEqual({ success: true })

    expect(db.tables.bill_skips[0]).toMatchObject({ user_id: USER, title_key: 'netflix', month: '2026-11' })
    expect(await getBillsByMonth(11, 2026)).toEqual([])
    // O mês seguinte continua vindo.
    expect((await getBillsByMonth(12, 2026)).map((row) => row.due_date)).toEqual(['2026-12-05'])
  })

  it('"só este mês" sem a tabela não apaga e orienta a outra opção', async () => {
    const db = createDb({ bills: [bill('nov', '2026-11-05')] }, { 'bill_skips.upsert': { code: 'PGRST205' } })

    expect(await deleteBill('nov', 'only')).toEqual({
      success: false,
      error: 'Disponível em breve. Use "Este e os próximos".',
    })
    expect(db.tables.bills).toHaveLength(1)
  })

  it('"só este mês" na única cópia não encerra a série', async () => {
    const db = createDb({ bills: [bill('nov', '2026-11-05')] })

    expect(await deleteBill('nov', 'only')).toEqual({ success: true })

    expect(db.tables.bills.map((row) => row.due_date)).toEqual(['2026-12-05'])
    expect(await getBillsByMonth(11, 2026)).toEqual([])
  })

  it('a cópia que mantém a série não ressuscita um mês já pulado', async () => {
    const db = createDb({
      bills: [bill('nov', '2026-11-05')],
      bill_skips: [{ user_id: USER, title_key: 'netflix', month: '2026-12' }],
    })

    expect(await deleteBill('nov', 'only')).toEqual({ success: true })

    expect(db.tables.bills.map((row) => row.due_date)).toEqual(['2027-01-05'])
  })

  it('excluir conta comum não registra pulo', async () => {
    const db = createDb({ bills: [bill('nov', '2026-11-05', { is_recurring: false })] })

    expect(await deleteBill('nov')).toEqual({ success: true })

    expect(db.tables.bills).toHaveLength(0)
    expect(db.tables.bill_skips ?? []).toHaveLength(0)
  })

  it('não apaga conta de outra pessoa', async () => {
    const db = createDb({ bills: [bill('alheia', '2026-11-05', { user_id: OTHER_USER })] })

    expect(await deleteBill('alheia')).toEqual({ success: false, error: 'Conta não encontrada.' })
    expect(db.tables.bills).toHaveLength(1)
  })

  it('falha do banco vira resultado, sem detalhe técnico', async () => {
    createDb({ bills: [bill('nov', '2026-11-05')] }, { 'bills.delete': { code: '500' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await deleteBill('nov', 'following')

    expect(result).toEqual({ success: false, error: 'Não foi possível salvar. Verifique a conexão e tente de novo.' })
  })

  it('desligar a recorrência vale para todas as linhas do título', async () => {
    const db = createDb({ bills: [bill('out', '2026-10-05'), bill('nov', '2026-11-05'), bill('dez', '2026-12-05')] })

    expect(await updateBill('nov', { is_recurring: false })).toEqual({ success: true })

    expect(db.tables.bills.every((row) => row.is_recurring === false)).toBe(true)
  })

  it('aceita novo título e categoria, recusando vazio', async () => {
    const db = createDb({ bills: [bill('nov', '2026-11-05'), bill('dez', '2026-12-05'), bill('out', '2026-10-05')] })

    expect(await updateBill('nov', { title: 'Streaming', category: 'Assinaturas' })).toEqual({ success: true })

    const byId = (id: string) => db.tables.bills.find((row) => row.id === id)
    expect(byId('nov')).toMatchObject({ title: 'Streaming', category: 'Assinaturas' })
    expect(byId('dez')?.title).toBe('Streaming')
    // O mês anterior fica como foi, mas não gera mais a conta com o nome antigo.
    expect(byId('out')).toMatchObject({ title: 'Netflix', is_recurring: false })

    expect((await updateBill('nov', { title: '  ' })).success).toBe(false)
  })

  it('abrir mês passado não cria pendência', async () => {
    const db = createDb({ bills: [bill('jan', '2026-01-05')] })
    await getBillsByMonth(6, 2026)
    expect(db.tables.bills).toHaveLength(1)
  })

  it('falha ao criar a cópia não esconde as contas lidas', async () => {
    createDb({ bills: [bill('out', '2026-10-05'), bill('nov', '2026-11-10', { title: 'Luz', is_recurring: false })] }, {
      'bills.insert': { code: '500' },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect((await getBillsByMonth(11, 2026)).map((row) => row.title)).toEqual(['Luz'])
  })
})

describe('validação nas ações de escrita', () => {
  beforeEach(() => login())

  const billForm = (amount: string) => {
    const form = new FormData()
    form.set('title', 'Luz')
    form.set('amount', amount)
    form.set('due_date', '2026-11-10')
    return form
  }

  it('conta com valor zero ou negativo é recusada', async () => {
    const db = createDb()
    for (const amount of ['0', '-5', 'abc']) {
      expect((await createBill(billForm(amount))).success).toBe(false)
    }
    expect(db.tables.bills ?? []).toHaveLength(0)
    expect(await createBill(billForm('10'))).toEqual({ success: true })
    expect(db.tables.bills).toHaveLength(1)
  })

  it('meta com alvo zero é recusada', async () => {
    const db = createDb()
    expect((await createGoal({ title: 'Viagem', target_amount: 0 })).success).toBe(false)
    expect(db.tables.goals ?? []).toHaveLength(0)
    expect(await createGoal({ title: 'Viagem', target_amount: 100 })).toEqual({ success: true })
  })

  it('resgate maior que o guardado devolve a mensagem em vez de lançar', async () => {
    createDb({ goals: [{ id: 'g1', user_id: USER, current_amount: 10 }] })
    expect(await addFundsToGoal('g1', -20)).toEqual({
      success: false,
      error: 'O resgate é maior que o valor guardado na meta.',
    })
  })
})

describe('metas', () => {
  beforeEach(() => {
    freezeToday()
    login()
  })

  it('createGoal recusa prazo passado e grava a categoria nova por padrão', async () => {
    const db = createDb({ goals: [] })
    expect(await createGoal({ title: 'Viagem', target_amount: 100, deadline: '2026-11-01' })).toEqual({
      success: false,
      error: 'O prazo não pode ser anterior a hoje.',
    })
    expect(db.tables.goals).toHaveLength(0)

    expect(await createGoal({ title: 'Viagem', target_amount: 100, deadline: '2026-11-04' })).toEqual({ success: true })
    expect(db.tables.goals[0].category).toBe('other')
  })

  it('addFundsToGoal soma sobre o saldo novo quando outro aparelho gravou no meio', async () => {
    let raced = false
    const db = createDb(
      { goals: [{ id: 'g1', user_id: USER, current_amount: 10 }] },
      {
        'goals.update': () => {
          if (!raced) {
            raced = true
            db.tables.goals[0].current_amount = 50
          }
          return null
        },
      },
    )

    expect(await addFundsToGoal('g1', 5)).toEqual({ success: true })
    expect(db.tables.goals[0].current_amount).toBe(55)
  })

  it('addFundsToGoal desiste com aviso se o saldo não para de mudar', async () => {
    const db = createDb(
      { goals: [{ id: 'g1', user_id: USER, current_amount: 10 }] },
      {
        'goals.update': () => {
          db.tables.goals[0].current_amount = Number(db.tables.goals[0].current_amount) + 1
          return null
        },
      },
    )

    expect(await addFundsToGoal('g1', 5)).toEqual({
      success: false,
      error: 'O saldo desta meta mudou em outro aparelho. Confira e tente de novo.',
    })
  })
})

describe('remoção de aparelho para push', () => {
  const TOKEN = 'ExponentPushToken[abc]'
  const request = (body: unknown) =>
    new Request('https://app.example/api/push/register', { method: 'DELETE', body: JSON.stringify(body) })

  beforeEach(() => {
    login()
    admin.rpc.mockResolvedValue({ data: true, error: null })
  })

  it('apaga só o token desta conta', async () => {
    const db = createDb({
      push_tokens: [
        { user_id: USER, token: TOKEN },
        { user_id: USER, token: 'ExponentPushToken[outro]' },
        { user_id: 'outra-conta', token: TOKEN },
      ],
    })

    expect((await unregisterPush(request({ token: TOKEN }))).status).toBe(200)
    expect(db.tables.push_tokens).toEqual([
      { user_id: USER, token: 'ExponentPushToken[outro]' },
      { user_id: 'outra-conta', token: TOKEN },
    ])
  })

  it('exige login e token válido, e tolera a tabela ausente', async () => {
    createDb({}, { 'push_tokens.delete': { code: 'PGRST205' } })
    expect((await unregisterPush(request({ token: 'x' }))).status).toBe(400)
    expect((await unregisterPush(request({ token: TOKEN }))).status).toBe(200)

    serverAuth.getClaims.mockResolvedValue({ data: null })
    expect((await unregisterPush(request({ token: TOKEN }))).status).toBe(401)
  })
})

describe('leituras não escondem erro', () => {
  beforeEach(() => {
    freezeToday()
    login()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('getBillsByMonth e getGoals lançam em falha do banco', async () => {
    createDb({}, { 'bills.select': { code: '500' }, 'goals.select': { code: '500' } })
    await expect(getBillsByMonth(11, 2026)).rejects.toThrow('Não foi possível carregar suas contas.')
    await expect(getGoals()).rejects.toThrow('Não foi possível carregar suas metas.')
  })

  it('sem usuário ou com mês inválido, continuam vazias', async () => {
    createDb({}, { 'bills.select': { code: '500' } })
    expect(await getBillsByMonth(13, 2026)).toEqual([])

    serverAuth.getClaims.mockResolvedValue({ data: null })
    expect(await getBillsByMonth(11, 2026)).toEqual([])
    expect(await getGoals()).toEqual([])
  })

  it('leituras do Open Finance lançam, e bancos devolve o erro', async () => {
    createDb(
      {},
      {
        'synced_accounts.select': { code: '500' },
        'synced_transactions.select': { code: '500' },
        'connected_banks.select': { code: '500' },
      },
    )
    await expect(getSyncedAccounts()).rejects.toThrow('Não foi possível carregar as contas do banco.')
    await expect(getTransactions(11, 2026)).rejects.toThrow('Não foi possível carregar o extrato.')
    expect(await getConnectedBanks()).toEqual({ error: 'Falha ao carregar bancos', banks: [] })
  })

  it('painel: falha nas contas lança, para a tela mostrar o erro', async () => {
    createDb({}, { 'bills.select': { code: '500' } })
    await expect(getDashboardData(11, 2026)).rejects.toThrow()
  })

  it('painel: falha em metas vira null só naquele bloco', async () => {
    createDb(
      { bills: [{ id: 'b', user_id: USER, title: 'Luz', amount: 10, due_date: '2026-11-20', status: 'pending' }] },
      { 'goals.select': { code: '500' } },
    )
    const data = await getDashboardData(11, 2026)
    expect(data.goals).toBeNull()
    expect(data.failed).toEqual({ history: false, goals: true, openFinance: false })
    expect(data.bills).toHaveLength(1)
    expect(data.history).toHaveLength(1)
  })

  it('painel: falha do Open Finance não vira saldo zero', async () => {
    createDb(
      { subscriptions: [{ user_id: USER, ...PREMIUM }] },
      { 'synced_accounts.select': { code: '500' } },
    )
    const data = await getDashboardData(11, 2026, 'open_finance')
    expect(data.openFinance).toBeNull()
    expect(data.history).toBeNull()
    expect(data.failed).toMatchObject({ history: true, openFinance: true })
  })

  it('atraso de outro mês continua em atenção, e os 30 dias alcançam o mês seguinte', async () => {
    const bill = (id: string, due_date: string, extra: Row = {}) => ({
      id,
      user_id: USER,
      title: id,
      amount: 10,
      due_date,
      status: 'pending',
      is_recurring: false,
      ...extra,
    })
    const { tables } = createDb({
      bills: [
        bill('atrasada', '2026-09-20'),
        bill('em-breve', '2026-11-06'),
        bill('depois', '2026-11-20'),
        bill('paga', '2026-11-05', { status: 'paid' }),
        bill('recorrente', '2026-11-25', { is_recurring: true }),
        bill('fora', '2026-12-20'),
      ],
    })

    // Olhando um mês antigo, os alertas não mudam.
    const data = await getDashboardData(1, 2026)

    expect(data.attentionBills.map((row) => row.id)).toEqual(['atrasada', 'em-breve'])
    expect(data.next30Bills.map((row) => row.title)).toEqual(['em-breve', 'depois', 'recorrente'])
    // A recorrente de dezembro foi criada, mas 25/12 está fora da janela (hoje + 30 = 04/12).
    expect(tables.bills.some((row) => row.title === 'recorrente' && row.due_date === '2026-12-25')).toBe(true)
  })

  it('Open Finance: moeda estrangeira à parte, comparação, data dos dados e status pela fatura seguinte', async () => {
    const debit = (id: string, date: string, amount: number) => ({
      user_id: USER,
      pluggy_transaction_id: id,
      date,
      amount,
      type: 'DEBIT',
      category: 'Compras',
    })
    const invoice = (id: string, account: string, due_date: string, total_amount: number, payments_total: number | null) => ({
      user_id: USER,
      pluggy_bill_id: id,
      pluggy_account_id: account,
      account_name: account,
      due_date,
      total_amount,
      payments_total,
      has_payments: true,
    })
    createDb({
      subscriptions: [{ user_id: USER, ...PREMIUM }],
      synced_accounts: [
        { user_id: USER, type: 'BANK', balance: 100, currency_code: 'BRL' },
        { user_id: USER, type: 'BANK', balance: 50, currency_code: 'USD' },
        { user_id: USER, type: 'CREDIT', balance: 900, currency_code: 'BRL' },
      ],
      connected_banks: [
        { user_id: USER, last_synced_at: '2026-11-03T10:00:00.000Z' },
        { user_id: USER, last_synced_at: '2026-11-01T10:00:00.000Z' },
      ],
      synced_transactions: [
        debit('t1', '2026-10-01', 100),
        debit('t2', '2026-10-20', 999),
        debit('t3', '2026-11-02', 40),
      ],
      synced_bills: [
        invoice('paga', 'A', '2026-11-02', 300, 0),
        invoice('paga-seguinte', 'A', '2026-12-02', 200, 300),
        // has_payments verdadeiro, mas sem fatura seguinte: não é prova de pagamento.
        invoice('sem-seguinte', 'B', '2026-11-03', 300, null),
        invoice('futura', 'C', '2026-11-25', 300, null),
      ],
    })

    const data = await getDashboardData(11, 2026, 'open_finance')

    expect(data.openFinance).toMatchObject({
      balance: 100,
      foreignBalances: [{ currency: 'USD', total: 50 }],
      expense: 40,
      lastSyncedAt: '2026-11-01T10:00:00.000Z',
      comparison: { currentToDay: 40, previousToDay: 100, day: 4 },
    })
    const status = Object.fromEntries(data.bills.map((row) => [row.id, row.status]))
    expect(status).toEqual({
      'card-paga': 'paid',
      'card-sem-seguinte': 'unconfirmed',
      'card-futura': 'pending',
    })
    expect(data.bills.every((row) => row.read_only)).toBe(true)

    const passado = await getDashboardData(10, 2026, 'open_finance')
    expect(passado.openFinance?.comparison).toBeNull()
  })

  it('Open Finance: sem a coluna payments_total, o status fica sem saber dos pagamentos', async () => {
    createDb(
      {
        subscriptions: [{ user_id: USER, ...PREMIUM }],
        synced_bills: [
          {
            user_id: USER,
            pluggy_bill_id: 'f',
            pluggy_account_id: 'A',
            account_name: 'A',
            due_date: '2026-11-02',
            total_amount: 300,
            has_payments: true,
          },
        ],
      },
      { 'synced_bills.select': ({ columns }) => (columns.includes('payments_total') ? { code: 'PGRST204' } : null) },
    )
    const data = await getDashboardData(11, 2026, 'open_finance')
    expect(data.failed.openFinance).toBe(false)
    expect(data.bills[0].status).toBe('unconfirmed')
  })
})

describe('ações do banco conectado', () => {
  const ITEM = 'item-1'
  const SUBSCRIPTION = { user_id: USER, ...PREMIUM }
  const BANK = { id: 'c1', user_id: USER, item_id: ITEM, item_status: 'UPDATED', last_synced_at: '2026-10-01T00:00:00.000Z' }

  beforeEach(() => {
    login()
    admin.rpc.mockResolvedValue({ data: true, error: null })
    vi.stubEnv('PLUGGY_CLIENT_ID', 'id')
    vi.stubEnv('PLUGGY_CLIENT_SECRET', 'secret')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('pedir atualização marca como atualizando sem apagar o aviso anterior', async () => {
    const db = createDb({ connected_banks: [{ ...BANK, error_message: 'antigo' }], subscriptions: [SUBSCRIPTION] })
    stubPluggy({})

    expect(await requestBankRefresh(ITEM)).toEqual({ status: 'updating' })
    expect(db.tables.connected_banks[0]).toMatchObject({ item_status: 'UPDATING', error_message: 'antigo' })
  })

  it('400 da Pluggy vira pedido de reconexão', async () => {
    const db = createDb({ connected_banks: [BANK], subscriptions: [SUBSCRIPTION] })
    stubPluggy({ patchStatus: 400 })

    expect((await requestBankRefresh(ITEM)).status).toBe('needs_reconnect')
    expect(db.tables.connected_banks[0].item_status).toBe('WAITING_USER_INPUT')
  })

  it('banco de outra pessoa não é atualizado', async () => {
    createDb({ connected_banks: [{ ...BANK, user_id: OTHER_USER }], subscriptions: [SUBSCRIPTION] })
    const fetchMock = stubPluggy({})

    expect((await requestBankRefresh(ITEM)).status).toBe('error')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('consulta de status importa quando há dado novo, mesmo sem webhook', async () => {
    const db = createDb({ connected_banks: [BANK], subscriptions: [SUBSCRIPTION] })
    stubPluggy({
      item: { status: 'UPDATED', lastUpdatedAt: '2026-11-04T10:00:00.000Z' },
      accounts: [{ id: 'conta', type: 'BANK', name: 'Conta' }],
    })

    expect(await refreshBankStatus(ITEM)).toEqual({
      itemStatus: 'UPDATED',
      lastSyncedAt: '2026-11-04T10:00:00.000Z',
      errorMessage: null,
      imported: true,
    })
    expect(db.tables.synced_accounts).toHaveLength(1)
  })

  it('sem dado novo, não importa de novo', async () => {
    const db = createDb({ connected_banks: [BANK], subscriptions: [SUBSCRIPTION] })
    stubPluggy({ item: { status: 'UPDATED', lastUpdatedAt: BANK.last_synced_at } })

    expect((await refreshBankStatus(ITEM)).imported).toBe(false)
    expect(db.tables.synced_accounts ?? []).toHaveLength(0)
  })

  it('consulta de status mostra o erro real do item', async () => {
    createDb({ connected_banks: [BANK], subscriptions: [SUBSCRIPTION] })
    stubPluggy({ item: { status: 'LOGIN_ERROR' } })

    expect(await refreshBankStatus(ITEM)).toMatchObject({
      itemStatus: 'LOGIN_ERROR',
      errorMessage: 'O acesso expirou. Toque em Reconectar; seu histórico é mantido',
      lastSyncedAt: BANK.last_synced_at,
      imported: false,
    })
  })

  it('salvar banco novo deixa a data nula até importar', async () => {
    const db = createDb({ subscriptions: [SUBSCRIPTION] })
    stubPluggy({ item: { status: 'UPDATING', clientUserId: USER, connector: { name: 'Banco X' } } })

    expect(await savePluggyBank(ITEM)).toEqual({ success: true })
    expect(db.tables.connected_banks[0]).not.toHaveProperty('last_synced_at')
  })

  it('reconectar um banco que já existe preserva a data dos dados', async () => {
    const db = createDb({ connected_banks: [BANK], subscriptions: [SUBSCRIPTION] })
    stubPluggy({ item: { status: 'UPDATING', clientUserId: USER } })

    await savePluggyBank(ITEM)
    expect(db.tables.connected_banks[0].last_synced_at).toBe(BANK.last_synced_at)
  })

  it('reconexão ignora o limite de bancos e confere o dono; conexão nova respeita o limite', async () => {
    const banks = Array.from({ length: 10 }, (_, index) => ({ user_id: USER, item_id: `b${index}` }))
    createDb({ connected_banks: [...banks, BANK], subscriptions: [SUBSCRIPTION] })
    const connectTokens: any[] = []
    stubPluggy({ connectTokens })

    expect(await getPluggyConnectToken(ITEM)).toMatchObject({ accessToken: 'token' })
    expect(connectTokens[0]).toMatchObject({ itemId: ITEM, options: { clientUserId: USER } })

    expect(await getPluggyConnectToken('item-de-outro')).toEqual({ error: 'Banco não encontrado na sua conta.' })
    expect((await getPluggyConnectToken()).error).toContain('limite')
  })

  it('bancos de teste só aparecem com o ambiente sandbox dito explicitamente', async () => {
    createDb({ connected_banks: [], subscriptions: [SUBSCRIPTION] })
    stubPluggy({})

    vi.stubEnv('PLUGGY_ENVIRONMENT', '')
    expect((await getPluggyConnectToken()).includeSandbox).toBe(false)
    vi.stubEnv('PLUGGY_ENVIRONMENT', 'production')
    expect((await getPluggyConnectToken()).includeSandbox).toBe(false)
    vi.stubEnv('PLUGGY_ENVIRONMENT', 'sandbox')
    expect((await getPluggyConnectToken()).includeSandbox).toBe(true)
  })

  it('desconectar o último banco apaga o que veio dele e as linhas antigas, sem tocar nas manuais', async () => {
    const db = createDb({
      connected_banks: [BANK],
      synced_transactions: [{ item_id: ITEM }],
      investments: [
        { user_id: USER, source: 'open_finance', ticker: 'DO-ITEM', item_id: ITEM },
        { user_id: USER, source: 'open_finance', ticker: 'ANTIGO', item_id: null },
        { user_id: USER, source: 'manual', ticker: 'MANUAL', item_id: null },
      ],
    })
    stubPluggy({})

    expect(await disconnectBank(ITEM)).toEqual({ success: true })

    expect(db.tables.connected_banks).toHaveLength(0)
    expect(db.tables.synced_transactions).toHaveLength(0)
    expect(db.tables.investments.map((row) => row.ticker)).toEqual(['MANUAL'])
  })

  it('com outro banco conectado, apaga as linhas antigas do removido e mantém as do que ficou', async () => {
    const OTHER = { id: 'c2', user_id: USER, item_id: 'item-2', item_status: 'UPDATED' }
    const db = createDb({
      connected_banks: [BANK, OTHER],
      investments: [
        { user_id: USER, source: 'open_finance', ticker: 'PETR4', item_id: null },
        { user_id: USER, source: 'open_finance', ticker: 'DO-REMOVIDO', item_id: null },
        { user_id: USER, source: 'manual', ticker: 'MANUAL', item_id: null },
      ],
    })
    stubPluggy({ item: { status: 'UPDATED' }, investments: [{ id: 'i1', code: 'PETR4', quantity: 1, value: 30 }] })

    expect(await disconnectBank(ITEM)).toEqual({ success: true })

    expect(db.tables.investments.map((row) => row.ticker).sort()).toEqual(['MANUAL', 'PETR4'])
    expect(db.tables.investments.find((row) => row.ticker === 'PETR4')?.item_id).toBe('item-2')
  })

  it('com o outro banco ainda coletando, não apaga nada que possa ser dele', async () => {
    const OTHER = { id: 'c2', user_id: USER, item_id: 'item-2', item_status: 'UPDATING' }
    const db = createDb({
      connected_banks: [BANK, OTHER],
      investments: [{ user_id: USER, source: 'open_finance', ticker: 'PETR4', item_id: null }],
    })
    stubPluggy({ item: { status: 'UPDATING' }, investments: [] })

    expect(await disconnectBank(ITEM)).toEqual({ success: true })

    expect(db.tables.investments.map((row) => row.ticker)).toEqual(['PETR4'])
  })

  it('desconectar não confunde falha de leitura com banco inexistente', async () => {
    createDb({ connected_banks: [BANK] }, { 'connected_banks.select': { code: '500' } })
    stubPluggy({})

    expect(await disconnectBank(ITEM)).toEqual({ error: 'Falha ao desconectar banco.' })
  })
})
