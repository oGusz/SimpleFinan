// Argumentos de Server Actions vêm de quem chama e não passam pela validação da tela.

// O banco guarda valores em NUMERIC(14, 2).
const MAX_AMOUNT = 999_999_999_999

export const MAX_TITLE_LENGTH = 120

export function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_AMOUNT
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isValidMonth(month: unknown, year: unknown) {
  return (
    Number.isInteger(month) &&
    Number.isInteger(year) &&
    (month as number) >= 1 &&
    (month as number) <= 12 &&
    (year as number) >= 2000 &&
    (year as number) <= 2100
  )
}
