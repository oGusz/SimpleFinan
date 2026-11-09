'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { Crown } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { useAppMode } from '@/context/AppModeContext'
import { formatDate, formatPercent, plural } from '@/lib/format'
import { MIN_HISTORY_DAYS, type HistoryResponse } from '@/lib/history'

const SERIES = [
  { key: 'points', label: 'Sua carteira', color: '#10b981' },
  { key: 'cdi', label: 'CDI', color: '#22d3ee' },
  { key: 'ibov', label: 'Ibovespa', color: '#60a5fa' },
] as const

const fetchHistory = async ([, source]: [string, string]): Promise<HistoryResponse> => {
  const response = await fetch(`/api/portfolio-history?source=${source}`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

const signed = (value: number | undefined) => (value === undefined ? '—' : formatPercent(value, { signed: true }))

function Chart({ data }: { data: HistoryResponse }) {
  const lines = SERIES.map((series) => ({ ...series, values: data[series.key] ?? [] })).filter((line) => line.values.length > 1)
  const all = lines.flatMap((line) => line.values.map((point) => point.pct))
  const min = Math.min(0, ...all)
  const max = Math.max(0, ...all)
  const span = max - min || 1
  const width = 300
  const height = 120
  const count = data.points.length
  const x = (index: number) => (count > 1 ? (index / (count - 1)) * width : 0)
  const y = (pct: number) => height - ((pct - min) / span) * height

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full overflow-visible" role="img" aria-label="Evolução da carteira, do CDI e do Ibovespa">
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="#334155" strokeDasharray="3 3" />
      {lines.map((line) => {
        const byDay = new Map(line.values.map((point) => [point.day, point.pct]))
        const path = data.points
          .map((point, index) => (byDay.has(point.day) ? `${x(index)},${y(byDay.get(point.day) as number)}` : null))
          .filter(Boolean)
          .join(' ')
        return <polyline key={line.key} points={path} fill="none" stroke={line.color} strokeWidth={line.key === 'points' ? 2.5 : 1.5} />
      })}
    </svg>
  )
}

export function RealHistoryCard() {
  const { mode, loading: modeLoading } = useAppMode()
  const { data, error } = useSWR(modeLoading ? null : ['portfolio-history', mode], fetchHistory, { revalidateOnFocus: false })

  // Sem a migração aplicada ou com erro, a tela segue com a simulação abaixo.
  if (error || !data || data.status === 'unavailable') return null

  const shell = (children: React.ReactNode) => (
    <section aria-labelledby="historico-real-titulo" className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
      <div>
        <h2 id="historico-real-titulo" className="text-sm font-semibold text-white">Rentabilidade real</h2>
        <p className="text-xs text-slate-400">
          {data.since ? `Desde ${formatDate(data.since, { withYear: true })}, com as compras e vendas que você fez` : 'Com as compras e vendas que você fizer'}
        </p>
      </div>
      {children}
    </section>
  )

  if (data.days === 0) {
    return shell(
      <p className="text-sm text-slate-300">
        A partir do próximo pregão, o SimpleFinan registra sua carteira todos os dias para comparar com o CDI e o Ibovespa.
      </p>,
    )
  }

  if (!data.premium) {
    return shell(
      <div className="space-y-3">
        <p className="text-sm text-slate-300">
          Você já tem {plural(data.days, 'pregão registrado', 'pregões registrados')}. Veja quanto sua carteira rendeu de verdade,
          descontando seus aportes, contra o CDI e o Ibovespa.
        </p>
        <Link href="/planos" className={buttonVariants({ className: 'w-full' })}>
          <Crown className="size-4" aria-hidden="true" />
          Ver no Premium
        </Link>
      </div>,
    )
  }

  if (data.days < MIN_HISTORY_DAYS || data.points.length < MIN_HISTORY_DAYS) {
    return shell(
      <p className="text-sm text-slate-300">
        {plural(data.days, 'pregão registrado', 'pregões registrados')} até agora. A comparação aparece a partir de {MIN_HISTORY_DAYS} pregões.
      </p>,
    )
  }

  const last = (key: (typeof SERIES)[number]['key']) => data[key]?.at(-1)
  const lastDay = data.points.at(-1)?.day

  return shell(
    <>
      <dl className="grid grid-cols-3 gap-2">
        {SERIES.map((series) => {
          const point = last(series.key)
          return (
            <div key={series.key}>
              <dt className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="size-2 rounded-full" style={{ backgroundColor: series.color }} aria-hidden="true" />
                {series.label}
              </dt>
              <dd className="text-base font-bold tabular-nums text-white">{signed(point?.pct)}</dd>
              {point && point.day !== lastDay && <dd className="text-xs text-slate-400">até {formatDate(point.day)}</dd>}
            </div>
          )
        })}
      </dl>
      <Chart data={data} />
      <p className="text-xs text-slate-400">
        Retorno de cada dia sobre as posições do dia anterior, então aportes e vendas não contam como ganho ou perda. Sem
        proventos. Último pregão: {formatDate(lastDay, { withYear: true })}.
      </p>
    </>,
  )
}
