import { describe, expect, it, vi } from 'vitest'
import { hasPremiumAccess } from '@/lib/plans'
import { isStrongPassword, PASSWORD_RULES } from '@/lib/password-rules'
import { normalizeTicker } from '@/lib/tickers'
import { secretsMatch } from '@/lib/secure-compare'
import {
  nextTransactionsPath,
  toBillRow,
  toInvestmentRows,
  toTransactionRow,
  translateCategory,
} from '@/lib/pluggy/transactions'
import {
  cashFlowTrend,
  compareMonthToDate,
  compareWithPreviousMonth,
  fetchAllPages,
  findNextBillPayments,
  getBillsDueSoon,
  getInvoiceStatus,
  isSettledBill,
  lastMonths,
  transactionsToHistory,
  previousMonthRange,
  summarizeTransactions,
  todayInBrazil,
} from '@/lib/finance-insights'
import { itemStatusFields } from '@/lib/pluggy/errors'
import { billReminderEmail, escapeHtml, trialEndingEmail } from '@/lib/email/templates'

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

describe('investimentos da Pluggy', () => {
  it('preenche ticker_name, coluna obrigatória da tabela', () => {
    const [row] = toInvestmentRows([{ id: 'i1', code: 'petr4', type: 'EQUITY', subtype: 'STOCK', quantity: 2, value: 30 }], 'u1')
    expect(row).toMatchObject({ ticker: 'PETR4', ticker_name: 'PETR4', category: 'Ações', quantity: 2, price: 30, source: 'open_finance' })
  })

  it('renda fixa sem código vira uma posição com ticker curto', () => {
    const [row] = toInvestmentRows(
      [{ id: 'i2', name: 'CDB banco muito longo com nome enorme que nao cabe', type: 'FIXED_INCOME', subtype: 'CDB', balance: 1500 }],
      'u1',
    )
    expect(row.ticker.length).toBeLessThanOrEqual(24)
    expect(row).toMatchObject({ quantity: 1, price: 1500, category: 'Renda fixa' })
  })

  it('não repete ticker, o que faria toda a gravação falhar', () => {
    const rows = toInvestmentRows(
      [{ id: 'aaaaaaaa-1', code: 'MXRF11' }, { id: 'bbbbbbbb-2', code: 'MXRF11' }],
      'u1',
    )
    expect(new Set(rows.map((row) => row.ticker)).size).toBe(2)
  })

  it('grava o banco de origem e não envia provento', () => {
    const [row] = toInvestmentRows([{ id: 'i1', code: 'PETR4', quantity: 2, value: 30 }], 'u1', { itemId: 'item-1' })
    expect(row.item_id).toBe('item-1')
    expect(row).not.toHaveProperty('dividend_yield')
    const [semBanco] = toInvestmentRows([{ id: 'i1', code: 'PETR4', quantity: 2, value: 30 }], 'u1')
    expect(semBanco).not.toHaveProperty('item_id')
  })

  it('o mesmo ativo em outro banco recebe sufixo, sem sobrescrever a posição do primeiro', () => {
    const [row] = toInvestmentRows([{ id: 'bbbbbbbb-2', code: 'BOVA11', quantity: 1, value: 100 }], 'u1', {
      reservedTickers: ['BOVA11'],
    })
    expect(row.ticker).toBe('BOVA11-BBBBBBBB')
  })

  it('custo vem da Pluggy; sem ele fica nulo, nunca o preço atual', () => {
    const [comCusto] = toInvestmentRows([{ id: 'i1', code: 'A', quantity: 4, value: 30, amountOriginal: 100 }], 'u1')
    expect(comCusto.avg_price).toBe(25)
    const [semCusto] = toInvestmentRows([{ id: 'i2', code: 'B', quantity: 4, value: 30 }], 'u1')
    expect(semCusto.avg_price).toBeNull()
    const [custoZero] = toInvestmentRows([{ id: 'i3', code: 'C', quantity: 4, value: 30, amountOriginal: 0 }], 'u1')
    expect(custoZero.avg_price).toBeNull()
  })
})

describe('moeda e status do banco', () => {
  it('compra internacional usa o valor na moeda da conta', () => {
    const base = { id: 't1', accountId: 'a1', type: 'DEBIT', date: '2026-10-05', category: 'Compras' }
    expect(toTransactionRow({ ...base, amount: 10, amountInAccountCurrency: 55.3 }, 'u', 'i').amount).toBe(55.3)
    expect(toTransactionRow({ ...base, amount: 10 }, 'u', 'i').amount).toBe(10)
  })

  it('só limpa o erro do banco quando o item está UPDATED', () => {
    expect(itemStatusFields({ status: 'UPDATED' })).toEqual({ item_status: 'UPDATED', error_type: null, error_message: null })
    expect(itemStatusFields({ status: 'UPDATING' })).toEqual({ item_status: 'UPDATING' })
    expect(itemStatusFields({ status: 'LOGIN_ERROR', error: { code: 'INVALID' } })).toEqual({
      item_status: 'LOGIN_ERROR',
      error_type: 'INVALID',
      error_message: 'O acesso expirou. Toque em Reconectar; seu histórico é mantido',
    })
  })
})

