'use client'

import { useState } from 'react'
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Coins,
  Receipt,
  Clock,
  Sparkles,
} from 'lucide-react'

export interface DividendEvent {
  id: string
  ticker: string
  type: 'DIVIDEND'
  title: string
  amount: number
  ratePerShare: number
  sharesCount: number
  dataCom: string
  paymentDate: string
  status: 'DECLARED' | 'PAID'
}

export interface BillEvent {
  id: string
  title: string
  type: 'BILL'
  amount: number
  dueDate: string
  category?: string
  status: 'PENDING' | 'PAID'
}

type TimelineItem =
  | (DividendEvent & { itemType: 'DIVIDEND'; date: string })
  | (BillEvent & { itemType: 'BILL'; date: string })

interface PortfolioTimelineProps {
  dividends?: DividendEvent[]
  bills?: BillEvent[]
}

export function PortfolioTimeline({ dividends = [], bills = [] }: PortfolioTimelineProps) {
  const [filter, setFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL')

  const totalDividendsMonth = dividends.reduce((acc, curr) => acc + curr.amount, 0)
  const declaredRecentCount = dividends.filter((d) => d.status === 'DECLARED').length

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // AJUSTADO: Janela de tempo expandida para 30 dias
  const in30Days = new Date(today)
  in30Days.setDate(today.getDate() + 30)

  const timelineItems: TimelineItem[] = [
    ...dividends.map((d) => ({ ...d, itemType: 'DIVIDEND' as const, date: d.paymentDate })),
    ...bills.map((b) => ({ ...b, itemType: 'BILL' as const, date: b.dueDate })),
  ]
    .filter((item) => {
      if (!item.date) return false
      const itemDate = new Date(item.date + 'T00:00:00')
      return itemDate >= today && itemDate <= in30Days
    })
    .filter((item) => {
      if (filter === 'INCOME') return item.itemType === 'DIVIDEND'
      if (filter === 'EXPENSE') return item.itemType === 'BILL'
      return true
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    const diffTime = d.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Hoje'
    if (diffDays === 1) return 'Amanhã'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-950 p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                <Coins className="h-4 w-4" /> Projeção de Renda Passiva
              </span>
              <p className="text-2xl font-bold tracking-tight text-white">
                {totalDividendsMonth.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Total acumulado de proventos declarados/previstos para este mês.
          </p>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                <Sparkles className="h-4 w-4" /> Anúncios Recentes
              </span>
              <p className="text-2xl font-bold tracking-tight text-white">
                {declaredRecentCount} {declaredRecentCount === 1 ? 'Anúncio' : 'Anúncios'}
              </p>
            </div>
            <div className="rounded-lg bg-indigo-500/10 p-2.5 text-indigo-400 border border-indigo-500/20">
              <Calendar className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Ativos da sua carteira que anunciaram rendimentos recentemente.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-400" />
              Linha do Tempo (Próximos 30 dias)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Acompanhamento de proventos a receber e contas a pagar.
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filter === 'ALL'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilter('INCOME')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filter === 'INCOME'
                  ? 'bg-emerald-500/20 text-emerald-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Entradas
            </button>
            <button
              onClick={() => setFilter('EXPENSE')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                filter === 'EXPENSE'
                  ? 'bg-rose-500/20 text-rose-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Saídas
            </button>
          </div>
        </div>

        {timelineItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Nenhum provento a receber ou conta com vencimento nos próximos 30 dias.
          </div>
        ) : (
          <div className="relative space-y-3 before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-800">
            {timelineItems.map((item) => {
              const isIncome = item.itemType === 'DIVIDEND'

              return (
                <div
                  key={`${item.itemType}-${item.id}`}
                  className="relative flex items-center justify-between gap-4 pl-8 py-2 rounded-lg hover:bg-slate-800/30 transition-colors"
                >
                  <div
                    className={`absolute left-1.5 flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
                      isIncome
                        ? 'border-emerald-500 bg-emerald-950 text-emerald-400'
                        : 'border-rose-500 bg-rose-950 text-rose-400'
                    }`}
                  >
                    {isIncome ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white truncate">
                        {isIncome ? item.ticker : item.title}
                      </span>
                      {isIncome ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                          Data Com: {new Date(item.dataCom + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                          <Receipt className="h-3 w-3" /> Conta
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {isIncome
                        ? `Provento declarado (${item.sharesCount} cotas × R$ ${item.ratePerShare.toFixed(2)})`
                        : item.category || 'Despesa do mês'}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-xs font-bold ${
                        isIncome ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isIncome ? '+' : '-'}
                      {item.amount.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </p>
                    <span className="text-[10px] font-medium text-slate-400">
                      {formatDateLabel(item.date)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}