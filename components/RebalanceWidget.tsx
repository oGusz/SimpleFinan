'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Calculator } from 'lucide-react'
import { InvestmentDisclaimer } from '@/components/investment-disclaimer'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, fieldControlClass } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import { useToast } from '@/components/ui/toast'
import { UNAVAILABLE_ERROR, usePortfolio } from '@/context/PortfolioContext'
import { formatBRL, formatPercent, plural } from '@/lib/format'
import { parseDecimalInput } from '@/lib/parse-number'
import { isExchangeTicker, isManualValueTicker } from '@/lib/tickers'
import { cn } from '@/lib/utils'

export interface RebalanceAsset {
  ticker: string
  name: string
  quantity: number
  price: number
  category?: string
  pvp?: number
  dividendYield?: number
  /** Média mensal por cota. undefined quando não há dado. */
  lastDividend?: number
  targetPercent?: number | null
}

export interface ContributionRow {
  ticker: string
  name: string
  price: number
  quantityToBuy: number
  invested: number
  currentPercent: number
  targetPercent: number
  percentAfter: number
  /** null quando o ativo não tem dado de proventos. */
  monthlyIncome: number | null
}

export type StrategyType = 'DEFICIT' | 'YIELD' | 'PVP_DISCOUNT'

const STRATEGIES: Record<StrategyType, { name: string; description: string }> = {
  DEFICIT: {
    name: 'Mais abaixo do alvo',
    description: 'Dá mais peso aos ativos mais distantes do percentual-alvo.',
  },
  YIELD: {
    name: 'Maior provento (DY)',
    description: 'Dá mais peso aos ativos com maior soma de proventos em 12 meses sobre a cotação.',
  },
  PVP_DISCOUNT: {
    name: 'Menor P/VP',
    description: 'Dá mais peso aos ativos com menor relação entre preço e valor patrimonial.',
  },
}

const SHORTCUTS = [
  { value: 500, label: 'R$ 500' },
  { value: 1000, label: 'R$ 1 mil' },
  { value: 2000, label: 'R$ 2 mil' },
  { value: 5000, label: 'R$ 5 mil' },
]

const TARGET_SUM_TOLERANCE = 0.01

const NO_SHARES_CATEGORIES = new Set(['Renda fixa', 'Previdência'])

/** Só o que é comprado em cotas: um CDB com quantity=1 não pode virar 'compre 1 cota'. */
export function isEligibleForContribution(asset: RebalanceAsset) {
  return (
    asset.price > 0 &&
    !isManualValueTicker(asset.ticker) &&
    isExchangeTicker(asset.ticker) &&
    !NO_SHARES_CATEGORIES.has(asset.category ?? '')
  )
}

export type TargetsState =
  | { mode: 'equal-unset' }
  | { mode: 'equal-invalid'; sum: number }
  | { mode: 'custom' }

export function resolveTargets(assets: RebalanceAsset[]): TargetsState {
  const defined = assets.filter((asset) => asset.targetPercent !== null && asset.targetPercent !== undefined)
  if (defined.length === 0) return { mode: 'equal-unset' }
  const sum = defined.reduce((acc, asset) => acc + Number(asset.targetPercent), 0)
  return Math.abs(sum - 100) <= TARGET_SUM_TOLERANCE ? { mode: 'custom' } : { mode: 'equal-invalid', sum }
}

