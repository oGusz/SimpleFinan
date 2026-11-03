import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const admin = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  auth: { admin: { getUserById: vi.fn() } },
}))

const serverAuth = vi.hoisted(() => ({ getUser: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: serverAuth }) }))

import { consumeRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { startFreeTrial } from '@/app/actions/subscription'
import { POST as revenueCatWebhook } from '@/app/api/revenuecat/webhook/route'
import { GET as dailyCron } from '@/app/api/cron/daily/route'

const USER = '11111111-1111-4111-8111-111111111111'

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
  vi.restoreAllMocks()
  admin.rpc.mockReset()
  admin.from.mockReset()
  serverAuth.getUser.mockReset()
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
})
