'use client'

import Link from 'next/link'
import { AlertTriangle, Building2, TrendingDown, TrendingUp } from 'lucide-react'
import {
  compareWithPreviousMonth,
  getBillsDueSoon,
  todayInBrazil,
  type BillLike,
  type CashFlowLike,
} from '@/lib/finance-insights'

const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const sum = (bills: BillLike[]) => bills.reduce((total, bill) => total + Number(bill.amount || 0), 0)

export function BillAlerts({ bills }: { bills: BillLike[] }) {
  const { overdue, dueSoon } = getBillsDueSoon(bills, todayInBrazil())
  if (overdue.length === 0 && dueSoon.length === 0) return null

  return (
    <section className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
      <div className="space-y-1 text-xs text-amber-100">
        {overdue.length > 0 && (
          <p>
            <strong>{overdue.length} {overdue.length === 1 ? 'conta atrasada' : 'contas atrasadas'}</strong>: {money(sum(overdue))}
          </p>
        )}
        {dueSoon.length > 0 && (
          <p>
            <strong>{dueSoon.length} {dueSoon.length === 1 ? 'conta vence' : 'contas vencem'} em até 3 dias</strong>: {money(sum(dueSoon))}
          </p>
        )}
      </div>
    </section>
  )
}

interface OpenFinanceSummary {
  hasAccounts: boolean
  balance: number
  income: number
  expense: number
  topCategories: { category: string; total: number; percent: number }[]
}

export function OpenFinanceOverview({ summary }: { summary: OpenFinanceSummary }) {
  if (!summary.hasAccounts) {
    return (
      <section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-center space-y-2">
        <Building2 className="mx-auto h-5 w-5 text-emerald-400" />
        <p className="text-xs text-slate-300">Conecte um banco para ver seus saldos e gastos aqui.</p>
        <Link href="/open-finance" className="block text-xs font-semibold text-emerald-400">
          Conectar banco
        </Link>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 space-y-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Saldo nas contas</p>
        <p className="mt-1 text-2xl font-bold text-white">{money(summary.balance)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-slate-400">Entradas no mês</p>
          <p className="font-semibold text-emerald-400">{money(summary.income)}</p>
        </div>
        <div>
          <p className="text-slate-400">Saídas no mês</p>
          <p className="font-semibold text-rose-400">{money(summary.expense)}</p>
        </div>
      </div>

      {summary.topCategories.length > 0 && (
        <ul className="space-y-1.5 border-t border-emerald-500/10 pt-3">
          {summary.topCategories.map((item) => (
            <li key={item.category} className="flex justify-between gap-3 text-xs">
              <span className="min-w-0 truncate text-slate-300">{item.category}</span>
              <span className="shrink-0 text-slate-400">{money(item.total)}</span>
            </li>
          ))}
        </ul>
      )}

      <Link href="/extrato" className="block text-center text-xs font-semibold text-emerald-400">
        Ver extrato completo
      </Link>
    </section>
  )
}

interface MonthlySummaryProps {
  history: CashFlowLike[]
  month: number
  year: number
}

export function MonthlySummaryCard({ history, month, year }: MonthlySummaryProps) {
  const { current, previous, changePercent } = compareWithPreviousMonth(history, month, year)
  if (current === 0 && previous === 0) return null

  const spentMore = (changePercent ?? 0) > 0
  const Icon = spentMore ? TrendingUp : TrendingDown

  return (
    <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Resumo do mês</p>
      <p className="mt-1 text-lg font-bold text-white">{money(current)}</p>
      {changePercent === null ? (
        <p className="text-[11px] text-slate-500">em contas neste mês</p>
      ) : (
        <p className={`flex items-center gap-1 text-[11px] ${spentMore ? 'text-rose-400' : 'text-emerald-400'}`}>
          <Icon className="h-3 w-3" />
          {Math.abs(changePercent).toFixed(0)}% {spentMore ? 'a mais' : 'a menos'} que no mês anterior ({money(previous)})
        </p>
      )}
    </section>
  )
}