export function calculateContribution(
  assets: RebalanceAsset[],
  amount: number,
  strategy: StrategyType,
  useCustomTargets: boolean,
): ContributionRow[] {
  const portfolioTotal = assets.reduce((acc, asset) => acc + asset.quantity * asset.price, 0)
  const nextTotal = portfolioTotal + amount
  const equalTarget = 100 / (assets.length || 1)

  const scored = assets.map((asset) => {
    const currentValue = asset.quantity * asset.price
    const targetPercent = useCustomTargets ? Number(asset.targetPercent ?? 0) : equalTarget

    let score = 0
    if (strategy === 'DEFICIT') score = Math.max(0, (targetPercent / 100) * nextTotal - currentValue)
    else if (strategy === 'YIELD') score = asset.dividendYield ?? 0
    else if (asset.pvp && asset.pvp > 0) score = 1 / asset.pvp

    return { asset, currentValue, targetPercent, score }
  })

  const totalScore = scored.reduce((acc, item) => acc + item.score, 0)

  const allocated = scored.map((item) => {
    const cash = totalScore > 0 ? (item.score / totalScore) * amount : 0
    // Sem a folga, 0,1 * 3000 / 300 pode dar 0,9999... e perder uma cota inteira.
    const quantityToBuy = Math.floor(cash / item.asset.price + 1e-9)
    return { ...item, quantityToBuy, invested: quantityToBuy * item.asset.price }
  })

  const totalAfter = portfolioTotal + allocated.reduce((acc, item) => acc + item.invested, 0)

  return allocated.map((item) => ({
    ticker: item.asset.ticker,
    name: item.asset.name,
    price: item.asset.price,
    quantityToBuy: item.quantityToBuy,
    invested: item.invested,
    currentPercent: portfolioTotal > 0 ? (item.currentValue / portfolioTotal) * 100 : 0,
    targetPercent: item.targetPercent,
    percentAfter: totalAfter > 0 ? ((item.currentValue + item.invested) / totalAfter) * 100 : 0,
    monthlyIncome:
      item.asset.lastDividend && item.asset.lastDividend > 0 ? item.quantityToBuy * item.asset.lastDividend : null,
  }))
}

const displayTarget = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))

function TargetInput({ asset, onUnavailable }: { asset: RebalanceAsset; onUnavailable: () => void }) {
  const { updateTargetPercent } = usePortfolio()
  const { toast } = useToast()
  const saved = asset.targetPercent ?? null

  const [text, setText] = useState(displayTarget(saved))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(displayTarget(saved))
  }, [saved])

  const handleBlur = async () => {
    focused.current = false
    const value = text.trim() === '' ? null : parseDecimalInput(text)
    if (text.trim() !== '' && (value === null || value < 0 || value > 100)) {
      setText(displayTarget(saved))
      toast({ message: 'Informe uma meta entre 0% e 100%.', kind: 'error' })
      return
    }
    if (value === saved) return

    const result = await updateTargetPercent(asset.ticker, value)
    if (result.ok) return
    setText(displayTarget(saved))
    // É como o contexto avisa que a coluna target_percent ainda não existe no banco.
    if (result.error === UNAVAILABLE_ERROR) {
      toast({ message: 'Metas por ativo ainda indisponíveis', kind: 'info' })
      onUnavailable()
    } else {
      toast({ message: result.error ?? 'Não foi possível salvar a meta. Tente de novo.', kind: 'error' })
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={`Meta de ${asset.ticker} em porcentagem`}
        placeholder="—"
        value={text}
        onFocus={() => {
          focused.current = true
        }}
        onChange={(event) => {
          if (/^[0-9.,]*$/.test(event.target.value)) setText(event.target.value)
        }}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className={cn(fieldControlClass, 'w-20 text-right')}
      />
      <span aria-hidden="true" className="text-sm text-slate-400">
        %
      </span>
    </div>
  )
}

interface RebalanceWidgetProps {
  assets: RebalanceAsset[]
}

