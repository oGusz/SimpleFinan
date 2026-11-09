'use client'

import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { Asset } from '@/context/PortfolioContext'
import { formatBRL, formatPercent } from '@/lib/format'
import { assetReturn, portfolioReturn, totalValue } from '@/lib/portfolio-metrics'
import { isManualValueTicker } from '@/lib/tickers'

const chartColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

/** Sem custo conhecido não há retorno a mostrar: traço em cinza, sem seta e sem cor. */
function ReturnValue({ pct, className = '' }: { pct: number | null; className?: string }) {
  if (pct === null) return <span className={`text-slate-400 ${className}`}>—</span>

  const text = formatPercent(pct, { signed: true })
  const isZero = text === formatPercent(0)
  const positive = pct > 0
  const color = isZero ? 'text-slate-300' : positive ? 'text-emerald-400' : 'text-rose-400'
  const Arrow = positive ? ArrowUpRight : ArrowDownRight

  return (
    <span className={`inline-flex items-center gap-0.5 ${color} ${className}`}>
      {!isZero && <Arrow className="size-3.5" aria-hidden="true" />}
      {text}
    </span>
  )
}

export function PortfolioOverview({ assets }: { assets: Asset[] }) {
  if (assets.length === 0) return null

  const total = totalValue(assets)
  const overall = portfolioReturn(assets)

  const rows = assets
    .map((asset) => {
      const value = asset.quantity * asset.price
      return {
        id: asset.ticker,
        // Renda fixa e afins usam um código interno, que não diz nada à pessoa.
        label: isManualValueTicker(asset.ticker) ? asset.name : `${asset.ticker} - ${asset.name}`,
        value,
        share: total > 0 ? (value / total) * 100 : 0,
        returnPct: assetReturn(asset)?.pct ?? null,
      }
    })
    .sort((a, b) => b.value - a.value)

  return (
    <section
      aria-labelledby="carteira-titulo"
      className="flex flex-col gap-4 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4"
    >
      <header className="flex items-baseline justify-between gap-4">
        <h2 id="carteira-titulo" className="text-sm font-semibold text-white">
          Rentabilidade da carteira
        </h2>
        <p className="text-sm font-semibold text-slate-100">{formatBRL(total)}</p>
      </header>

      <div>
        <ReturnValue pct={overall?.pct ?? null} className="text-xl font-semibold" />
        <p className="mt-0.5 text-xs text-slate-400">desde o preço médio, sem proventos</p>
        {overall && overall.coveredAssets < overall.totalAssets && (
          <p className="text-xs text-slate-400">
            Considera {overall.coveredAssets} de {overall.totalAssets} ativos: os demais não têm preço médio informado.
          </p>
        )}
        {!overall && <p className="text-xs text-slate-400">Informe o preço médio na carteira para ver este cálculo.</p>}
      </div>

      <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
        {rows.map((row, index) => (
          <span
            key={row.id}
            style={{ width: `${row.share}%`, backgroundColor: chartColors[index % chartColors.length] }}
          />
        ))}
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <li key={row.id} className="flex items-start gap-2.5">
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full"
              style={{ backgroundColor: chartColors[index % chartColors.length] }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-slate-100">{row.label}</span>
                <span className="shrink-0 text-sm text-slate-200">{formatBRL(row.value)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-slate-400">{formatPercent(row.share)} da carteira</span>
                <ReturnValue pct={row.returnPct} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
