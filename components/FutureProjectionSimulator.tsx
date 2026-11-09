'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, BarChart3, TrendingUp } from 'lucide-react'
import { Area, AreaChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { InvestmentDisclaimer } from '@/components/investment-disclaimer'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, fieldControlClass } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import type { Asset } from '@/context/PortfolioContext'
import { formatBRL, formatBRLCompact, formatPercent, plural } from '@/lib/format'
import { parseDecimalInput } from '@/lib/parse-number'
import { isExchangeTicker } from '@/lib/tickers'
import { cn } from '@/lib/utils'

type AllocationStrategy = 'proportional' | 'equal'

const YEAR_OPTIONS = [1, 3, 5, 10, 15, 20]
const MAX_ANNUAL_RATE = 30
const INCOME_BASIS = 'com base nos últimos 12 meses, não garante pagamentos futuros'

export type SimulatorAsset = Pick<
  Asset,
  'ticker' | 'name' | 'quantity' | 'price' | 'lastDividend' | 'dividendHistoryMonths'
>

export interface SimulationInput {
  monthlyContribution: number
  years: number
  priceGrowthRate: number
  dividendGrowthRate: number
  reinvestDividends: boolean
  allocationStrategy: AllocationStrategy
}

const unitDividendOf = (asset: SimulatorAsset) =>
  asset.lastDividend !== undefined && asset.lastDividend > 0 ? asset.lastDividend : null

export function simulateProjection(assets: SimulatorAsset[], input: SimulationInput) {
  const { monthlyContribution, years, priceGrowthRate, dividendGrowthRate, reinvestDividends, allocationStrategy } = input

  // Sem preço ou sem posição não há como comprar: o aporte daquele peso sumiria da conta.
  const positions = assets.filter((asset) => asset.price > 0 && asset.quantity > 0)
  const totalValue = positions.reduce((acc, asset) => acc + asset.quantity * asset.price, 0)
  const weightOf = (asset: SimulatorAsset) =>
    allocationStrategy === 'proportional' && totalValue > 0
      ? (asset.quantity * asset.price) / totalValue
      : 1 / positions.length

  const monthlyPriceRate = Math.pow(1 + priceGrowthRate / 100, 1 / 12) - 1
  const monthlyDividendRate = Math.pow(1 + dividendGrowthRate / 100, 1 / 12) - 1
  const priceFactor = (month: number) => Math.pow(1 + monthlyPriceRate, month)
  const dividendFactor = (month: number) => Math.pow(1 + monthlyDividendRate, month)

  const quantities = new Map(positions.map((asset) => [asset.ticker, asset.quantity]))
  const totalMonths = years * 12
  // Com prazo longo, um ponto por mês só pesa no gráfico sem acrescentar leitura.
  const pointEvery = years > 3 ? 6 : 1

  let contributed = totalValue
  let totalDividends = 0
  let crossoverMonth: number | null = null
  const timeline = [{ month: 0, projected: Math.round(totalValue), contributed: Math.round(totalValue) }]

  for (let month = 1; month <= totalMonths; month++) {
    const dividendsThisMonth = positions.reduce(
      (acc, asset) =>
        acc + (quantities.get(asset.ticker) ?? 0) * (unitDividendOf(asset) ?? 0) * dividendFactor(month),
      0,
    )
    if (crossoverMonth === null && monthlyContribution > 0 && dividendsThisMonth >= monthlyContribution) {
      crossoverMonth = month
    }
    totalDividends += dividendsThisMonth

    const cash = monthlyContribution + (reinvestDividends ? dividendsThisMonth : 0)
    for (const asset of positions) {
      const bought = (cash * weightOf(asset)) / (asset.price * priceFactor(month))
      quantities.set(asset.ticker, (quantities.get(asset.ticker) ?? 0) + bought)
    }
    contributed += monthlyContribution

    if (month % pointEvery === 0 || month === totalMonths) {
      const marketValue = positions.reduce(
        (acc, asset) => acc + (quantities.get(asset.ticker) ?? 0) * asset.price * priceFactor(month),
        0,
      )
      timeline.push({ month, projected: Math.round(marketValue), contributed: Math.round(contributed) })
    }
  }

  const finalPriceFactor = priceFactor(totalMonths)
  const finalDividendFactor = dividendFactor(totalMonths)
  const perAsset = positions.map((asset) => {
    const finalQuantity = quantities.get(asset.ticker) ?? 0
    const unit = unitDividendOf(asset)
    return {
      asset,
      finalQuantity,
      finalValue: finalQuantity * asset.price * finalPriceFactor,
      finalMonthlyIncome: unit === null ? null : finalQuantity * unit * finalDividendFactor,
    }
  })

  const withIncome = positions.filter((asset) => unitDividendOf(asset) !== null)
  const valueWithIncome = withIncome.reduce((acc, asset) => acc + asset.quantity * asset.price, 0)
  const currentIncome = withIncome.reduce((acc, asset) => acc + asset.quantity * (unitDividendOf(asset) ?? 0), 0)

  return {
    positions,
    timeline,
    perAsset,
    contributed,
    totalDividends,
    crossoverMonth,
    finalValue: perAsset.reduce((acc, item) => acc + item.finalValue, 0),
    finalMonthlyIncome: perAsset.reduce((acc, item) => acc + (item.finalMonthlyIncome ?? 0), 0),
    hasDividendData: withIncome.length > 0,
    // Só sobre os ativos com dado: os demais diluiriam o número sem motivo real.
    averageMonthlyYieldPercent: valueWithIncome > 0 ? (currentIncome / valueWithIncome) * 100 : null,
  }
}