export function RebalanceWidget({ assets }: RebalanceWidgetProps) {
  const [amount, setAmount] = useState<number | null>(null)
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>('DEFICIT')
  const [onlyPurchases, setOnlyPurchases] = useState(false)
  const [targetsUnavailable, setTargetsUnavailable] = useState(false)

  const eligible = useMemo(() => assets.filter(isEligibleForContribution), [assets])

  // Estratégias que dependem de P/VP ou DY só aparecem quando esses dados existem de verdade.
  const availableStrategies = (Object.keys(STRATEGIES) as StrategyType[]).filter((key) => {
    if (key === 'YIELD') return eligible.some((asset) => (asset.dividendYield ?? 0) > 0)
    if (key === 'PVP_DISCOUNT') return eligible.some((asset) => (asset.pvp ?? 0) > 0)
    return true
  })
  const strategy = availableStrategies.includes(selectedStrategy) ? selectedStrategy : 'DEFICIT'

  const targets = useMemo(() => resolveTargets(eligible), [eligible])
  const useCustomTargets = targets.mode === 'custom' && !targetsUnavailable

  const rows = useMemo(
    () => (amount ? calculateContribution(eligible, amount, strategy, useCustomTargets) : []),
    [eligible, amount, strategy, useCustomTargets],
  )

  if (eligible.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <EmptyState
          icon={Calculator}
          title="Adicione investimentos para usar esta calculadora"
          description="Ela considera ações, FIIs e outros ativos negociados em cotas."
        />
      </section>
    )
  }

  const totalInvested = rows.reduce((acc, row) => acc + row.invested, 0)
  const leftover = amount ? Math.max(0, amount - totalInvested) : null
  const purchases = rows.filter((row) => row.quantityToBuy > 0)
  const withIncome = purchases.filter((row) => row.monthlyIncome !== null)
  const newIncome = withIncome.reduce((acc, row) => acc + (row.monthlyIncome ?? 0), 0)
  const visibleRows = onlyPurchases ? purchases : rows
  const targetLabel = useCustomTargets ? 'Meta' : 'Divisão igual'

  return (
    <section aria-labelledby="calculadora-aporte" className="flex w-full flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-col gap-1">
        <h2 id="calculadora-aporte" className="flex items-center gap-2 text-lg font-bold text-white">
          <Calculator className="size-5 text-emerald-400" aria-hidden="true" />
          Calculadora de aporte
        </h2>
        <p className="text-sm text-slate-400">Divide um valor em cotas inteiras, sem considerar vendas.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Field label="Quanto pretende investir?">
          {({ id, describedBy }) => (
            <MoneyInput id={id} aria-describedby={describedBy} value={amount} onValueChange={setAmount} />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-1.5 min-[360px]:grid-cols-4">
          {SHORTCUTS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={amount === value}
              onClick={() => setAmount(value)}
              className={cn(
                'h-11 cursor-pointer rounded-lg border text-xs font-semibold',
                amount === value
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div role="status" className="text-sm text-slate-300">
        {!targetsUnavailable && targets.mode === 'equal-invalid' ? (
          <p className="text-amber-300">
            Suas metas somam {formatPercent(targets.sum)}. Ajuste para 100% para usá-las; até lá, o cálculo usa divisão igual.
          </p>
        ) : useCustomTargets ? (
          <p>Usando as metas que você definiu.</p>
        ) : targetsUnavailable ? (
          <p>Divisão igual</p>
        ) : (
          <p>Divisão igual (você ainda não definiu metas)</p>
        )}
      </div>

      {!targetsUnavailable && (
        <details className="rounded-lg border border-slate-800">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-slate-200">
            Definir metas por ativo
          </summary>
          <ul className="flex flex-col divide-y divide-slate-800 px-3 pb-1">
            {eligible.map((asset) => (
              <li key={asset.ticker} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-white">{asset.ticker}</span>
                  <span className="block truncate text-xs text-slate-400">{asset.name}</span>
                </span>
                <TargetInput asset={asset} onUnavailable={() => setTargetsUnavailable(true)} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {availableStrategies.length > 1 && (
        <Field label="Critério do cálculo" hint={STRATEGIES[strategy].description}>
          {({ id, describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              value={strategy}
              onChange={(event) => setSelectedStrategy(event.target.value as StrategyType)}
              className={fieldControlClass}
            >
              {availableStrategies.map((key) => (
                <option key={key} value={key}>
                  {STRATEGIES[key].name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      {!amount ? (
        <p className="text-sm text-slate-400">Informe um valor para ver a simulação de compra.</p>
      ) : (
        <>
          {/* Sobe para duas colunas só quando cada uma comporta o valor inteiro, sem cortar dinheiro. */}
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-x-4 gap-y-3 border-y border-slate-800 py-3">
            <div>
              <dt className="text-xs text-slate-400">Total da simulação</dt>
              <dd className="text-base font-bold break-words text-emerald-400">{formatBRL(totalInvested)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Sobra</dt>
              <dd className="text-base font-bold break-words text-white">{formatBRL(leftover)}</dd>
            </div>
            <div className="col-span-full">
              <dt className="text-xs text-slate-400">Nova renda mensal estimada</dt>
              {withIncome.length > 0 ? (
                <dd>
                  <span className="text-base font-bold text-white">+{formatBRL(newIncome)}</span>
                  <span className="block text-xs text-slate-400">
                    com base nos últimos 12 meses, não garante pagamentos futuros
                    {withIncome.length < purchases.length && '. Inclui só os ativos com dado de proventos'}
                  </span>
                </dd>
              ) : (
                <dd className="text-sm font-medium text-slate-300">
                  {purchases.length > 0 ? 'Sem dado de proventos' : '—'}
                </dd>
              )}
            </div>
          </dl>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-200">Simulação de compra</h3>
            <button
              type="button"
              aria-pressed={onlyPurchases}
              onClick={() => setOnlyPurchases((value) => !value)}
              className={cn(
                'h-11 cursor-pointer rounded-lg border px-3 text-xs font-semibold',
                onlyPurchases
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800',
              )}
            >
              Só ativos com compra
            </button>
          </div>

          {visibleRows.length === 0 ? (
            <p className="text-sm text-slate-400">
              Este valor não compra nenhuma cota inteira na divisão atual.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-800">
              {visibleRows.map((row) => {
                const buys = row.quantityToBuy > 0
                return (
                  <li key={row.ticker} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{row.ticker}</p>
                        <p className="truncate text-xs text-slate-400">{row.name}</p>
                      </div>
                      <p className={cn('shrink-0 text-right text-sm', buys ? 'font-semibold text-emerald-300' : 'text-slate-400')}>
                        {buys ? `Cotas no cálculo: ${row.quantityToBuy.toLocaleString('pt-BR')}` : 'Sem compra neste cálculo'}
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-between gap-x-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        Atual: {formatPercent(row.currentPercent)}
                        {buys && (
                          <>
                            <ArrowRight className="size-3 text-emerald-400" aria-hidden="true" />
                            <span className="sr-only">depois,</span>
                            <span className="font-semibold text-emerald-300">{formatPercent(row.percentAfter)}</span>
                          </>
                        )}
                      </span>
                      <span>
                        {targetLabel}: {formatPercent(row.targetPercent)}
                      </span>
                    </div>

                    <div aria-hidden="true" className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-slate-950">
                      <div className="bg-sky-500" style={{ width: `${Math.min(100, row.currentPercent)}%` }} />
                      {buys && row.percentAfter > row.currentPercent && (
                        <div
                          className="bg-emerald-400"
                          style={{ width: `${Math.min(100 - row.currentPercent, row.percentAfter - row.currentPercent)}%` }}
                        />
                      )}
                    </div>

                    {buys && (
                      <dl className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm">
                        <div>
                          <dt className="text-xs text-slate-400">Valor no cálculo</dt>
                          <dd className="font-semibold text-white">{formatBRL(row.invested)}</dd>
                        </div>
                        <div className="text-right">
                          <dt className="text-xs text-slate-400">Renda mensal estimada</dt>
                          <dd className={row.monthlyIncome === null ? 'text-slate-400' : 'font-semibold text-white'}>
                            {row.monthlyIncome === null ? 'Sem dado de proventos' : `+${formatBRL(row.monthlyIncome)}`}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {eligible.length < assets.length && (
            <p className="text-xs text-slate-400">
              {plural(assets.length - eligible.length, 'investimento sem cotas ficou', 'investimentos sem cotas ficaram')} fora deste cálculo.
            </p>
          )}
        </>
      )}

      <InvestmentDisclaimer />
    </section>
  )
}