describe('leitura paginada', () => {
  it('lê até uma página vazia, mesmo com o servidor limitando abaixo do pedido', async () => {
    const rows = Array.from({ length: 2500 }, (_, index) => index)
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      // Simula um limite de 700 linhas por resposta, menor que a página pedida.
      data: rows.slice(from, Math.min(to + 1, from + 700)),
      error: null,
    }))
    expect(await fetchAllPages<number>(fetchPage)).toEqual(rows)
  })

  it('propaga o erro em vez de devolver a lista parcial', async () => {
    const failure = { code: '500' }
    await expect(fetchAllPages(async () => ({ data: null, error: failure }))).rejects.toBe(failure)
  })
})

describe('faturas e histórico do Open Finance', () => {
  it('monta a linha da fatura sem horário na data', () => {
    const row = toBillRow(
      { id: 'b1', dueDate: '2026-11-10T00:00:00.000Z', totalAmount: 250.5, payments: [] },
      { id: 'a1', name: 'Cartão X' },
      'u1',
      'item1',
    )
    expect(row).toMatchObject({ due_date: '2026-11-10', total_amount: 250.5, has_payments: false, account_name: 'Cartão X' })
  })

  it('soma pagamentos e encargos, e distingue lista ausente de lista vazia', () => {
    const account = { id: 'a1', name: 'Cartão X' }
    const paid = toBillRow(
      {
        id: 'b1',
        dueDate: '2026-11-10',
        totalAmount: 300,
        payments: [{ amount: 100.1 }, { amount: 200.2 }],
        financeCharges: [{ amount: 12.5 }],
      },
      account,
      'u1',
      'item1',
    )
    expect(paid).toMatchObject({ has_payments: true, payments_total: 300.3, finance_charges_total: 12.5 })

    const empty = toBillRow({ id: 'b2', dueDate: '2026-11-10', totalAmount: 300, payments: [] }, account, 'u1', 'item1')
    expect(empty).toMatchObject({ has_payments: false, payments_total: 0, finance_charges_total: null })
  })

  describe('status da fatura, pelos pagamentos da fatura seguinte', () => {
    const invoice = { totalAmount: 1000, dueDate: '2026-11-20', today: '2026-11-03' }
    const overdue = { totalAmount: 1000, dueDate: '2026-10-20', today: '2026-11-03' }

    it('só é paga quando os pagamentos cobrem o total', () => {
      expect(getInvoiceStatus({ ...overdue, nextBillPayments: 1000 })).toBe('paid')
      expect(getInvoiceStatus({ ...overdue, nextBillPayments: 999.995 })).toBe('paid')
      expect(getInvoiceStatus({ ...overdue, nextBillPayments: 1200 })).toBe('paid')
    })

    it('pagamento menor que o total é parcial', () => {
      expect(getInvoiceStatus({ ...overdue, nextBillPayments: 100 })).toBe('partial')
      expect(getInvoiceStatus({ ...invoice, nextBillPayments: 100 })).toBe('partial')
    })

    it('antes do vencimento, sem pagamento, fica pendente', () => {
      expect(getInvoiceStatus({ ...invoice, nextBillPayments: null })).toBe('pending')
      expect(getInvoiceStatus({ ...invoice, nextBillPayments: 0 })).toBe('pending')
      expect(getInvoiceStatus({ ...invoice, today: '2026-11-20', nextBillPayments: null })).toBe('pending')
    })

    it('vencida sem informação não é paga nem atrasada', () => {
      expect(getInvoiceStatus({ ...overdue, nextBillPayments: null })).toBe('unconfirmed')
      expect(getInvoiceStatus({ ...overdue, nextBillPayments: 0 })).toBe('unconfirmed')
    })
  })

  it('procura os pagamentos na próxima fatura do mesmo cartão', () => {
    const invoices = [
      { pluggy_account_id: 'a', due_date: '2026-10-10', payments_total: 1 },
      { pluggy_account_id: 'a', due_date: '2026-11-10', payments_total: '250.50' },
      { pluggy_account_id: 'a', due_date: '2026-12-10', payments_total: 999 },
      { pluggy_account_id: 'b', due_date: '2026-10-20', payments_total: 777 },
      { pluggy_account_id: 'c', due_date: '2026-10-10', payments_total: null },
      { pluggy_account_id: 'c', due_date: '2026-11-10', payments_total: null },
    ]
    expect(findNextBillPayments(invoices[0], invoices)).toBe(250.5)
    expect(findNextBillPayments(invoices[2], invoices)).toBeNull()
    expect(findNextBillPayments(invoices[4], invoices)).toBeNull()
  })

  it('fatura vencida nunca é acusada de atraso, e conta manual é', () => {
    const today = '2026-11-03'
    const { overdue } = getBillsDueSoon(
      [
        { title: 'Fatura', amount: 10, due_date: '2026-10-20', status: 'unconfirmed', read_only: true },
        { title: 'Luz', amount: 10, due_date: '2026-10-20', status: 'pending' },
      ],
      today,
    )
    expect(overdue.map((bill) => bill.title)).toEqual(['Luz'])
  })

  it('só o status pago conta como quitado', () => {
    expect(isSettledBill('paid')).toBe(true)
    expect(isSettledBill('PAID')).toBe(true)
    for (const status of ['partial', 'unconfirmed', 'pending', null]) expect(isSettledBill(status)).toBe(false)
  })

  it('compra no cartão vem positiva como DEBIT e continua sendo saída', () => {
    const summary = summarizeTransactions([{ amount: 100, type: 'DEBIT', category: 'Compras' }])
    expect(summary).toMatchObject({ income: 0, expense: 100 })
  })

  it('traduz as categorias reais e separa transferência interna', () => {
    expect(translateCategory('Transfer - Internal')).toBe('Transferência entre contas')
    expect(translateCategory('Food delivery')).toBe('Delivery')
    const history = transactionsToHistory([
      { date: '2026-10-05', amount: -50, type: 'DEBIT', category: 'Mercado' },
      { date: '2026-10-06', amount: 500, type: 'CREDIT', category: 'Transferência entre contas' },
      { date: '2026-11-01', amount: 900, type: 'CREDIT', category: 'Salário' },
    ])
    expect(history).toEqual([
      { month: 'Out', year: 2026, monthNum: 10, expense: 50, income: 0 },
      { month: 'Nov', year: 2026, monthNum: 11, expense: 0, income: 900 },
    ])
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

describe('comparação até o mesmo dia', () => {
  const debit = (date: string, amount: number, category = 'Compras') => ({ date, amount, type: 'DEBIT', category })

  it('compara o mesmo trecho dos dois meses, com a mesma regra de gastos', () => {
    const result = compareMonthToDate(
      [
        debit('2026-10-01', 100),
        debit('2026-10-04', 50),
        debit('2026-10-05', 999),
        debit('2026-10-02', 777, 'Pagamento de fatura'),
        debit('2026-11-02', 30),
      ],
      '2026-11-04',
    )
    expect(result).toEqual({ currentToDay: 30, previousToDay: 150, day: 4 })
  })

  it('sem o início do mês anterior no extrato, não compara', () => {
    expect(compareMonthToDate([debit('2026-10-02', 100), debit('2026-11-02', 30)], '2026-11-04')).toBeNull()
    expect(compareMonthToDate([], '2026-11-04')).toBeNull()
  })

  it('dia 31 contra um mês mais curto inclui o mês anterior inteiro', () => {
    const result = compareMonthToDate([debit('2026-11-01', 10), debit('2026-11-30', 20), debit('2026-12-31', 5)], '2026-12-31')
    expect(result).toEqual({ currentToDay: 5, previousToDay: 30, day: 31 })
  })
})

describe('fluxo de caixa', () => {
  const month = (year: number, monthNum: number, income: number, expense: number) => ({ year, monthNum, income, expense })
  const today = '2026-11-04'

  it('lastMonths traz 6 meses até o atual, sem os futuros', () => {
    const history = [month(2026, 4, 0, 1), month(2026, 5, 0, 1), month(2026, 11, 0, 1), month(2026, 12, 0, 1)]
    expect(lastMonths(history, today, 6).map((item) => item.monthNum)).toEqual([11])
    const virada = [month(2025, 12, 0, 1), month(2026, 1, 0, 1), month(2026, 2, 0, 1)]
    expect(lastMonths(virada, '2026-02-10', 6)).toHaveLength(3)
  })

  const closed = (values: [number, number][]) => values.map(([income, expense], index) => month(2026, 5 + index, income, expense))

  it('não afirma tendência sem 6 meses fechados', () => {
    expect(cashFlowTrend(closed([[100, 50], [100, 50], [100, 50], [100, 50], [100, 50]]), today)).toBeNull()
  })

  it('não afirma tendência sem entradas reais', () => {
    expect(cashFlowTrend(closed(Array(6).fill([0, 50])), today)).toBeNull()
  })

  it('compara os 3 últimos meses fechados com os 3 anteriores, sem o mês corrente', () => {
    const up = closed([[100, 90], [100, 90], [100, 90], [100, 50], [100, 50], [100, 50]])
    // O mês corrente, ainda sem gastos, não pode mudar o resultado.
    expect(cashFlowTrend([...up, month(2026, 11, 100, 0)], today)).toBe('up')
    expect(cashFlowTrend(closed([[100, 50], [100, 50], [100, 50], [100, 90], [100, 90], [100, 90]]), today)).toBe('down')
    expect(cashFlowTrend(closed(Array(6).fill([100, 50])), today)).toBe('stable')
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

  it('avisa o fim do teste com a data certa', () => {
    const notice = trialEndingEmail({ endDate: '2026-11-07', daysLeft: 3 }, 'https://app.example')
    expect(notice.subject).toBe('Seu teste grátis termina em 3 dias')
    expect(notice.html).toContain('07/11/2026')
    expect(trialEndingEmail({ endDate: '2026-11-07', daysLeft: 0 }, 'https://app.example').subject).toBe(
      'Seu teste grátis termina hoje',
    )
  })
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