const parseRate = (text: string) => Math.min(MAX_ANNUAL_RATE, Math.max(0, parseDecimalInput(text) ?? 0))

function RateField({ label, value, onChange }: { label: string; value: string; onChange: (text: string) => void }) {
  return (
    <Field label={label}>
      {({ id, describedBy }) => (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max="12"
            step="0.5"
            aria-label={`${label}, controle deslizante`}
            value={Math.min(12, parseRate(value))}
            onChange={(event) => onChange(event.target.value.replace('.', ','))}
            className="h-11 min-w-0 flex-1 cursor-pointer accent-emerald-500"
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              id={id}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              aria-describedby={describedBy}
              value={value}
              onChange={(event) => {
                if (/^[0-9.,]*$/.test(event.target.value)) onChange(event.target.value)
              }}
              onBlur={() => onChange(String(parseRate(value)).replace('.', ','))}
              className={cn(fieldControlClass, 'w-20 text-right')}
            />
            <span aria-hidden="true" className="text-sm text-slate-400">
              %
            </span>
          </div>
        </div>
      )}
    </Field>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="text-base font-bold break-words text-white">{value}</dd>
      {note && <dd className="text-xs text-slate-400">{note}</dd>}
    </div>
  )
}

const yearLabel = (years: number) => (years === 0 ? 'Hoje' : years === 1 ? '1 ano' : `${years} anos`)

interface FutureProjectionSimulatorProps {
  assets: Asset[]
}

