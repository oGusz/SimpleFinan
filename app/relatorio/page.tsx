'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight, Crown } from 'lucide-react'

import { BackButton } from '@/components/back-button'
import { InvestmentDisclaimer } from '@/components/investment-disclaimer'
import { buttonVariants } from '@/components/ui/button'
import { useAppMode } from '@/context/AppModeContext'
import { todayInBrazil } from '@/lib/finance-insights'
import { formatBRL, formatDate, formatMonthYear, formatPercent } from '@/lib/format'
import type { MonthlyReport } from '@/lib/report'

const MONTHS_BACK = 12

type ReportResponse = { premium: false } | { premium: true; report: MonthlyReport }

const fetchReport = async ([, month, source]: [string, string, string]): Promise<ReportResponse> => {
  const response = await fetch(`/api/report?month=${month}&source=${source}`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

function shiftMonth(month: string, delta: number) {
  const [year, index] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, index - 1 + delta, 1))
  return date.toISOString().slice(0, 7)
}

const signed = (value: number | null | undefined) => (value === null || value === undefined ? '—' : formatPercent(value, { signed: true }))

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {children}
    </section>
  )
}

function Bar({ pct, className = 'bg-emerald-500' }: { pct: number; className?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  )
}

export default function RelatorioPage() {
  const { mode, loading: modeLoading } = useAppMode()
  const current = useMemo(() => todayInBrazil().slice(0, 7), [])
  const oldest = shiftMonth(current, -MONTHS_BACK)
  const [month, setMonth] = useState(() => shiftMonth(current, -1))

  // O e-mail mensal aponta para ?mes=AAAA-MM.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('mes')
    if (requested && /^\d{4}-\d{2}$/.test(requested) && requested >= oldest && requested <= current) setMonth(requested)
  }, [current, oldest])

  const { data, error, isLoading, mutate } = useSWR(modeLoading ? null : ['report', month, mode], fetchReport, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  const [year, index] = month.split('-').map(Number)
  const rawLabel = formatMonthYear(year, index)
  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)
  const report = data?.premium ? data.report : null
  const maxCategory = Math.max(...(report?.bills.byCategory.map((item) => item.total) ?? [0]), 0)

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex items-start gap-2">
        <BackButton fallbackHref="/" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400">Seu mês em um só lugar</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Relatório mensal</h1>
        </div>
      </header>

      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-0.5">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={month <= oldest}
          aria-label="Mês anterior"
          className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-40"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold text-white" aria-live="polite">
          {label}
          {report && !report.closed && <span className="ml-1 text-xs font-normal text-slate-400">(em andamento)</span>}
        </p>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={month >= current}
          aria-label="Próximo mês"
          className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 disabled:opacity-40"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <p className="text-sm text-amber-200">Não foi possível montar o relatório.</p>
          <button type="button" onClick={() => mutate()} className="min-h-11 cursor-pointer text-sm font-semibold text-amber-100 underline underline-offset-2">
            Tentar de novo
          </button>
        </div>
      ) : !data || (isLoading && !report) ? (
        <div aria-busy="true" className="space-y-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-32 animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60" />
          ))}
        </div>
      ) : !data.premium ? (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
          <div className="flex items-center gap-2">
            <Crown className="size-5 text-emerald-300" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Relatório mensal no Premium</h2>
          </div>
          <p className="mt-1 text-sm text-slate-300">
            Contas por categoria, quanto sua carteira rendeu de verdade contra CDI e Ibovespa, proventos recebidos e o
            andamento das metas, mês a mês.
          </p>
          <Link href="/planos" className={buttonVariants({ className: 'mt-3 w-full' })}>
            Conhecer o Premium
          </Link>
        </section>
      ) : report ? (
        <div className={isLoading ? 'space-y-4 opacity-60 transition-opacity' : 'space-y-4'} aria-busy={isLoading}>
          <Card title="Contas">
            {report.bills.count === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma conta neste mês.</p>
            ) : (
              <>
                <dl className="grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-xs text-slate-400">Total</dt>
                    <dd className="font-bold tabular-nums text-white">{formatBRL(report.bills.total)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Pagas</dt>
                    <dd className="font-bold tabular-nums text-emerald-300">{formatBRL(report.bills.paid)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Em aberto</dt>
                    <dd className="font-bold tabular-nums text-amber-300">{formatBRL(report.bills.pending)}</dd>
                  </div>
                </dl>
                <ul className="space-y-2">
                  {report.bills.byCategory.map((item) => (
                    <li key={item.category} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-300">{item.category}</span>
                        <span className="tabular-nums text-slate-200">{formatBRL(item.total)}</span>
                      </div>
                      <Bar pct={maxCategory > 0 ? (item.total / maxCategory) * 100 : 0} className="bg-sky-500/80" />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title="Carteira">
            {report.portfolio ? (
              <>
                <p className="text-sm text-slate-300">
                  De {formatBRL(report.portfolio.startValue)} para{' '}
                  <strong className="text-white">{formatBRL(report.portfolio.endValue)}</strong>, entre{' '}
                  {formatDate(report.portfolio.startDay)} e {formatDate(report.portfolio.endDay)}.
                </p>
                <dl className="grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-xs text-slate-400">Sua carteira</dt>
                    <dd className="font-bold tabular-nums text-white">{signed(report.portfolio.returnPct)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">CDI</dt>
                    <dd className="font-bold tabular-nums text-white">{signed(report.portfolio.cdiPct)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Ibovespa</dt>
                    <dd className="font-bold tabular-nums text-white">{signed(report.portfolio.ibovPct)}</dd>
                  </div>
                </dl>
                <p className="text-xs text-slate-400">Rentabilidade sem contar aportes e vendas, e sem proventos. O valor inclui o que você aportou.</p>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                Ainda não há histórico suficiente da carteira neste mês. O SimpleFinan registra sua carteira a cada pregão.
              </p>
            )}
          </Card>

          <Card title="Proventos">
            {report.dividends.items.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum provento com data ex neste mês.</p>
            ) : (
              <>
                <p className="text-lg font-bold tabular-nums text-emerald-300">{formatBRL(report.dividends.total)}</p>
                <ul className="divide-y divide-slate-800">
                  {report.dividends.items.map((item) => (
                    <li key={item.ticker} className="flex justify-between py-1.5 text-sm">
                      <span className="text-slate-300">{item.ticker}</span>
                      <span className="tabular-nums text-slate-200">{formatBRL(item.amount)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-400">
                  Pela data ex; o dinheiro pode cair no mês seguinte.
                  {report.dividends.estimated && ' Sem histórico da carteira, usamos a quantidade de cotas de hoje.'}
                </p>
              </>
            )}
          </Card>

          <Card title="Metas">
            {report.goals.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma meta cadastrada.</p>
            ) : (
              <ul className="space-y-3">
                {report.goals.map((goal) => (
                  <li key={goal.title} className="space-y-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate text-slate-300">{goal.title}</span>
                      <span className="shrink-0 tabular-nums text-slate-200">{formatPercent(goal.pct, { digits: 0 })}</span>
                    </div>
                    <Bar pct={goal.pct} />
                    <p className="text-xs text-slate-400">
                      {formatBRL(goal.current)} de {formatBRL(goal.target)} hoje
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <InvestmentDisclaimer />
        </div>
      ) : null}
    </main>
  )
}
