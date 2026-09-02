'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface MonthPickerProps {
  currentDate: Date
  onChange: (newDate: Date) => void
}

export function MonthPicker({ currentDate, onChange }: MonthPickerProps) {
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ]

  const handlePrev = () => {
    const prev = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
    onChange(prev)
  }

  const handleNext = () => {
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
    onChange(next)
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/50 p-1">
      <button
        type="button"
        onClick={handlePrev}
        className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[120px] text-center font-mono text-xs font-medium uppercase tracking-wider text-slate-200">
        {months[currentDate.getMonth()]} {currentDate.getFullYear()}
      </span>
      <button
        type="button"
        onClick={handleNext}
        className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}