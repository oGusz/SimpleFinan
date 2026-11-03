'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Crown, Receipt } from 'lucide-react'

import { getTransactions } from '@/app/actions/pluggy'
import { MonthSelector } from '@/components/month-selector'
import { SkeletonCards } from '@/components/page-skeleton'
import { useAppMode } from '@/context/AppModeContext'
import { summarizeTransactions } from '@/lib/finance-insights'

const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const formatDay = (date: string) => {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

export default function ExtratoPage() {
  const { isPremium, loading: planLoading } = useAppMode()
  const [currentDate, setCurrentDate] = useState(new Date())
  const month = currentDate.getMonth() + 1
  const year = currentDate.getFullYear()

  const { data: transactions, isLoading } = useSWR(
    isPremium ? ['transactions', year, month] : null,
    () => getTransactions(month, year),
    { keepPreviousData: true },
  )

  const summary = useMemo(() => summarizeTransactions(transactions ?? []), [transactions])

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28 select-none">
      <header className="flex items-center justify-between">
        <Link
          href="/open-finance"
          aria-label="Voltar"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-300 active:scale-90 transition-all"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-bold text-white tracking-tight">Extrato e gastos</h1>
        <div className="w-10" />
      </header>

      {planLoading ? (
        <SkeletonCards />
      ) : !isPremium ? (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-6 text-center space-y-3">
          <Crown className="mx-auto h-6 w-6 text-emerald-400" />
          <h2 className="text-sm font-bold text-white">Veja para onde vai seu dinheiro</h2>
          <p className="text-xs text-slate-400">
            No Premium, o extrato dos seus bancos chega sozinho e os gastos já vêm separados por categoria.
          </p>
          <Link
            href="/planos"
            className="flex h-11 items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white"
          >
            Ver planos
          </Link>
        </section>
      ) : (
        <>
          <div className="flex items-center justify-center rounded-2xl bg-slate-900/60 p-1 border border-slate-800/80">
            <MonthSelector currentDate={currentDate} onChangeDate={setCurrentDate} />
          </div>

          {isLoading && !transactions ? (
            <SkeletonCards />
          ) : !transactions?.length ? (
            <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 text-center space-y-3">
              <Receipt className="mx-auto h-6 w-6 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-200">Nenhuma transação neste mês</h2>
              <p className="text-xs text-slate-500">
                Conecte um banco ou sincronize de novo. Importamos os últimos 90 dias.
              </p>
              <Link href="/open-finance" className="block text-xs font-semibold text-emerald-400">
                Ir para Open Finance
              </Link>
            </section>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
                  <p className="flex items-center gap-1 text-[11px] text-slate-400">
                    <ArrowDownLeft className="h-3 w-3 text-emerald-400" /> Entradas
                  </p>
                  <p className="mt-1 text-sm font-bold text-emerald-400">{money(summary.income)}</p>
                </div>
                <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
                  <p className="flex items-center gap-1 text-[11px] text-slate-400">
                    <ArrowUpRight className="h-3 w-3 text-rose-400" /> Saídas
                  </p>
                  <p className="mt-1 text-sm font-bold text-rose-400">{money(summary.expense)}</p>
                </div>
              </section>

              {summary.byCategory.length > 0 && (
                <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 space-y-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Gastos por categoria</h2>
                  {summary.byCategory.map((item) => (
                    <div key={item.category} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-200">{item.category}</span>
                        <span className="text-slate-400">{money(item.total)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${item.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </section>
              )}

              <section className="rounded-2xl border border-slate-800/80 bg-slate-900/40 divide-y divide-slate-800/60">
                {transactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-200">{transaction.description}</p>
                      <p className="text-[11px] text-slate-500">
                        {formatDay(transaction.date)} · {transaction.category}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold ${transaction.type === 'CREDIT' ? 'text-emerald-400' : 'text-slate-200'}`}>
                      {transaction.type === 'CREDIT' ? '+' : '-'} {money(Math.abs(Number(transaction.amount)))}
                    </span>
                  </div>
                ))}
              </section>
            </>
          )}
        </>
      )}
    </main>
  )
}
