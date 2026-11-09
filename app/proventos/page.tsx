'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Coins, Crown } from 'lucide-react'

import { BackButton } from '@/components/back-button'
import { InvestmentDisclaimer } from '@/components/investment-disclaimer'
import { useQuickAdd } from '@/components/quick-add-provider'
import { buttonVariants } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import { useAppMode } from '@/context/AppModeContext'
import { usePortfolio } from '@/context/PortfolioContext'
import { todayInBrazil } from '@/lib/finance-insights'
import { formatBRL, formatPercent, plural } from '@/lib/format'
import { incomeConcentration, planIncomeGoal, summarizeIncome, type IncomeAsset } from '@/lib/income'
import { safeGet, safeSet } from '@/lib/safe-storage'
import { isExchangeTicker } from '@/lib/tickers'

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const GOAL_KEY = '@simplefinan:income-goal'

function monthLabel(month: string) {
  const [year, index] = month.split('-').map(Number)
  return `${MONTH_NAMES[index - 1]}/${String(year).slice(2)}`
}

function paymentRhythm(months: number[]) {
  if (months.length === 0) return 'Sem proventos em 12 meses'
  if (months.length >= 11) return 'Pagou todo mês'
  return `Pagou em ${months.map((month) => MONTH_NAMES[month - 1]).join(', ')}`
}

// Prazos longos são lidos melhor em anos: 216 meses diz pouco.
function durationLabel(months: number) {
  if (months < 24) return plural(months, 'mês', 'meses')
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest === 0 ? plural(years, 'ano', 'anos') : `${plural(years, 'ano', 'anos')} e ${plural(rest, 'mês', 'meses')}`
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-lg font-bold tabular-nums text-white">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function PremiumLock() {
  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
      <div className="flex items-center gap-2">
        <Crown className="size-5 text-emerald-300" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-white">Radar completo no Premium</h2>
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
        <li>Proventos mês a mês e em quais meses cada ativo pagou</li>
        <li>Yield sobre o preço que você pagou</li>
        <li>Quanto investir para chegar na renda que você quer</li>
        <li>De quais ativos sua renda mais depende</li>
      </ul>
      <Link href="/planos" className={buttonVariants({ className: 'mt-3 w-full' })}>
        Conhecer o Premium
      </Link>
    </section>
  )
}

