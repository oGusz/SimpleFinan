import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const admin = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  storage: { from: vi.fn() },
  auth: { admin: { deleteUser: vi.fn() } },
}))
const session = vi.hoisted(() => ({
  from: vi.fn(),
  auth: { getUser: vi.fn(), signOut: vi.fn() },
}))
const pluggy = vi.hoisted(() => ({ getPluggyApiKey: vi.fn(), deletePluggyItem: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => session }))
vi.mock('@/lib/pluggy/server', () => pluggy)

import { POST as revenueCatWebhook } from '@/app/api/revenuecat/webhook/route'
import { deleteAccount, exportMyData } from '@/app/actions/account'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER_USER = '22222222-2222-4222-8222-222222222222'

function subscriptionsMock() {
  const upsert = vi.fn().mockResolvedValue({ error: null })
  admin.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    upsert,
  })
  return upsert
}

const sandboxPurchase = (userId: string) =>
  new NextRequest('https://app.example/api/revenuecat/webhook', {
    method: 'POST',
    headers: { authorization: 'segredo' },
    body: JSON.stringify({
      event: {
        type: 'INITIAL_PURCHASE',
        app_user_id: userId,
        environment: 'SANDBOX',
        event_timestamp_ms: Date.now(),
        expiration_at_ms: Date.now() + 86_400_000,
      },
    }),
  })

beforeEach(() => {
  vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', 'segredo')
  vi.stubEnv('REVENUECAT_ALLOW_SANDBOX', '')
  vi.stubEnv('REVENUECAT_SANDBOX_USER_IDS', '')
  vi.stubEnv('REVENUECAT_SECRET_KEY', '')
  vi.stubEnv('POSTHOG_PERSONAL_API_KEY', '')
  vi.stubEnv('POSTHOG_PROJECT_ID', '')
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', '')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  admin.from.mockReset()
  admin.rpc.mockReset()
  admin.storage.from.mockReset()
  admin.auth.admin.deleteUser.mockReset()
  session.from.mockReset()
  session.auth.getUser.mockReset()
  session.auth.signOut.mockReset()
  pluggy.getPluggyApiKey.mockReset()
  pluggy.deletePluggyItem.mockReset()
})

describe('sandbox da RevenueCat', () => {
  it('sem variáveis, ignora', async () => {
    const upsert = subscriptionsMock()
    await revenueCatWebhook(sandboxPurchase(USER))
    expect(upsert).not.toHaveBeenCalled()
  })

  it('libera a conta da lista, com espaços e maiúsculas na variável', async () => {
    vi.stubEnv('REVENUECAT_SANDBOX_USER_IDS', ` ${OTHER_USER} , ${USER.toUpperCase()} `)
    const upsert = subscriptionsMock()
    await revenueCatWebhook(sandboxPurchase(USER))
    expect(upsert.mock.calls[0][0]).toMatchObject({ user_id: USER, provider: 'revenuecat', status: 'active' })
  })

  it('não libera conta fora da lista', async () => {
    vi.stubEnv('REVENUECAT_SANDBOX_USER_IDS', OTHER_USER)
    const upsert = subscriptionsMock()
    await revenueCatWebhook(sandboxPurchase(USER))
    expect(upsert).not.toHaveBeenCalled()
  })

  it('REVENUECAT_ALLOW_SANDBOX libera qualquer conta', async () => {
    vi.stubEnv('REVENUECAT_ALLOW_SANDBOX', 'true')
    const upsert = subscriptionsMock()
    await revenueCatWebhook(sandboxPurchase(USER))
    expect(upsert).toHaveBeenCalledTimes(1)
  })
})

