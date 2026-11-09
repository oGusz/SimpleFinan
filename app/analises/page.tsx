'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { BarChart3, PieChart as PieChartIcon } from 'lucide-react'

import { BackButton } from '@/components/back-button'
import { InvestmentDisclaimer } from '@/components/investment-disclaimer'
import { PortfolioOverview } from '@/components/portfolio-overview'
import { PortfolioTimeline } from '@/components/portfolio-timeline'
import { useQuickAdd } from '@/components/quick-add-provider'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import type { AssetAllocationItem } from '@/components/portfolio-charts'

import { getDashboardData } from '@/app/actions/finance'
import { useAppMode } from '@/context/AppModeContext'
import { usePortfolio } from '@/context/PortfolioContext'
import { normalizeCategory } from '@/lib/asset-classification'
import { lastMonths, todayInBrazil } from '@/lib/finance-insights'

const SKELETON_CLASS = 'animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60'

// O recharts é pesado: só é baixado quando existe dado para desenhar.
const PortfolioCharts = dynamic(
  () => import('@/components/portfolio-charts').then((module) => module.PortfolioCharts),
  { ssr: false, loading: () => <div className={`h-64 ${SKELETON_CLASS}`} /> },
)

function Notice({ children, onRetry }: { children: string; onRetry: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-1 text-xs text-slate-300">
      <p className="py-2">{children}</p>
      <button type="button" onClick={onRetry} className="min-h-11 cursor-pointer font-semibold text-emerald-400">
        Tentar de novo
      </button>
    </div>
  )
}

export default function AnalisesPage() {
  const [now] = useState(() => new Date())
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const { assets, isSynced, loadError, reloadAssets } = usePortfolio()
  const { isOpenFinance, mode, loading: modeLoading } = useAppMode()
  const { open: openQuickAdd } = useQuickAdd()

  // Mesma chave do painel: quem vem de lá já encontra os dados no cache.
  const { data: dashboard, error, isValidating, mutate } = useSWR(
    modeLoading ? null : ['dashboard', year, month, mode],
    () => getDashboardData(month, year, mode),
  )

  const allocationData = useMemo<AssetAllocationItem[]>(() => {
    const totals = new Map<string, number>()
    for (const asset of assets) {
      const value = asset.quantity * asset.price
      if (!Number.isFinite(value) || value <= 0) continue
      const category = normalizeCategory(asset.category, asset.ticker)
      totals.set(category, (totals.get(category) ?? 0) + value)
    }
    return [...totals.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [assets])

  const history = dashboard?.history ?? null
  const hasCashFlow = Boolean(
    history && lastMonths(history, todayInBrazil(), 6).some((item) => item.expense > 0 || item.income > 0),
  )
  const hasBanks = Boolean(dashboard?.openFinance?.hasAccounts)
  const portfolioKnown = isSynced || loadError
  const hasAllocation = allocationData.length > 0

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28">
      <header className="flex items-center gap-1">
        <BackButton fallbackHref="/" />
        <h1 className="text-lg font-bold tracking-tight text-white">Análises</h1>
      </header>

      {error && !dashboard ? (
        <section role="alert" className="space-y-1 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
          <p className="text-sm text-rose-100">Não foi possível carregar suas análises.</p>
          <Button type="button" onClick={() => mutate()} disabled={isValidating} className="mt-2 w-full">
            {isValidating ? 'Tentando...' : 'Tentar novamente'}
          </Button>
        </section>
      ) : !dashboard ? (
        <div className="flex flex-col gap-4" role="status" aria-label="Carregando análises">
          <div className={`h-40 ${SKELETON_CLASS}`} />
          <div className={`h-64 ${SKELETON_CLASS}`} />
          <div className={`h-64 ${SKELETON_CLASS}`} />
        </div>
      ) : (
        <>
          {error && <Notice onRetry={() => mutate()}>Mostrando dados salvos; não foi possível atualizar</Notice>}
          {loadError && (
            <Notice onRetry={reloadAssets}>
              {assets.length > 0
                ? 'Carteira salva neste aparelho; não foi possível atualizar.'
                : 'Não foi possível carregar sua carteira.'}
            </Notice>
          )}

          <PortfolioTimeline bills={dashboard.next30Bills} assets={portfolioKnown ? assets : undefined} />

          {(hasAllocation && portfolioKnown) || hasCashFlow ? (
            <PortfolioCharts
              allocationData={portfolioKnown ? allocationData : []}
              cashFlowData={hasCashFlow && history ? history : []}
              mode={mode}
            />
          ) : null}

          {!portfolioKnown && <div className={`h-64 ${SKELETON_CLASS}`} role="status" aria-label="Carregando carteira" />}

          {isSynced && !hasAllocation && (
            isOpenFinance ? (
              <EmptyState
                icon={PieChartIcon}
                title={hasBanks ? 'Nenhum investimento encontrado nos bancos' : 'Sem investimentos para analisar'}
                description="A alocação aparece aqui quando seus bancos informarem investimentos."
                actionLabel={hasBanks ? 'Ver bancos' : 'Conectar banco'}
                href="/open-finance"
              />
            ) : (
              <EmptyState
                icon={PieChartIcon}
                title="Sem investimentos para analisar"
                description="Adicione um investimento para ver a divisão da sua carteira."
                actionLabel="Adicionar investimento"
                onAction={() => openQuickAdd('asset')}
              />
            )
          )}

          {dashboard.failed.history ? (
            <Notice onRetry={() => mutate()}>Não foi possível carregar o histórico por mês.</Notice>
          ) : (
            !hasCashFlow && (
              isOpenFinance ? (
                <EmptyState
                  icon={BarChart3}
                  title="Sem movimentações nos últimos 6 meses"
                  description="As entradas e saídas aparecem aqui depois da importação do extrato."
                  actionLabel={hasBanks ? 'Ver extrato' : 'Conectar banco'}
                  href={hasBanks ? '/extrato' : '/open-finance'}
                />
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title="Sem contas nos últimos 6 meses"
                  description="Cadastre uma conta para ver o total de cada mês."
                  actionLabel="Cadastrar conta"
                  onAction={() => openQuickAdd('bill')}
                />
              )
            )
          )}

          {portfolioKnown && <PortfolioOverview assets={assets} />}

          <InvestmentDisclaimer />
        </>
      )}
    </main>
  )
}
