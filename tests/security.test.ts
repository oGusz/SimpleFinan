import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  getClaims: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}))
const admin = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  storage: { from: vi.fn() },
  auth: { admin: { updateUserById: vi.fn() } },
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.1, 10.0.0.1' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { requestPasswordReset, signup, updatePassword } from '@/app/actions/auth'
import { getAssetQuote } from '@/app/actions/quotes'
import { GET as quotesRoute } from '@/app/api/quotes/route'
import { POST as revenueCatWebhook } from '@/app/api/revenuecat/webhook/route'
import { isValidAmount, isValidDate, isValidMonth } from '@/lib/validation'

function signupForm(email = 'pessoa@exemplo.com') {
  const form = new FormData()
  form.set('name', 'Pessoa')
  form.set('email', email)
  form.set('password', 'Senha-forte1')
  form.set('confirmPassword', 'Senha-forte1')
  return form
}

beforeEach(() => {
  admin.rpc.mockResolvedValue({ data: true, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  Object.values(auth).forEach((mock) => mock.mockReset())
  admin.rpc.mockReset()
  admin.from.mockReset()
})

describe('cadastro não revela quem tem conta', () => {
  it('responde igual para e-mail novo e repetido', async () => {
    auth.signUp.mockResolvedValueOnce({
      data: { user: { id: 'novo', identities: [{ id: 'x' }] }, session: null },
      error: null,
    })
    const newUser = await signup(signupForm())

    auth.signUp.mockResolvedValueOnce({
      data: { user: { id: 'falso', identities: [] }, session: null },
      error: null,
    })
    const existingUser = await signup(signupForm())

    expect(newUser).toEqual(existingUser)
    expect(newUser).toHaveProperty('notice')
  })

  it('não grava foto em conta de outra pessoa quando o e-mail é repetido', async () => {
    const form = signupForm()
    form.set('avatar', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'a.jpg', { type: 'image/jpeg' }))
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'falso', identities: [] }, session: null },
      error: null,
    })

    await signup(form)
    expect(admin.storage.from).not.toHaveBeenCalled()
  })

  it('bloqueia o cadastro quando o limite por IP estoura', async () => {
    admin.rpc.mockResolvedValue({ data: false, error: null })
    const result = await signup(signupForm())
    expect(result).toHaveProperty('error')
    expect(auth.signUp).not.toHaveBeenCalled()
  })
})

describe('recuperação de senha', () => {
  it('responde igual exista ou não a conta', async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({ error: null })
    const found = await requestPasswordReset('existe@exemplo.com')
    auth.resetPasswordForEmail.mockResolvedValueOnce({ error: { code: 'user_not_found' } })
    const missing = await requestPasswordReset('nao-existe@exemplo.com')
    expect(found).toEqual(missing)
  })

  it('volta sempre para o domínio do app, ignorando o que vier do pedido', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example')
    auth.resetPasswordForEmail.mockResolvedValue({ error: null })
    await requestPasswordReset('pessoa@exemplo.com')
    expect(auth.resetPasswordForEmail.mock.calls[0][1].redirectTo).toBe(
      'https://app.example/auth/callback?next=/redefinir-senha',
    )
  })

  it('respeita o limite de pedidos', async () => {
    admin.rpc.mockResolvedValue({ data: false, error: null })
    expect(await requestPasswordReset('pessoa@exemplo.com')).toHaveProperty('error')
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })

  it('recusa senha fraca e pedido sem sessão', async () => {
    expect(await updatePassword('fraca', 'fraca')).toHaveProperty('error')
    expect(await updatePassword('Senha-forte1', 'Senha-forte2')).toHaveProperty('error')

    auth.getUser.mockResolvedValue({ data: { user: null } })
    expect(await updatePassword('Senha-forte1', 'Senha-forte1')).toHaveProperty('error')
    expect(auth.updateUser).not.toHaveBeenCalled()
  })
})

describe('cotações', () => {
  it('exige login na ação e não chama serviços externos', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    auth.getClaims.mockResolvedValue({ data: null })

    expect(await getAssetQuote('PETR4')).toEqual({ error: 'Usuário não autenticado.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('não coloca o token na URL da Brapi', async () => {
    vi.stubEnv('BRAPI_TOKEN', 'token-secreto')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] })))
    vi.stubGlobal('fetch', fetchMock)
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'user' } } })

    await quotesRoute(new Request('https://app.example/api/quotes?tickers=PETR4'))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://brapi.dev/api/quote/PETR4')
    expect(url).not.toContain('token-secreto')
    expect(init.headers.Authorization).toBe('Bearer token-secreto')
  })

  it('recusa sem login e quando o limite estoura', async () => {
    auth.getClaims.mockResolvedValue({ data: null })
    expect((await quotesRoute(new Request('https://app.example/api/quotes?tickers=PETR4'))).status).toBe(401)

    auth.getClaims.mockResolvedValue({ data: { claims: { sub: 'user' } } })
    admin.rpc.mockResolvedValue({ data: false, error: null })
    expect((await quotesRoute(new Request('https://app.example/api/quotes?tickers=PETR4'))).status).toBe(429)
  })
})

describe('webhook da RevenueCat com dados malformados', () => {
  it('não quebra nem repete para sempre com data inválida', async () => {
    vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', 'segredo')
    const upsert = vi.fn()
    admin.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert,
    })

    const response = await revenueCatWebhook(
      new NextRequest('https://app.example/api/revenuecat/webhook', {
        method: 'POST',
        headers: { authorization: 'segredo' },
        body: JSON.stringify({
          event: {
            type: 'INITIAL_PURCHASE',
            app_user_id: '11111111-1111-4111-8111-111111111111',
            environment: 'PRODUCTION',
            event_timestamp_ms: 'invalido',
          },
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('validação de entradas', () => {
  it('aceita só valores que cabem no banco', () => {
    expect(isValidAmount(10.5)).toBe(true)
    for (const invalid of [Number.NaN, Infinity, 1e15, '10', null]) {
      expect(isValidAmount(invalid)).toBe(false)
    }
  })

  it('recusa datas impossíveis', () => {
    expect(isValidDate('2026-02-28')).toBe(true)
    for (const invalid of ['2026-02-30', '28/02/2026', "2026-01-01' OR 1=1", null]) {
      expect(isValidDate(invalid)).toBe(false)
    }
  })

  it('recusa mês e ano fora do intervalo', () => {
    expect(isValidMonth(11, 2026)).toBe(true)
    for (const [month, year] of [[0, 2026], [13, 2026], [1.5, 2026], [1, 1800], ['1', 2026]]) {
      expect(isValidMonth(month, year)).toBe(false)
    }
  })
})
