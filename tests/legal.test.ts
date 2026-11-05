import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import robots from '@/app/robots'
import { missingLegalFields } from '@/lib/legal'
import { rateLimitKey } from '@/lib/rate-limit'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

const root = path.resolve(import.meta.dirname, '..')
const source = (file: string) => readFileSync(path.join(root, file), 'utf8')

const PUBLIC_PATHS = ['/sobre', '/suporte', '/excluir-conta']
const PLACEHOLDER = /\[[A-ZÀ-Ú][A-ZÀ-Ú \/]+\]/

const COMPLETE = {
  companyName: 'Empresa',
  documentId: '000',
  privacyEmail: 'privacidade@exemplo.com',
  supportEmail: 'suporte@exemplo.com',
  city: 'Cidade/UF',
  effectiveDate: '01/01/2030',
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('páginas legais', () => {
  it.each(['app/termos/page.tsx', 'app/privacidade/page.tsx'])('%s não tem campo entre colchetes', (file) => {
    expect(source(file)).not.toMatch(PLACEHOLDER)
  })

  it('o padrão pega campo em branco, mas não classe do Tailwind', () => {
    expect('Operado por [RAZÃO SOCIAL OU NOME]').toMatch(PLACEHOLDER)
    expect('Foro: [CIDADE/UF]').toMatch(PLACEHOLDER)
    expect('text-[11px] max-h-[85dvh]').not.toMatch(PLACEHOLDER)
  })

  it('a privacidade descreve o tratamento real dos dados', () => {
    const privacy = source('app/privacidade/page.tsx')
    expect(privacy).toContain('Importamos até 90 dias a cada sincronização e guardamos enquanto a conexão existir')
    expect(privacy).toContain('faturas de cartão')
    expect(privacy).toContain('Baixar meus dados')
    expect(privacy).not.toContain('cifrada')
  })
})

describe('missingLegalFields', () => {
  it('detecta campos vazios', () => {
    expect(missingLegalFields({ ...COMPLETE, documentId: '', city: '' })).toEqual(['documentId', 'city'])
  })

  it('não acusa nada com tudo preenchido', () => {
    expect(missingLegalFields(COMPLETE)).toEqual([])
  })
})

describe('páginas públicas', () => {
  it('o middleware libera as novas rotas sem tornar o painel público', () => {
    const list = source('middleware.ts').match(/const isPublicPath = \[([^\]]+)\]/)?.[1] ?? ''
    for (const route of PUBLIC_PATHS) expect(list).toContain(`'${route}'`)
    expect(list).not.toContain(`'/'`)
  })

  it('o robots libera as novas rotas e mantém o restante fechado', () => {
    const rules = robots().rules
    if (Array.isArray(rules)) throw new Error('esperava uma única regra')
    expect(rules.allow).toEqual(expect.arrayContaining(PUBLIC_PATHS))
    expect(rules.disallow).toBe('/')
  })
})

describe('rateLimitKey', () => {
  it('muda quando há segredo e não depende de maiúsculas', () => {
    vi.stubEnv('RATE_LIMIT_SECRET', '')
    const plain = rateLimitKey('login-ip', '203.0.113.7')

    vi.stubEnv('RATE_LIMIT_SECRET', 'segredo-a')
    const withSecret = rateLimitKey('login-email', 'Pessoa@Exemplo.com ')
    expect(withSecret).toBe(rateLimitKey('login-email', 'pessoa@exemplo.com'))
    expect(withSecret).not.toContain('exemplo')
    expect(rateLimitKey('login-ip', '203.0.113.7')).not.toBe(plain)

    vi.stubEnv('RATE_LIMIT_SECRET', 'segredo-b')
    expect(rateLimitKey('login-email', 'pessoa@exemplo.com')).not.toBe(withSecret)
  })
})

describe('check-release', () => {
  it('falha e lista as variáveis legais ausentes', () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('NEXT_PUBLIC_LEGAL_')),
    ) as NodeJS.ProcessEnv
    const result = spawnSync(process.execPath, ['scripts/check-release.mjs'], { cwd: root, env, encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('NEXT_PUBLIC_LEGAL_COMPANY_NAME')
    expect(result.stderr).toContain('NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE')
  })
})
