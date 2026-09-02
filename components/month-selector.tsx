'use client'

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

interface MonthSelectorProps {
  currentDate: Date
  onChangeDate: (newDate: Date) => void
}

export function MonthSelector({ currentDate, onChangeDate }: MonthSelectorProps) {
  const handlePreviousMonth = () => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    onChangeDate(newDate)
  }

  const handleNextMonth = () => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    onChangeDate(newDate)
  }

  const handleCurrentMonth = () => {
    onChangeDate(new Date())
  }

  // Formatação em Português (Ex: "Janeiro 2026")
  const monthName = currentDate.toLocaleDateString('pt-BR', { month: 'long' })
  const year = currentDate.getFullYear()
  const formattedDate = `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`

  const isCurrentMonth =
    new Date().getMonth() === currentDate.getMonth() &&
    new Date().getFullYear() === currentDate.getFullYear()

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-1.5 backdrop-blur-sm">
      <button
        type="button"
        onClick={handlePreviousMonth}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-100 transition-all cursor-pointer active:scale-95"
        title="Mês anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2 px-2 text-xs font-medium text-slate-200">
        <Calendar className="h-3.5 w-3.5 text-emerald-400" />
        <span className="min-w-[120px] text-center capitalize">{formattedDate}</span>
      </div>

      <button
        type="button"
        onClick={handleNextMonth}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-100 transition-all cursor-pointer active:scale-95"
        title="Próximo mês"
      >
        <ChevronRight className="h-4 w-4" />
      </button>

      {!isCurrentMonth && (
        <button
          type="button"
          onClick={handleCurrentMonth}
          className="ml-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-all cursor-pointer"
        >
          Hoje
        </button>
      )}
    </div>
  )
}