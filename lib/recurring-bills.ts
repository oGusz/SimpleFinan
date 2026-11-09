export interface RecurringSourceRow {
  title?: string | null
  amount: number | string
  due_date: string
  category?: string | null
}

export interface ExistingBillRow {
  title?: string | null
}

export interface BillSkip {
  title_key: string
  month: string
}

export interface GeneratedBill {
  title: string
  amount: number
  due_date: string
  category: string
  is_recurring: true
  status: 'pending'
}

const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/

/** A série é identificada pelo título: 'Aluguel' e ' aluguel ' são a mesma conta. */
export function normalizeBillTitle(title: string | null | undefined) {
  return (title ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * Um dia reduzido pelo fim do mês (31 que virou 28) não pode valer para os meses seguintes.
 * Fora desse caso vale o dia da linha mais recente, porque foi a pessoa quem o escolheu ao editar.
 */
function resolveSeriesDay(rows: RecurringSourceRow[], latest: RecurringSourceRow) {
  const dayOf = (row: RecurringSourceRow) => Number(row.due_date.slice(8, 10))
  const [year, month] = latest.due_date.slice(0, 7).split('-').map(Number)
  if (dayOf(latest) < lastDayOfMonth(year, month)) return dayOf(latest)
  return Math.max(...rows.map(dayOf))
}

/**
 * Decide o que falta criar em um mês, sem acessar o banco, para a tela e a rotina diária
 * seguirem a mesma regra. Mês passado não gera nada: abrir o histórico não cria pendência.
 */
export function buildRecurringRows({
  recurringRows,
  existingBills,
  skips,
  year,
  month,
  currentMonth,
}: {
  recurringRows: RecurringSourceRow[]
  existingBills: ExistingBillRow[]
  skips: BillSkip[]
  year: number
  month: number
  currentMonth: string
}): GeneratedBill[] {
  const target = monthKey(year, month)
  if (target < currentMonth) return []

  const existing = new Set(existingBills.map((bill) => normalizeBillTitle(bill.title)))
  const skipped = new Set(
    skips.filter((skip) => skip.month === target).map((skip) => skip.title_key),
  )

  const series = new Map<string, RecurringSourceRow[]>()
  for (const row of recurringRows) {
    if (!ISO_DATE_PREFIX.test(row.due_date ?? '')) continue
    // Só conta o que já existia no mês consultado: valor futuro não muda o passado.
    if (row.due_date.slice(0, 7) > target) continue
    const key = normalizeBillTitle(row.title)
    series.set(key, [...(series.get(key) ?? []), row])
  }

  const generated: GeneratedBill[] = []
  for (const [key, rows] of series) {
    if (existing.has(key) || skipped.has(key)) continue

    const latest = rows.reduce((newest, row) =>
      row.due_date.slice(0, 10) > newest.due_date.slice(0, 10) ? row : newest,
    )
    const day = Math.min(resolveSeriesDay(rows, latest), lastDayOfMonth(year, month))

    generated.push({
      title: latest.title ?? '',
      amount: Number(latest.amount) || 0,
      due_date: `${target}-${String(day).padStart(2, '0')}`,
      category: latest.category || 'Outros',
      is_recurring: true,
      status: 'pending',
    })
  }
  return generated
}
