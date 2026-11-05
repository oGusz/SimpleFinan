'use client'

import { CalendarClock, Coins } from 'lucide-react'
import type { Asset } from '@/context/PortfolioContext'
import { addDays, isSettledBill, todayInBrazil } from '@/lib/finance-insights'
import { formatBRL, formatDate, plural } from '@/lib/format'

export interface TimelineBill {
  id: string
  title?: string
  amount: number
  due_date: string
  status: string
  category?: string
}

interface PortfolioTimelineProps {
  bills: TimelineBill[]
  /** Sem ativos na carteira o cartão de proventos não aparece. */
  assets?: Asset[]
}

const WINDOW_DAYS = 30

function DividendsCard({ assets }: { assets: Asset[] }) {
  const withData = assets.filter(
    (asset) => asset.dividendStatus === 'ok' && typeof asset.lastDividend === 'number',
  )
  // lastDividend é a média mensal por cota, ou seja, a soma de 12 meses dividida por 12.
  const total = withData.reduce((sum, asset) => sum + asset.quantity * (asset.lastDividend as number) * 12, 0)
  const shortHistory = withData.filter((asset) => (asset.dividendHistoryMonths ?? 12) < 12).length
  const hasData = withData.length > 0

  return (
    <section className="flex flex-col gap-1 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Coins className="size-4 text-emerald-400" aria-hidden="true" />
        Proventos nos últimos 12 meses
      </h2>
      <p className="text-xs text-slate-400">(estimativa: quantidade atual x provento por cota)</p>

      {hasData ? (
        <>
          <p className="mt-2 text-2xl font-bold tracking-tight text-white">{formatBRL(total)}</p>
          <p className="text-xs text-slate-400">com base nos últimos 12 meses, não garante pagamentos futuros</p>
          {withData.length < assets.length && (
            <p className="text-xs text-slate-400">
              Inclui {withData.length} de {plural(assets.length, 'ativo', 'ativos')}; os demais ficaram sem dado de
              proventos.
            </p>
          )}
          {shortHistory > 0 && (
            <p className="text-xs text-slate-400">
              {plural(shortHistory, 'ativo tem', 'ativos têm')} menos de 12 meses de histórico: o valor pode estar abaixo
              de um ano completo.
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm font-medium text-slate-300">Sem dado de proventos</p>
      )}
    </section>
  )
}

export function PortfolioTimeline({ bills, assets }: PortfolioTimelineProps) {
  const today = todayInBrazil()
  const tomorrow = addDays(today, 1)
  const limit = addDays(today, WINDOW_DAYS)

  const items = bills
    .map((bill) => ({ ...bill, dueDate: bill.due_date.slice(0, 10) }))
    .filter((bill) => !isSettledBill(bill.status) && bill.dueDate >= today && bill.dueDate <= limit)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const total = items.reduce((sum, bill) => sum + Number(bill.amount || 0), 0)

  const dateLabel = (date: string) => {
    if (date === today) return 'Hoje'
    if (date === tomorrow) return 'Amanhã'
    return formatDate(date)
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <CalendarClock className="size-4 text-emerald-400" aria-hidden="true" />
            Contas nos próximos 30 dias
          </h2>
          {items.length > 0 && (
            <p className="mt-0.5 text-xs text-slate-400">
              {plural(items.length, 'conta pendente', 'contas pendentes')}, {formatBRL(total)} no total
            </p>
          )}
        </div>

        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Nenhuma conta pendente nos próximos 30 dias.</p>
        ) : (
          <ul className="divide-y divide-slate-800/80">
            {items.map((bill) => (
              <li key={bill.id} className="flex min-h-11 items-center justify-between gap-4 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{bill.title || 'Conta a pagar'}</p>
                  {bill.category && <p className="truncate text-xs text-slate-400">{bill.category}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-slate-100">{formatBRL(Number(bill.amount || 0))}</p>
                  <p className="text-xs text-slate-400">{dateLabel(bill.dueDate)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {assets && assets.length > 0 && <DividendsCard assets={assets} />}
    </div>
  )
}
