import { describe, expect, it } from 'vitest'
import {
  formatBRL,
  formatBRLCompact,
  formatDate,
  formatDateTime,
  formatMonthYear,
  formatPercent,
  plural,
} from '@/lib/format'
import { GOAL_CATEGORIES, normalizeGoalCategory } from '@/lib/goal-categories'
import { missingLegalFields } from '@/lib/legal'
import { parseDecimalInput } from '@/lib/parse-number'

// O Intl separa 'R$' do valor com espaço não separável.
const spaced = (text: string) => text.replace(/ /g, ' ')

describe('formatBRL', () => {
  it('usa sempre duas casas', () => {
    expect(spaced(formatBRL(1250))).toBe('R$ 1.250,00')
    expect(spaced(formatBRL(30.765))).toBe('R$ 30,77')
  })

  it('não mostra zero negativo', () => {
    expect(spaced(formatBRL(-0.001))).toBe('R$ 0,00')
  })

  it('sem valor mostra travessão, nunca zero', () => {
    expect(formatBRL(null)).toBe('—')
    expect(formatBRL(undefined)).toBe('—')
    expect(formatBRL(Number.NaN)).toBe('—')
  })
})

describe('formatBRLCompact', () => {
  it('abrevia com vírgula e sem R$ 0k', () => {
    expect(spaced(formatBRLCompact(500))).toBe('R$ 500')
    expect(spaced(formatBRLCompact(1500))).toBe('R$ 1,5 mil')
    expect(spaced(formatBRLCompact(2_000_000))).toBe('R$ 2 mi')
    expect(spaced(formatBRLCompact(0))).toBe('R$ 0')
  })
})

describe('formatPercent', () => {
  it('usa vírgula decimal', () => {
    expect(formatPercent(12.5)).toBe('12,5%')
    expect(formatPercent(12.345, { digits: 2 })).toBe('12,35%')
  })

  it('negativo nunca vira +-', () => {
    expect(formatPercent(-3.2, { signed: true })).toBe('-3,2%')
    expect(formatPercent(-3.2)).toBe('-3,2%')
  })

  it('positivo só leva + quando pedido', () => {
    expect(formatPercent(3.2, { signed: true })).toBe('+3,2%')
    expect(formatPercent(3.2)).toBe('3,2%')
  })

  it('zero não tem sinal, mesmo depois de arredondar', () => {
    expect(formatPercent(0, { signed: true })).toBe('0,0%')
    expect(formatPercent(0.01, { signed: true })).toBe('0,0%')
    expect(formatPercent(-0.01, { signed: true })).toBe('0,0%')
  })

  it('sem valor mostra travessão', () => {
    expect(formatPercent(null)).toBe('—')
  })
})

describe('formatDate', () => {
  it('não desloca a data pelo fuso', () => {
    expect(formatDate('2026-11-05')).toBe('05/11')
    expect(formatDate('2026-01-01', { withYear: true })).toBe('01/01/2026')
  })

  it('lê data e hora no horário de Brasília', () => {
    expect(formatDate('2026-11-05T01:00:00Z', { withYear: true })).toBe('04/11/2026')
  })

  it('valor ausente ou inválido vira travessão', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('nada')).toBe('—')
    expect(formatDate('2026-13-01')).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('usa o horário de Brasília', () => {
    expect(formatDateTime('2026-11-04T17:32:00Z')).toBe('04/11 às 14:32')
    expect(formatDateTime('2026-11-05T03:05:00Z')).toBe('05/11 às 00:05')
  })

  it('valor ausente vira travessão', () => {
    expect(formatDateTime(undefined)).toBe('—')
  })
})

describe('formatMonthYear', () => {
  it('escreve o mês por extenso, de 1 a 12', () => {
    expect(formatMonthYear(2026, 11)).toBe('novembro de 2026')
    expect(formatMonthYear(2026, 1)).toBe('janeiro de 2026')
    expect(formatMonthYear(2026, 12)).toBe('dezembro de 2026')
  })
})

describe('plural', () => {
  it('escolhe a forma e inclui a contagem', () => {
    expect(plural(1, 'ativo', 'ativos')).toBe('1 ativo')
    expect(plural(2, 'ativo', 'ativos')).toBe('2 ativos')
    expect(plural(0, 'ativo', 'ativos')).toBe('0 ativos')
    expect(plural(1000, 'ativo', 'ativos')).toBe('1.000 ativos')
  })
})

describe('parseDecimalInput', () => {
  it.each([
    ['1,5', 1.5],
    ['1.5', 1.5],
    ['1.000', 1000],
    ['1.000,50', 1000.5],
    ['1,000.50', 1000.5],
    ['1.000.000', 1000000],
    ['1.000.000,25', 1000000.25],
    ['0.125', 0.125],
    ['10.25', 10.25],
    ['1234', 1234],
    ['1234,56', 1234.56],
    ['R$ 1.250,00', 1250],
    ['-1,5', -1.5],
    [' 7 ', 7],
  ])('%s vira %s', (text, expected) => {
    expect(parseDecimalInput(text)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '1.2.3', '1,2,3', ',', '12.34,5'])('"%s" vira null', (text) => {
    expect(parseDecimalInput(text)).toBeNull()
  })

  it('aceita null', () => {
    expect(parseDecimalInput(null)).toBeNull()
  })
})

describe('normalizeGoalCategory', () => {
  it('aceita os identificadores atuais', () => {
    for (const category of GOAL_CATEGORIES) expect(normalizeGoalCategory(category.id)).toBe(category.id)
  })

  it('converte os rótulos antigos', () => {
    expect(normalizeGoalCategory('Reserva')).toBe('emergency')
    expect(normalizeGoalCategory('Viagem')).toBe('travel')
    expect(normalizeGoalCategory('Bens')).toBe('home')
    expect(normalizeGoalCategory('Investimento')).toBe('investment')
    expect(normalizeGoalCategory('Outros')).toBe('other')
  })

  it('valor desconhecido vira outros', () => {
    expect(normalizeGoalCategory('qualquer')).toBe('other')
    expect(normalizeGoalCategory(null)).toBe('other')
  })
})

describe('missingLegalFields', () => {
  const complete = {
    companyName: 'A',
    documentId: 'B',
    privacyEmail: 'C',
    supportEmail: 'D',
    city: 'E',
    effectiveDate: 'F',
  }

  it('lista os campos vazios', () => {
    expect(missingLegalFields(complete)).toEqual([])
    expect(missingLegalFields({ ...complete, city: '', documentId: '' })).toEqual(['documentId', 'city'])
  })
})
