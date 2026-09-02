'use client'

import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

export interface Investment {
  id: string
  ticker: string
  name: string
  type: string
  value: number
  price: number
  quantity: number
  updated_at: string
}

export interface AllocationItem {
  id: string
  label: string
  value: number
  percentage: number
  changePct: number
}

interface PortfolioOverviewProps {
  investments?: Investment[]
  totalInvested?: number
  yieldPct?: number
  yieldSeries?: number[]
  currentMonthName?: string
  allocations?: AllocationItem[]
}

const chartColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

function compactCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)
}

function YieldSparkline({ data }: { data: number[] }) {
  const width = 260
  const height = 56
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const span = max - min || 1

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width
      const y = height - ((value - min) / span) * (height - 6) - 3
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-14 w-full"
      role="img"
      aria-label={`Evolução da rentabilidade nos últimos ${data.length} meses`}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function PortfolioOverview({
  investments = [],
  totalInvested: initialTotal,
  yieldPct = 0,
  yieldSeries = [0, 0, 0, 0, 0],
  currentMonthName = 'Atual',
  allocations: initialAllocations = [],
}: PortfolioOverviewProps) {
  // Calcula o total dinâmico baseado nos ativos manuais
  const calculatedTotal = investments.reduce((acc, inv) => acc + inv.value, 0)
  const totalInvested = investments.length > 0 ? calculatedTotal : (initialTotal ?? 0)

  // Mapeia usando os novos campos: id, ticker e name
  const allocations: AllocationItem[] =
    investments.length > 0
      ? investments.map((inv) => {
          const pct = totalInvested > 0 ? (inv.value / totalInvested) * 100 : 0
          return {
            id: inv.id,
            label: inv.ticker ? `${inv.ticker} - ${inv.name}` : inv.name,
            value: inv.value,
            percentage: Number(pct.toFixed(1)),
            changePct: 0,
          }
        })
      : initialAllocations

  return (
    <section
      aria-label="Carteira de investimentos"
      className="flex flex-col gap-8 rounded-lg border border-border bg-card px-6 py-5"
    >
      <header className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium tracking-tight text-foreground">
          Carteira
        </h2>
        <p className="tnum font-mono text-xs text-muted-foreground">
          {compactCurrency(totalInvested)}
        </p>
      </header>

      <div className="flex flex-col gap-5">
        <div
          className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-secondary"
          aria-hidden="true"
        >
          {allocations.map((item, index) => (
            <span
              key={item.id}
              style={{
                width: `${item.percentage}%`,
                backgroundColor: chartColors[index % chartColors.length],
              }}
            />
          ))}
        </div>

        <ul className="flex flex-col gap-4">
          {allocations.length === 0 ? (
            <li className="text-xs text-muted-foreground italic">
              Nenhum ativo cadastrado.
            </li>
          ) : (
            allocations.map((item, index) => {
              const positive = item.changePct >= 0
              return (
                <li key={item.id} className="flex items-center gap-3">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: chartColors[index % chartColors.length],
                    }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {item.label}
                  </span>
                  <span className="tnum hidden font-mono text-xs text-muted-foreground sm:inline">
                    {compactCurrency(item.value)}
                  </span>
                  <span className="tnum w-11 text-right font-mono text-sm text-foreground">
                    {item.percentage}%
                  </span>
                  <span
                    className={`tnum inline-flex w-16 shrink-0 items-center justify-end gap-0.5 font-mono text-xs ${
                      positive
                        ? 'text-[color:var(--success,theme(colors.emerald.400))]'
                        : 'text-destructive'
                    }`}
                  >
                    {positive ? (
                      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                    )}
                    {positive ? '+' : ''}
                    {item.changePct.toFixed(1)}%
                  </span>
                </li>
              )
            })
          )}
        </ul>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Rentabilidade total
          </span>
          <span className="tnum font-mono text-xl font-medium tracking-tight text-[color:var(--success,theme(colors.emerald.400))]">
            {yieldPct >= 0 ? '+' : ''}
            {yieldPct.toFixed(1)}%
          </span>
        </div>
        <YieldSparkline data={yieldSeries} />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Histórico</span>
          <span>{currentMonthName}</span>
        </div>
      </div>
    </section>
  )
}