'use client'

import { calculateMagicNumber } from '@/utils/magicNumber'
import { Sparkles, CheckCircle2 } from 'lucide-react'

interface Props {
  ticker: string
  price: number
  quantity: number
  lastDividend?: number
}

export function MagicNumberCard({ ticker, price, quantity, lastDividend = 0.10 }: Props) {
  const result = calculateMagicNumber(price, lastDividend, quantity)

  if (!result) return null

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-all hover:border-slate-700">
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-semibold text-slate-200">
            Magic Number • {ticker}
          </span>
        </div>
        {result.isGoalReached && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" /> Bola de neve ativa!
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-slate-400 text-[11px]">Meta de Cotas</p>
          <p className="text-base font-bold text-slate-100">
            {result.magicNumber} <span className="text-xs font-normal text-slate-500">cotas</span>
          </p>
        </div>

        <div>
          <p className="text-slate-400 text-[11px]">Faltam</p>
          <p className="text-base font-bold text-amber-400">
            {result.isGoalReached ? '0' : result.remainingShares}{' '}
            <span className="text-xs font-normal text-slate-500">cotas</span>
          </p>
        </div>
      </div>

      {/* Barra de Progresso */}
      <div className="mt-3 space-y-1">
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>Progresso</span>
          <span>{result.progressPercent.toFixed(1)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all duration-500 ${
              result.isGoalReached ? 'bg-emerald-500' : 'bg-amber-400'
            }`}
            style={{ width: `${result.progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  )
}