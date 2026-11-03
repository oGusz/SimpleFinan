import { describe, expect, it, vi } from 'vitest'
import { hasPremiumAccess } from '@/lib/plans'
import { isStrongPassword, PASSWORD_RULES } from '@/lib/password-rules'
import { normalizeTicker } from '@/lib/tickers'
import { secretsMatch } from '@/lib/secure-compare'
import { nextTransactionsPath, toTransactionRow, translateCategory } from '@/lib/pluggy/transactions'
import {
  compareWithPreviousMonth,
  getBillsDueSoon,
  previousMonthRange,
  summarizeTransactions,
  todayInBrazil,
} from '@/lib/finance-insights'
import { billReminderEmail, escapeHtml } from '@/lib/email/templates'

const future = new Date(Date.now() + 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()

describe('hasPremiumAccess', () => {
  it('libera assinatura ativa e concessão sem expiração', () => {
    expect(hasPremiumAccess({ plan: 'premium', status: 'active', current_period_end: future })).toBe(true)
    expect(hasPremiumAccess({ plan: 'premium', status: 'active', current_period_end: null })).toBe(true)
  })

  it('mantém o acesso de quem cancelou até o fim do período', () => {
    expect(hasPremiumAccess({ plan: 'premium', status: 'canceled', current_period_end: future })).toBe(true)
    expect(hasPremiumAccess({ plan: 'premium', status: 'canceled', current_period_end: past })).toBe(false)
  })

  it('bloqueia teste vencido, expirado e quem não tem assinatura', () => {
    expect(hasPremiumAccess({ plan: 'premium', status: 'active', current_period_end: past })).toBe(false)
    expect(hasPremiumAccess({ plan: 'premium', status: 'expired', current_period_end: null })).toBe(false)
    expect(hasPremiumAccess({ plan: 'free', status: 'active', current_period_end: null })).toBe(false)
    expect(hasPremiumAccess(null)).toBe(false)
  })
})

describe('senha', () => {
  it('exige todos os requisitos', () => {
    expect(isStrongPassword('Senha-forte1')).toBe(true)
    for (const weak of ['Ab1!', 'senha-forte1', 'SENHA-FORTE1', 'Senha-forte', 'SenhaForte1', '']) {
      expect(isStrongPassword(weak)).toBe(false)
    }
  })

  it('aceita acentos como letras, não como caractere especial', () => {
    const special = PASSWORD_RULES[4]
    expect(special.test('Ação1234')).toBe(false)
    expect(special.test('Ação1234!')).toBe(true)
  })
})

describe('ticker', () => {
  it('normaliza e recusa entradas perigosas', () => {
    expect(normalizeTicker(' mxrf11 ')).toBe('MXRF11')
    expect(normalizeTicker('a/../b')).toBeNull()
    expect(normalizeTicker('x&token=1')).toBeNull()
  })
})

describe('secretsMatch', () => {
  it('compara segredos e nega quando não há segredo configurado', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true)
    expect(secretsMatch('abc', 'abd')).toBe(false)
    expect(secretsMatch(null, 'abc')).toBe(false)
    expect(secretsMatch('abc', undefined)).toBe(false)
    expect(secretsMatch('', '')).toBe(false)
  })
})

describe('transações da Pluggy', () => {
  it('traduz categorias conhecidas e preserva as desconhecidas', () => {
    expect(translateCategory('Groceries')).toBe('Mercado')
    expect(translateCategory('Algo novo')).toBe('Algo novo')
    expect(translateCategory(null)).toBe('Outros')
  })

  it('monta a linha com o dono recebido e a data sem horário', () => {
    const row = toTransactionRow(
      { id: 't1', accountId: 'a1', amount: -10.5, type: 'DEBIT', date: '2026-10-05T12:00:00.000Z', category: 'Groceries', description: 'Mercado X' },
      'user-1',
      'item-1',
    )
    expect(row).toMatchObject({ user_id: 'user-1', item_id: 'item-1', date: '2026-10-05', category: 'Mercado', amount: -10.5 })
  })

  it('segue o cursor até acabar', () => {
    expect(nextTransactionsPath('?accountId=a&after=x')).toBe('/v2/transactions?accountId=a&after=x')
    expect(nextTransactionsPath(null)).toBeNull()
  })

  it('não conta transferência entre contas nem fatura como gasto', () => {
    const summary = summarizeTransactions([
      { amount: -100, type: 'DEBIT', category: 'Mercado' },
      { amount: -300, type: 'DEBIT', category: 'Moradia' },
      { amount: -999, type: 'DEBIT', category: 'Transferência entre contas' },
      { amount: -500, type: 'DEBIT', category: 'Pagamento de fatura' },
      { amount: 2000, type: 'CREDIT', category: 'Salário' },
    ])
    expect(summary.income).toBe(2000)
    expect(summary.expense).toBe(400)
    expect(summary.byCategory[0]).toMatchObject({ category: 'Moradia', total: 300, percent: 75 })
  })
})

describe('contas e resumo', () => {
  const bill = (due_date: string, status = 'pending') => ({ amount: 10, due_date, status })

  it('separa atrasadas e próximas, ignorando as pagas', () => {
    const { overdue, dueSoon } = getBillsDueSoon(
      [bill('2026-11-01'), bill('2026-11-03'), bill('2026-11-06T00:00:00Z'), bill('2026-11-07'), bill('2026-11-04', 'paid')],
      '2026-11-03',
    )
    expect(overdue).toHaveLength(1)
    expect(dueSoon).toHaveLength(2)
  })

  it('compara com o mês anterior, inclusive na virada do ano', () => {
    const history = [
      { year: 2025, monthNum: 12, expense: 100 },
      { year: 2026, monthNum: 1, expense: 150 },
    ]
    expect(compareWithPreviousMonth(history, 1, 2026).changePercent).toBe(50)
    expect(compareWithPreviousMonth(history, 12, 2025).changePercent).toBeNull()
  })

  it('calcula o mês anterior para o resumo', () => {
    expect(previousMonthRange('2026-03-01')).toEqual({ key: '2026-02', start: '2026-02-01', end: '2026-02-28' })
    expect(previousMonthRange('2026-01-01')).toEqual({ key: '2025-12', start: '2025-12-01', end: '2025-12-31' })
  })

  it('usa a data do Brasil, não a do servidor', () => {
    expect(todayInBrazil(new Date('2026-11-04T01:00:00Z'))).toBe('2026-11-03')
  })
})

describe('e-mail', () => {
  it('escapa o título digitado pelo usuário', () => {
    expect(escapeHtml('<img src=x>')).toBe('&lt;img src=x&gt;')
    const { html } = billReminderEmail(
      [{ title: '<script>alert(1)</script>', amount: 10, due_date: '2026-11-05' }],
      'https://app.example',
    )
    expect(html).not.toContain('<script>')
    expect(html).toContain('05/11/2026')
  })
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
