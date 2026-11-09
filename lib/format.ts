// Formatação única de valores e datas em pt-BR. Telas não devem usar toFixed nem 'R$ ' concatenado.

const EMPTY = '—'
const TIME_ZONE = 'America/Sao_Paulo'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})
const dateParts = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})
const dateTimeParts = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const monthYear = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const pluralRules = new Intl.PluralRules('pt-BR')

type MaybeNumber = number | null | undefined

const isNumber = (value: MaybeNumber): value is number => typeof value === 'number' && Number.isFinite(value)

/** 'R$ 1.250,00'. Sempre duas casas; sem valor, '—'. */
export function formatBRL(value: MaybeNumber) {
  if (!isNumber(value)) return EMPTY
  // Evita '-R$ 0,00' quando o valor arredonda para zero.
  return brl.format(Math.abs(value) < 0.005 ? 0 : value)
}

/** Para eixos de gráfico: 'R$ 500', 'R$ 1,5 mil', 'R$ 2 mi'. */
export function formatBRLCompact(value: MaybeNumber) {
  if (!isNumber(value)) return EMPTY
  return brlCompact.format(Math.abs(value) < 0.05 ? 0 : value)
}

/**
 * Recebe o valor já em pontos percentuais: 12.5 vira '12,5%'.
 * Com signed, o sinal vem do valor arredondado, então nunca há '+-' nem '+0,0%'.
 */
export function formatPercent(value: MaybeNumber, options: { signed?: boolean; digits?: number } = {}) {
  if (!isNumber(value)) return EMPTY
  const digits = options.digits ?? 1
  const factor = 10 ** digits
  const rounded = Math.round(value * factor) / factor
  const normalized = rounded === 0 ? 0 : rounded
  const text = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(normalized)
  return `${options.signed && normalized > 0 ? '+' : ''}${text}%`
}

function partsOf(formatter: Intl.DateTimeFormat, date: Date) {
  const parts: Record<string, string> = {}
  for (const { type, value } of formatter.formatToParts(date)) parts[type] = value
  return parts
}

/**
 * '05/11' ou, com withYear, '05/11/2026'.
 * 'YYYY-MM-DD' é lido como texto: new Date() o trataria como UTC e voltaria um dia no Brasil.
 */
export function formatDate(iso: string | null | undefined, options: { withYear?: boolean } = {}) {
  if (!iso) return EMPTY
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return EMPTY
    return options.withYear ? `${day}/${month}/${year}` : `${day}/${month}`
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return EMPTY
  const { day, month, year } = partsOf(dateParts, date)
  return options.withYear ? `${day}/${month}/${year}` : `${day}/${month}`
}

/** '04/11 às 14:32', no horário de Brasília. */
export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return EMPTY
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return EMPTY
  const { day, month, hour, minute } = partsOf(dateTimeParts, date)
  return `${day}/${month} às ${hour}:${minute}`
}

/** 'novembro de 2026'. O mês vai de 1 a 12. */
export function formatMonthYear(year: number, month: number) {
  return monthYear.format(new Date(Date.UTC(year, month - 1, 15)))
}

/**
 * Devolve a contagem junto com a palavra: plural(3, 'ativo', 'ativos') é '3 ativos'.
 * As regras do pt tratam 0 como singular, mas no Brasil se escreve '0 ativos'.
 */
export function plural(count: number, singular: string, pluralForm: string) {
  const word = count !== 0 && pluralRules.select(count) === 'one' ? singular : pluralForm
  return `${count.toLocaleString('pt-BR')} ${word}`
}