export function FutureProjectionSimulator({ assets }: FutureProjectionSimulatorProps) {
  const [monthlyContribution, setMonthlyContribution] = useState<number | null>(null)
  const [years, setYears] = useState(1)
  const [priceGrowthText, setPriceGrowthText] = useState('0')
  const [dividendGrowthText, setDividendGrowthText] = useState('0')
  const [reinvestDividends, setReinvestDividends] = useState(true)
  const [allocationStrategy, setAllocationStrategy] = useState<AllocationStrategy>('proportional')

  const contribution = monthlyContribution ?? 0

  const simulation = useMemo(
    () =>
      simulateProjection(assets, {
        monthlyContribution: contribution,
        years,
        priceGrowthRate: parseRate(priceGrowthText),
        dividendGrowthRate: parseRate(dividendGrowthText),
        // Sem provento conhecido o interruptor fica oculto: o valor guardado não muda nada na conta.
        reinvestDividends,
        allocationStrategy,
      }),
    [assets, contribution, years, priceGrowthText, dividendGrowthText, reinvestDividends, allocationStrategy],
  )

  if (simulation.positions.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <EmptyState
          icon={BarChart3}
          title="Nenhum ativo para simular"
          description="Adicione ativos à carteira para projetar o crescimento."
        />
      </section>
    )
  }

  const yearStep = Math.max(1, Math.ceil(years / 5))
  const ticks = Array.from({ length: Math.floor(years / yearStep) + 1 }, (_, index) => index * yearStep * 12)
  const shortHistory = simulation.positions.filter(
    (asset) =>
      unitDividendOf(asset) !== null && asset.dividendHistoryMonths !== undefined && asset.dividendHistoryMonths < 12,
  )
  const withoutIncome = simulation.positions.filter(
    (asset) => unitDividendOf(asset) === null && isExchangeTicker(asset.ticker),
  )

  return (
    <section aria-labelledby="simulador-projecao" className="flex w-full flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-col gap-1">
        <h2 id="simulador-projecao" className="flex items-center gap-2 text-lg font-bold text-white">
          <TrendingUp className="size-5 text-emerald-400" aria-hidden="true" />
          Simulador de projeção
        </h2>
        <p className="text-sm text-slate-400">
          Compra mensal com {plural(simulation.positions.length, 'ativo atual', 'ativos atuais')} da carteira.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Field label="Aporte mensal">
          {({ id, describedBy }) => (
            <MoneyInput
              id={id}
              aria-describedby={describedBy}
              placeholder="Quanto investir por mês"
              value={monthlyContribution}
              onValueChange={setMonthlyContribution}
            />
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <p className="flex justify-between text-sm font-medium text-slate-300">
            Prazo <span className="font-semibold text-white">{yearLabel(years)}</span>
          </p>
          <div role="group" aria-label="Prazo da simulação" className="grid grid-cols-6 gap-1">
            {YEAR_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={years === option}
                aria-label={yearLabel(option)}
                onClick={() => setYears(option)}
                className={cn(
                  'h-11 cursor-pointer rounded-lg border text-xs font-semibold',
                  years === option
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800',
                )}
              >
                {option}a
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-slate-300">Como dividir o aporte</p>
          <div role="group" aria-label="Como dividir o aporte" className="grid grid-cols-2 gap-2">
            {(
              [
                ['proportional', 'Proporcional ao valor'],
                ['equal', 'Igual entre os ativos'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={allocationStrategy === value}
                onClick={() => setAllocationStrategy(value)}
                className={cn(
                  'min-h-11 cursor-pointer rounded-lg border px-2 py-1.5 text-xs font-semibold',
                  allocationStrategy === value
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <RateField label="Valorização das cotas (% a.a.)" value={priceGrowthText} onChange={setPriceGrowthText} />

        {simulation.hasDividendData && (
          <>
            <RateField label="Reajuste dos proventos (% a.a.)" value={dividendGrowthText} onChange={setDividendGrowthText} />
            <button
              type="button"
              role="switch"
              aria-checked={reinvestDividends}
              onClick={() => setReinvestDividends((value) => !value)}
              className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-left text-sm font-medium text-slate-300"
            >
              Reinvestir proventos
              <span
                aria-hidden="true"
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                  reinvestDividends ? 'bg-emerald-600' : 'bg-slate-700',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform',
                    reinvestDividends && 'translate-x-5',
                  )}
                />
              </span>
            </button>
          </>
        )}
      </div>

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-x-4 gap-y-3 border-y border-slate-800 py-3">
        <Metric
          label="Patrimônio simulado"
          value={formatBRL(simulation.finalValue)}
          note={`Valor atual + aportes: ${formatBRL(simulation.contributed)}`}
        />
        {simulation.hasDividendData && (
          <>
            <Metric
              label="Proventos no período"
              value={formatBRL(simulation.totalDividends)}
              note={reinvestDividends ? 'Reinvestidos na simulação' : 'Sem reinvestimento'}
            />
            <Metric label={`Renda mensal em ${yearLabel(years)}`} value={formatBRL(simulation.finalMonthlyIncome)} />
            <Metric
              label="Yield médio mensal"
              value={formatPercent(simulation.averageMonthlyYieldPercent, { digits: 2 })}
            />
            {contribution > 0 && (
              <Metric
                label="Mês em que os proventos superam o aporte"
                value={simulation.crossoverMonth ? `${simulation.crossoverMonth}º mês` : 'Não ocorre neste prazo'}
              />
            )}
          </>
        )}
      </dl>

      {simulation.hasDividendData ? (
        <div className="flex flex-col gap-1 text-xs text-slate-400">
          <p>Proventos {INCOME_BASIS}.</p>
          {withoutIncome.length > 0 && (
            <p>Sem dado de proventos, fora da renda: {withoutIncome.map((asset) => asset.ticker).join(', ')}.</p>
          )}
          {shortHistory.length > 0 && (
            <p>
              Menos de 12 meses de histórico, a média pode estar abaixo do real:{' '}
              {shortHistory.map((asset) => asset.ticker).join(', ')}.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm font-medium text-slate-300">Sem dado de proventos</p>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-400">
          Simulação com as premissas acima. Não considera impostos, custos ou inflação e não garante resultado.
        </p>
        <InvestmentDisclaimer />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-200">Evolução simulada</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={simulation.timeline} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="simuladorPatrimonio" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="simuladorAportes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                type="number"
                domain={[0, years * 12]}
                ticks={ticks}
                tickFormatter={(month) => yearLabel(Number(month) / 12)}
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={(value) => formatBRLCompact(Number(value))}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#020617',
                  borderColor: '#1e293b',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: '#fff',
                }}
                labelFormatter={(month) => (Number(month) === 0 ? 'Hoje' : `Mês ${Number(month)}`)}
                formatter={(value, name) => [formatBRL(Number(value)), name]}
              />
              <Legend verticalAlign="top" height={32} formatter={(value) => <span className="text-xs text-slate-300">{value}</span>} />
              <Area type="monotone" dataKey="projected" name="Patrimônio simulado" stroke="#059669" fill="url(#simuladorPatrimonio)" strokeWidth={2} />
              <Area type="monotone" dataKey="contributed" name="Valor atual + aportes" stroke="#3b82f6" fill="url(#simuladorAportes)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-slate-200">Projeção por ativo</h3>
        <ul className="flex flex-col divide-y divide-slate-800">
          {simulation.perAsset.map(({ asset, finalQuantity, finalValue, finalMonthlyIncome }) => {
            const hasShares = isExchangeTicker(asset.ticker)
            const isShortHistory =
              finalMonthlyIncome !== null && asset.dividendHistoryMonths !== undefined && asset.dividendHistoryMonths < 12
            return (
              <li key={asset.ticker} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <p className="truncate text-sm font-bold text-white">{hasShares ? asset.ticker : asset.name}</p>
                {hasShares && <p className="truncate text-xs text-slate-400">{asset.name}</p>}
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-400">Valor simulado</span>
                  <span className="font-semibold text-white">{formatBRL(finalValue)}</span>
                </div>
                {hasShares && (
                  <>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-400">Cotas</span>
                      <span className="flex items-center gap-1 text-slate-200">
                        {asset.quantity.toLocaleString('pt-BR')}
                        <ArrowRight className="size-3 text-slate-400" aria-hidden="true" />
                        <span className="sr-only">na simulação,</span>
                        <span className="font-semibold">{finalQuantity.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-400">Renda mensal</span>
                      <span className={finalMonthlyIncome === null ? 'text-slate-400' : 'font-semibold text-white'}>
                        {finalMonthlyIncome === null ? 'Sem dado de proventos' : formatBRL(finalMonthlyIncome)}
                      </span>
                    </div>
                    {isShortHistory && (
                      <p className="text-xs text-slate-400">Menos de 12 meses de histórico</p>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