describe('exclusão de conta', () => {
  function stubDeletion() {
    session.auth.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null })
    session.auth.signOut.mockResolvedValue({})
    admin.from.mockImplementation((table: string) => ({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
      delete: () => ({ eq: async () => ({ error: null, table }) }),
    }))
    admin.storage.from.mockReturnValue({ list: async () => ({ data: [] }), remove: vi.fn() })
    admin.auth.admin.deleteUser.mockResolvedValue({ error: null })
  }

  it('aceita minúsculas e espaço final, e recusa outro texto', async () => {
    stubDeletion()
    expect(await deleteAccount('apagar')).toEqual({ error: 'Confirmação inválida.' })
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
    expect(await deleteAccount(' excluir ')).toEqual({ success: true })
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(USER)
  })

  it('sem chaves de fornecedor, exclui e não chama ninguém', async () => {
    stubDeletion()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await deleteAccount('EXCLUIR')).toEqual({ success: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('chama RevenueCat e PostHog na região certa', async () => {
    stubDeletion()
    vi.stubEnv('REVENUECAT_SECRET_KEY', 'rc-secreta')
    vi.stubEnv('POSTHOG_PERSONAL_API_KEY', 'ph-pessoal')
    vi.stubEnv('POSTHOG_PROJECT_ID', '42')
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com')
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes('distinct_id')) return new Response(JSON.stringify({ results: [{ id: 'pessoa-1' }] }))
      void init
      return new Response('{}')
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await deleteAccount('EXCLUIR')).toEqual({ success: true })

    const calls = fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`)
    expect(calls).toContain(`DELETE https://api.revenuecat.com/v1/subscribers/${USER}`)
    expect(calls).toContain(`GET https://eu.posthog.com/api/projects/42/persons/?distinct_id=${USER}`)
    expect(calls).toContain(
      'DELETE https://eu.posthog.com/api/projects/42/persons/pessoa-1/?delete_events=true&delete_recordings=true',
    )
  })

  it('falha nos fornecedores não aborta a exclusão, e fica registrada', async () => {
    stubDeletion()
    vi.stubEnv('REVENUECAT_SECRET_KEY', 'rc-secreta')
    vi.stubEnv('POSTHOG_PERSONAL_API_KEY', 'ph-pessoal')
    vi.stubEnv('POSTHOG_PROJECT_ID', '42')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('falha', { status: 500 })))

    expect(await deleteAccount('EXCLUIR')).toEqual({ success: true })
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(USER)
    expect(console.error).toHaveBeenCalledTimes(2)
  })

  it('banco não revogado continua abortando, antes de tocar nos fornecedores', async () => {
    stubDeletion()
    vi.stubEnv('REVENUECAT_SECRET_KEY', 'rc-secreta')
    admin.from.mockImplementation(() => ({
      select: () => ({ eq: async () => ({ data: [{ item_id: 'item-1' }], error: null }) }),
    }))
    pluggy.getPluggyApiKey.mockResolvedValue('chave')
    pluggy.deletePluggyItem.mockRejectedValue(new Error('fora do ar'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await deleteAccount('EXCLUIR')

    expect(result.error).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled()
  })
})

describe('baixar meus dados', () => {
  type Page = { data: unknown[] | null; error: { code: string } | null }

  function stubExport(pages: Record<string, Page[]> = {}) {
    session.auth.getUser.mockResolvedValue({ data: { user: { id: USER, email: 'a@exemplo.com' } }, error: null })
    admin.rpc.mockResolvedValue({ data: true, error: null })
    const filters: [string, string, unknown][] = []
    const nextPage: Record<string, number> = {}
    session.from.mockImplementation((table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push([table, column, value])
          return query
        },
        order: () => query,
        range: async () => {
          const page = nextPage[table] ?? 0
          nextPage[table] = page + 1
          return pages[table]?.[page] ?? { data: [], error: null }
        },
      }
      return query
    })
    return filters
  }

  it('exige sessão', async () => {
    session.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect(await exportMyData()).toEqual({ error: 'Usuário não autenticado' })
    expect(session.from).not.toHaveBeenCalled()
  })

  it('respeita o limite de pedidos', async () => {
    stubExport()
    admin.rpc.mockResolvedValue({ data: false, error: null })
    expect((await exportMyData()).error).toContain('Muitos pedidos')
    expect(session.from).not.toHaveBeenCalled()
  })

  it('reúne todas as páginas, só da própria conta', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, index) => ({ id: index }))
    const filters = stubExport({
      synced_transactions: [
        { data: fullPage, error: null },
        { data: [{ id: 1000 }], error: null },
      ],
      bills: [{ data: [{ id: 'b1' }], error: null }],
    })

    const { json } = await exportMyData()
    const exported = JSON.parse(json ?? '{}')

    expect(exported.synced_transactions).toHaveLength(1001)
    expect(exported.bills).toEqual([{ id: 'b1' }])
    expect(exported.account).toEqual({ id: USER, email: 'a@exemplo.com' })
    for (const table of ['goals', 'investments', 'synced_accounts', 'synced_bills', 'subscriptions']) {
      expect(exported[table]).toEqual([])
    }
    expect(filters.every(([, column, value]) => column === 'user_id' && value === USER)).toBe(true)
  })

  it('tabela ausente vira lista vazia, mas outra falha não entrega cópia incompleta', async () => {
    stubExport({ synced_bills: [{ data: null, error: { code: 'PGRST205' } }] })
    expect(JSON.parse((await exportMyData()).json ?? '{}').synced_bills).toEqual([])

    stubExport({ goals: [{ data: null, error: { code: '500' } }] })
    const result = await exportMyData()
    expect(result.json).toBeUndefined()
    expect(result.error).toContain('Não foi possível')
  })
})
