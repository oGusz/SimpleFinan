import { describe, expect, it } from 'vitest'
import { buildRecurringRows, monthKey, normalizeBillTitle } from '@/lib/recurring-bills'

const row = (due_date: string, amount = 100, title = 'Aluguel') => ({ title, amount, due_date, category: 'Moradia' })

function build(overrides: Partial<Parameters<typeof buildRecurringRows>[0]> = {}) {
  return buildRecurringRows({
    recurringRows: [],
    existingBills: [],
    skips: [],
    year: 2026,
    month: 11,
    currentMonth: '2026-11',
    ...overrides,
  })
}

describe('título da série', () => {
  it('ignora espaços e maiúsculas', () => {
    expect(normalizeBillTitle('  Conta   de LUZ ')).toBe('conta de luz')
    expect(normalizeBillTitle(null)).toBe('')
  })

  it('monta a chave do mês com dois dígitos', () => {
    expect(monthKey(2026, 3)).toBe('2026-03')
  })
})

describe('buildRecurringRows', () => {
  it('cria a conta do mês como pendente, mesmo a origem tendo sido paga', () => {
    expect(build({ recurringRows: [row('2026-10-05')] })).toEqual([
      {
        title: 'Aluguel',
        amount: 100,
        due_date: '2026-11-05',
        category: 'Moradia',
        is_recurring: true,
        status: 'pending',
      },
    ])
  })

  it('agrupa pelo título normalizado e não duplica', () => {
    const rows = build({ recurringRows: [row('2026-09-05', 100, 'Aluguel'), row('2026-10-05', 100, ' aluguel ')] })
    expect(rows).toHaveLength(1)
  })

  it('séries de títulos diferentes geram contas separadas', () => {
    const rows = build({ recurringRows: [row('2026-10-05', 100, 'Aluguel'), row('2026-10-10', 50, 'Internet')] })
    expect(rows.map((item) => item.title).sort()).toEqual(['Aluguel', 'Internet'])
  })

  it('usa o valor mais recente, em qualquer ordem de leitura', () => {
    const recurringRows = [row('2026-10-05', 150), row('2026-08-05', 100), row('2026-09-05', 120)]
    expect(build({ recurringRows })[0].amount).toBe(150)
  })

  it('valor de um mês futuro não vale para o mês consultado', () => {
    const recurringRows = [row('2026-10-05', 100), row('2027-01-05', 300)]
    expect(build({ recurringRows })[0].amount).toBe(100)
  })

  it('31 limita ao fim do mês e volta a 31 depois de fevereiro', () => {
    const recurringRows = [row('2027-01-31')]
    const february = build({ recurringRows, year: 2027, month: 2 })
    expect(february[0].due_date).toBe('2027-02-28')

    const march = build({ recurringRows: [...recurringRows, row(february[0].due_date)], year: 2027, month: 3 })
    expect(march[0].due_date).toBe('2027-03-31')
  })

  it('respeita ano bissexto', () => {
    expect(build({ recurringRows: [row('2028-01-31')], year: 2028, month: 2, currentMonth: '2028-01' })[0].due_date).toBe(
      '2028-02-29',
    )
  })

  it('dia mudado pela pessoa vale para os meses seguintes', () => {
    const recurringRows = [row('2026-09-20'), row('2026-10-05')]
    expect(build({ recurringRows })[0].due_date).toBe('2026-11-05')
  })

  it('aceita data com horário', () => {
    expect(build({ recurringRows: [row('2026-10-05T00:00:00+00:00')] })[0].due_date).toBe('2026-11-05')
  })

  it('abrir mês passado não cria pendência', () => {
    expect(build({ recurringRows: [row('2026-01-05')], year: 2026, month: 10 })).toEqual([])
  })

  it('não gera antes da origem', () => {
    expect(build({ recurringRows: [row('2026-12-05')] })).toEqual([])
  })

  it('não gera se a conta já existe no mês', () => {
    expect(build({ recurringRows: [row('2026-10-05')], existingBills: [{ title: 'ALUGUEL' }] })).toEqual([])
  })

  it('não gera se a pessoa pulou o mês, mas gera no seguinte', () => {
    const recurringRows = [row('2026-10-05')]
    const skips = [{ title_key: 'aluguel', month: '2026-11' }]
    expect(build({ recurringRows, skips })).toEqual([])
    expect(build({ recurringRows, skips, year: 2026, month: 12 })).toHaveLength(1)
  })

  it('ignora linha com data inválida', () => {
    expect(build({ recurringRows: [row('')] })).toEqual([])
  })

  it('funciona na virada do ano', () => {
    const rows = build({ recurringRows: [row('2026-12-15')], year: 2027, month: 1 })
    expect(rows[0].due_date).toBe('2027-01-15')
  })
})
