'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonthYear } from '@/lib/format'

interface MonthSelectorProps {
  currentDate: Date
  onChangeDate: (newDate: Date) => void
  /** Último mês que se pode ver: o avanço para quando chega nele. */
  maxDate?: Date
}

const ARROW_CLASS =
  'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent'

const monthIndex = (date: Date) => date.getFullYear() * 12 + date.getMonth()

export function MonthSelector({ currentDate, onChangeDate, maxDate }: MonthSelectorProps) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const label = formatMonthYear(year, month + 1)
  const isCurrentMonth = monthIndex(new Date()) === monthIndex(currentDate)
  const canAdvance = !maxDate || monthIndex(currentDate) < monthIndex(maxDate)

  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onChangeDate(new Date(year, month - 1, 1))}
        aria-label="Mês anterior"
        className={ARROW_CLASS}
      >
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>

      <span aria-live="polite" className="min-w-36 text-center text-sm font-medium text-slate-200">
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </span>

      <button
        type="button"
        onClick={() => onChangeDate(new Date(year, month + 1, 1))}
        disabled={!canAdvance}
        aria-label="Próximo mês"
        className={ARROW_CLASS}
      >
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>

      {!isCurrentMonth && (
        <button
          type="button"
          onClick={() => onChangeDate(new Date())}
          className="h-11 cursor-pointer rounded-lg px-3 text-sm font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/10"
        >
          Mês atual
        </button>
      )}
    </div>
  )
}
