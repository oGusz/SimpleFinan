'use client'

import Link from 'next/link'
import { AlertTriangle, Building2, ChevronRight } from 'lucide-react'
import type { OpenFinanceSummary } from '@/app/actions/finance'
import {
  compareWithPreviousMonth,
  getBillsDueSoon,
  todayInBrazil,
  type BillLike,
  type CashFlowLike,
} from '@/lib/finance-insights'
import { formatBRL, formatDateTime, formatMonthYear, formatPercent, plural } from '@/lib/format'

const sum = (bills: BillLike[]) => bills.reduce((total, bill) => total + Number(bill.amount || 0), 0)

interface BillAlertsProps {
  bills: BillLike[]
  /** Leva a lista ao mês atual, que é onde as contas do alerta aparecem. */
  onNavigate?: () => void
}

export function BillAlerts({ bills, onNavigate }: BillAlertsProps) {
  const { overdue, dueSoon } = getBillsDueSoon(bills, todayInBrazil())
  if (overdue.length === 0 && dueSoon.length === 0) return null

  return (
    <a
      href="#contas"
      onClick={onNavigate}
      className="flex min-h-11 items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-400" aria-hidden="true" />
      <span className="min-w-0 flex-1 space-y-1 text-sm text-amber-100">
        {overdue.length > 0 && (
          <span className="block">
            <strong>{plural(overdue.length, 'conta atrasada', 'contas atrasadas')}</strong>: {formatBRL(sum(overdue))}
          </span>
        )}
        {dueSoon.length > 0 && (
          <span className="block">
            <strong>{plural(dueSoon.length, 'conta vence', 'contas vencem')} em até 3 dias</strong>:{' '}
            {formatBRL(sum(dueSoon))}
          </span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-amber-300" aria-hidden="true" />
    </a>
  )
}

function formatForeign(currency: string, value: number) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value)
  } catch {
    // O código vem do banco e pode não ser um ISO válido, o que faria o Intl lançar erro.
    return `${currency} ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}

export function OpenFinanceOverview({ summary }: { summary: OpenFinanceSummary }) {
  if (!summary.hasAccounts) {
    return (
      <section className="space-y-1 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-center">
        <Building2 className="mx-auto size-5 text-emerald-400" aria-hidden="true" />
        <p className="text-sm text-slate-300">Conecte um banco para ver seus saldos e gastos aqui.</p>
        <Link
          href="/open-finance"
          className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-emerald-400"
        >
          Conectar banco
        </Link>
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4">
      <div>
        <p className="text-xs font-semibold text-slate-400">Saldo nas contas</p>
        <p className="mt-1 text-2xl font-bold text-white">{formatBRL(summary.balance)}</p>
        {summary.foreignBalances.map((item) => (
          <p key={item.currency} className="text-sm font-medium text-slate-200">
            {formatForeign(item.currency, item.total)}
          </p>
        ))}
        <p className="mt-1 text-xs text-slate-400">
          {summary.lastSyncedAt
            ? `Dados do banco de ${formatDateTime(summary.lastSyncedAt)}`
            : 'Data da última atualização do banco indisponível'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-400">Entradas no mês</p>
          <p className="font-semibold text-emerald-400">{formatBRL(summary.income)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Saídas no mês</p>
          <p className="font-semibold text-rose-400">{formatBRL(summary.expense)}</p>
        </div>
      </div>

      {summary.topCategories.length > 0 && (
        <ul className="space-y-1.5 border-t border-emerald-500/10 pt-3">
          {summary.topCategories.map((item) => (
            <li key={item.category} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-300">{item.category}</span>
              <span className="shrink-0 text-slate-400">{formatBRL(item.total)}</span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/extrato"
        className="flex min-h-11 items-center justify-center text-sm font-semibold text-emerald-400"
      >
        Ver extrato completo
      </Link>
    </section>
  )
}

function changeText(current: number, previous: number) {
  const change = ((current - previous) / previous) * 100
  const size = formatPercent(Math.abs(change), { digits: 0 })
  if (size === formatPercent(0, { digits: 0 })) return null
  return `${size} ${change > 0 ? 'a mais' : 'a menos'}`
}

interface FootnoteInput {
  isOpenFinance: boolean
  history: CashFlowLike[] | null
  openFinance: OpenFinanceSummary | null
  month: number
  year: number
  isCurrentMonth: boolean
}

/**
 * No Open Finance o mês corrente só é comparado com o mesmo trecho do mês anterior; sem esse dado,
 * o texto não afirma nada. No modo manual a comparação é de totais previstos, e o texto diz isso.
 */
export function monthComparisonFootnote({
  isOpenFinance,
  history,
  openFinance,
  month,
  year,
  isCurrentMonth,
}: FootnoteInput): string | undefined {
  if (isOpenFinance) {
    if (!openFinance?.hasAccounts) return undefined

    const { comparison } = openFinance
    if (comparison) {
      const base = `Até o dia ${comparison.day}: ${formatBRL(comparison.currentToDay)} em gastos neste mês`
      if (comparison.previousToDay <= 0) return base
      const change = changeText(comparison.currentToDay, comparison.previousToDay)
      const previous = formatBRL(comparison.previousToDay)
      return change
        ? `${base}, ${change} que no mesmo período do mês anterior (${previous})`
        : `${base}, igual ao mesmo período do mês anterior (${previous})`
    }

    const period = isCurrentMonth ? 'neste mês' : `em ${formatMonthYear(year, month)}`
    return `${formatBRL(openFinance.expense)} em gastos ${period}`
  }

  if (!history) return undefined
  const { current, previous, changePercent } = compareWithPreviousMonth(history, month, year)
  if (changePercent === null) return undefined

  const previousLabel = formatMonthYear(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)
  const change = changeText(current, previous)
  return change
    ? `${change} em contas previstas que em ${previousLabel} (${formatBRL(previous)})`
    : `Mesmo total em contas previstas que em ${previousLabel} (${formatBRL(previous)})`
}
