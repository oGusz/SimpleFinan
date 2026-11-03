'use client'

import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'
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