export default function ProventosPage() {
  const { assets, isLoaded } = usePortfolio()
  const { isPremium, loading: planLoading } = useAppMode()
  const { open: openQuickAdd } = useQuickAdd()
  const [today] = useState(() => todayInBrazil())

  const [target, setTarget] = useState<number | null>(null)
  const [contribution, setContribution] = useState<number | null>(null)

  // A meta é uma preferência deste aparelho: não é dado financeiro que precise ir ao banco.
  useEffect(() => {
    try {
      const saved = JSON.parse(safeGet(GOAL_KEY) ?? 'null')
      if (saved && typeof saved === 'object') {
        setTarget(typeof saved.target === 'number' ? saved.target : null)
        setContribution(typeof saved.contribution === 'number' ? saved.contribution : null)
      }
    } catch {
      // Valor corrompido: começa vazio.
    }
  }, [])
  useEffect(() => {
    safeSet(GOAL_KEY, JSON.stringify({ target, contribution }))
  }, [target, contribution])

  const exchangeAssets = useMemo(() => assets.filter((asset) => isExchangeTicker(asset.ticker)), [assets])
  const waitingDividends = exchangeAssets.some((asset) => asset.dividendStatus === undefined)

  const summary = useMemo(() => {
    const rows: IncomeAsset[] = exchangeAssets.map((asset) => ({
      ticker: asset.ticker,
      quantity: asset.quantity,
      price: asset.quoteMissing ? 0 : asset.price,
      avgPrice: asset.avgPrice,
      status: asset.dividendStatus,
      total12m: asset.dividendTotal12m ?? null,
      events: asset.dividendEvents ?? [],
    }))
    return summarizeIncome(rows, today)
  }, [exchangeAssets, today])

  const currentValue = useMemo(
    () =>
      exchangeAssets
        .filter((asset) => !summary.unavailable.includes(asset.ticker))
        .reduce((sum, asset) => sum + asset.quantity * asset.price, 0),
    [exchangeAssets, summary.unavailable],
  )
  const plan = planIncomeGoal(target ?? 0, summary.portfolioYield, currentValue, contribution ?? 0)
  const concentration = incomeConcentration(summary)
  const maxMonth = Math.max(...summary.months.map((item) => item.amount), 0)

  const loading = !isLoaded || planLoading || (exchangeAssets.length > 0 && waitingDividends)

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex items-start gap-2">
        <BackButton fallbackHref="/carteira" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400">Dividendos e rendimentos dos seus ativos</p>
          <h1 className="text-2xl font-bold tracking-tight text-white">Radar de proventos</h1>
        </div>
      </header>

      {loading ? (
        <div aria-busy="true" className="space-y-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-28 animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60" />
          ))}
        </div>
      ) : exchangeAssets.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="Nenhum ativo da bolsa na carteira"
          description="Adicione ações ou fundos imobiliários para ver quanto eles pagaram de proventos."
          actionLabel="Adicionar investimento"
          onAction={() => openQuickAdd('asset')}
        />
      ) : (
        <>
          <section aria-labelledby="renda-titulo" className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
            <h2 id="renda-titulo" className="text-sm font-semibold text-white">Renda dos últimos 12 meses</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Média por mês" value={formatBRL(summary.monthly)} />
              <Stat label="Em 12 meses" value={formatBRL(summary.annual)} />
              <Stat
                label="Rendimento da carteira"
                value={summary.portfolioYield === null ? '—' : `${formatPercent(summary.portfolioYield)} a.a.`}
                hint="sobre o valor atual"
              />
            </div>
            <p className="text-xs text-slate-400">
              Calculado com a quantidade de cotas que você tem hoje e os proventos pagos por cota nos últimos 12 meses.
              Não garante pagamentos futuros.
            </p>
            {summary.unavailable.length > 0 && (
              <p role="status" className="text-xs text-amber-300">
                Sem histórico disponível agora: {summary.unavailable.join(', ')}. {plural(summary.unavailable.length, 'Este ativo ficou', 'Estes ativos ficaram')} fora da conta.
              </p>
            )}
          </section>

          {!isPremium ? (
            <PremiumLock />
          ) : (
            <>
              <section aria-labelledby="meses-titulo" className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
                <div>
                  <h2 id="meses-titulo" className="text-sm font-semibold text-white">Mês a mês</h2>
                  <p className="text-xs text-slate-400">Pelo mês da data ex; o pagamento pode cair no mês seguinte.</p>
                </div>
                <div className="flex h-36 items-end gap-1" aria-hidden="true">
                  {summary.months.map((item) => (
                    <div key={item.month} className="flex h-full flex-1 flex-col justify-end gap-1">
                      <div
                        className="w-full rounded-t bg-emerald-500/80"
                        style={{ height: maxMonth > 0 ? `${Math.max((item.amount / maxMonth) * 100, item.amount > 0 ? 3 : 0)}%` : 0 }}
                      />
                      <span className="text-center text-[11px] text-slate-400">{MONTH_NAMES[Number(item.month.slice(5)) - 1]}</span>
                    </div>
                  ))}
                </div>
                <details className="text-sm text-slate-300">
                  <summary className="min-h-11 cursor-pointer py-3 font-semibold text-emerald-400">Ver valores</summary>
                  <table className="w-full text-sm">
                    <caption className="sr-only">Proventos por mês</caption>
                    <thead>
                      <tr className="text-left text-xs text-slate-400">
                        <th scope="col" className="py-1 font-medium">Mês</th>
                        <th scope="col" className="py-1 text-right font-medium">Proventos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.months.map((item) => (
                        <tr key={item.month} className="border-t border-slate-800">
                          <td className="py-1.5">{monthLabel(item.month)}</td>
                          <td className="py-1.5 text-right tabular-nums">{formatBRL(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </section>

              <section aria-labelledby="ativos-titulo" className="space-y-3">
                <h2 id="ativos-titulo" className="text-sm font-semibold text-white">Por ativo</h2>
                <ul className="space-y-3">
                  {summary.assets.map((asset) => (
                    <li key={asset.ticker} className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-base font-semibold text-white">{asset.ticker}</p>
                        <p className="text-sm font-semibold tabular-nums text-emerald-300">{formatBRL(asset.monthly)}/mês</p>
                      </div>
                      <p className="text-xs text-slate-400">{paymentRhythm(asset.paymentMonths)}</p>
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <dt className="text-xs text-slate-400">Em 12 meses</dt>
                          <dd className="font-semibold tabular-nums text-slate-100">{formatBRL(asset.annual)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-400">Yield atual</dt>
                          <dd className="font-semibold tabular-nums text-slate-100">
                            {asset.currentYield === null ? '—' : formatPercent(asset.currentYield)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-400">Sobre o custo</dt>
                          <dd className="font-semibold tabular-nums text-slate-100">
                            {asset.yieldOnCost === null ? '—' : formatPercent(asset.yieldOnCost)}
                          </dd>
                        </div>
                      </dl>
                      {asset.yieldOnCost === null && (
                        <Link
                          href={`/carteira#ativo-${asset.ticker}`}
                          className="mt-1 inline-flex min-h-11 items-center text-sm text-emerald-400 underline underline-offset-2"
                        >
                          Informe seu preço médio
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              {concentration.length > 0 && (
                <section role="note" aria-labelledby="concentracao-titulo" className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
                  <h2 id="concentracao-titulo" className="text-sm font-semibold text-amber-100">De onde vem sua renda</h2>
                  <p className="mt-1 text-sm text-amber-100/90">
                    {concentration
                      .map((item) => `${formatPercent(item.share, { digits: 0 })} dos proventos vieram de ${item.ticker}`)
                      .join('; ')}
                    . Se {concentration.length > 1 ? 'esses ativos reduzirem' : 'esse ativo reduzir'} os pagamentos, sua renda cai na mesma proporção.
                  </p>
                </section>
              )}

              <section aria-labelledby="meta-titulo" className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
                <div>
                  <h2 id="meta-titulo" className="text-sm font-semibold text-white">Meta de renda passiva</h2>
                  <p className="text-xs text-slate-400">Quanto você precisaria investido para receber essa renda.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Renda por mês">
                    {({ id, describedBy }) => (
                      <MoneyInput id={id} aria-describedby={describedBy} value={target} onValueChange={setTarget} />
                    )}
                  </Field>
                  <Field label="Aporte por mês">
                    {({ id, describedBy }) => (
                      <MoneyInput id={id} aria-describedby={describedBy} value={contribution} onValueChange={setContribution} />
                    )}
                  </Field>
                </div>
                {target && summary.portfolioYield !== null && summary.portfolioYield <= 0 ? (
                  <p className="text-sm text-slate-300">Seus ativos não pagaram proventos nos últimos 12 meses, então não há rendimento para usar na conta.</p>
                ) : plan ? (
                  <div role="status" className="space-y-1 text-sm text-slate-200">
                    <p>
                      Com o rendimento atual da carteira ({formatPercent(summary.portfolioYield)} a.a.), {formatBRL(target)} por mês pedem{' '}
                      <strong className="text-white">{formatBRL(plan.neededCapital)}</strong> investidos.
                    </p>
                    {plan.missing === 0 ? (
                      <p className="font-semibold text-emerald-300">Sua carteira já chega nessa renda.</p>
                    ) : (
                      <p>
                        Faltam <strong className="text-white">{formatBRL(plan.missing)}</strong>
                        {plan.monthsToGoal !== null &&
                          `: cerca de ${durationLabel(plan.monthsToGoal)} de aportes, sem contar valorização nem reinvestimento`}
                        .
                      </p>
                    )}
                  </div>
                ) : null}
              </section>
            </>
          )}

          <InvestmentDisclaimer />
        </>
      )}
    </main>
  )
}
