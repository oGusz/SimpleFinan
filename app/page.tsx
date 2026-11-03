'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import { LogOut } from 'lucide-react'

import { PortfolioOverview } from '@/components/portfolio-overview'
import { SummaryBar } from '@/components/summary-bar'
import { UpcomingPayments } from '@/components/upcoming-payments'
import { CreateBillModal } from '@/components/bills/CreateBillModal'
import { AddInvestmentModal } from '@/components/AddInvestmentModal'
import { RebalanceWidget } from '@/components/RebalanceWidget'
import { PortfolioTimeline, DividendEvent } from '@/components/portfolio-timeline'
import type { AssetAllocationItem, MonthlyCashFlowItem } from '@/components/portfolio-charts'

import { getDashboardData, Goal } from '@/app/actions/finance'
import { logout } from '@/app/actions/auth'
import { usePortfolio } from '@/context/PortfolioContext'
import { FinancialGoalsSection } from '@/components/goals/FinancialGoalsSection'
import { MonthSelector } from '@/components/month-selector'
import { SkeletonCards } from '@/components/page-skeleton'
import { createClient } from '@/lib/supabase/client'

// A biblioteca de gráficos é pesada e fica no fim da tela: não precisa atrasar a abertura.
const PortfolioCharts = dynamic(
  () => import('@/components/portfolio-charts').then((module) => module.PortfolioCharts),
  { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-xl bg-slate-800/40" /> },
)

const NO_ITEMS: never[] = []

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

interface UserProfile {
  name: string
  avatarUrl: string | null
}

export default function Page() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: '',
    avatarUrl: null,
  })

  const { assets, addAsset } = usePortfolio()
  const supabase = createClient()

  // Ao voltar para esta tela, o cache aparece na hora e os dados atualizam em segundo plano.
  const month = currentDate.getMonth() + 1
  const year = currentDate.getFullYear()
  const { data: dashboard, mutate: refreshDashboard } = useSWR(
    ['dashboard', year, month],
    () => getDashboardData(month, year),
    { keepPreviousData: true },
  )
  const bills: any[] = dashboard?.bills ?? NO_ITEMS
  const historicalCashFlow: MonthlyCashFlowItem[] = dashboard?.history ?? NO_ITEMS
  const goals: Goal[] = dashboard?.goals ?? NO_ITEMS
  const loading = !dashboard

  // Carregar dados da conta Google / Supabase
  useEffect(() => {
    async function fetchUserData() {
      // A sessão local basta para exibir nome e foto, sem esperar a rede.
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const user = session?.user

      if (user) {
        const metadata = user.user_metadata || {}
        const fullName =
          metadata.full_name ||
          metadata.name ||
          user.email?.split('@')[0] ||
          'Usuário'

        const avatar =
          metadata.avatar_url ||
          metadata.picture ||
          null

        setUserProfile({
          name: fullName,
          avatarUrl: avatar,
        })
      }
    }

    fetchUserData()
  }, [])

  const handleAddInvestment = (newAsset: {
    ticker: string
    name: string
    quantity: number
    price: number
    totalValue: number
    type: string
  }) => {
    addAsset({
      ticker: newAsset.ticker.toUpperCase(),
      name: newAsset.name || newAsset.ticker,
      quantity: Number(newAsset.quantity),
      price: Number(newAsset.price),
      dividendYield: 10,
      category: newAsset.type || 'Tijolo',
    })
  }

  const mappedInvestments: Investment[] = assets.map((item) => ({
    id: item.ticker,
    ticker: item.ticker,
    name: item.name,
    type: item.category || 'FII',
    value: item.quantity * item.price,
    price: item.price,
    quantity: item.quantity,
    updated_at: new Date().toISOString(),
  }))

  const fiiAssetsForRebalance = assets.map((item) => ({
    ticker: item.ticker,
    name: item.name,
    quantity: item.quantity,
    price: item.price,
    pvp: 0.92,
    category: 'TIJOLO_DESCONTO' as const,
    targetAllocation: Number((100 / (assets.length || 1)).toFixed(2)),
  }))

  const mockDividends: DividendEvent[] = useMemo(() => {
    return assets.map((asset, index) => {
      const ratePerShare = 0.85 + index * 0.1
      const today = currentDate
      const paymentDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        15 + (index % 10)
      )
        .toISOString()
        .split('T')[0]

      return {
        id: `div-${asset.ticker}`,
        ticker: asset.ticker,
        type: 'DIVIDEND',
        title: `Rendimento ${asset.ticker}`,
        ratePerShare,
        sharesCount: asset.quantity,
        amount: asset.quantity * ratePerShare,
        dataCom: new Date().toISOString().split('T')[0],
        paymentDate,
        status: 'DECLARED',
      }
    })
  }, [assets, currentDate])

  const realAllocationData: AssetAllocationItem[] = useMemo(() => {
    if (!assets || assets.length === 0) return []

    const categoryTotals: Record<string, number> = {}

    assets.forEach((asset) => {
      const category = asset.category || 'Tijolo'
      const totalValue = asset.quantity * asset.price
      categoryTotals[category] = (categoryTotals[category] || 0) + totalValue
    })

    return Object.entries(categoryTotals).map(([category, amount]) => ({
      category,
      amount,
    }))
  }, [assets])

  const realCashFlowData: MonthlyCashFlowItem[] = useMemo(() => {
    const totalCurrentIncome = mockDividends.reduce((sum, d) => sum + d.amount, 0)
    const monthsName = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    const currentMonthLabel = monthsName[currentDate.getMonth()]

    if (historicalCashFlow.length === 0) {
      const currentExpenses = bills.reduce((sum, b) => sum + Number(b.amount || 0), 0)
      return [
        {
          month: currentMonthLabel,
          income: totalCurrentIncome,
          expense: currentExpenses,
        },
      ]
    }

    return historicalCashFlow.map((item) => {
      if (item.month === currentMonthLabel) {
        return {
          ...item,
          income: totalCurrentIncome,
        }
      }
      return item
    })
  }, [historicalCashFlow, mockDividends, bills, currentDate])

  // Primeiro nome para a saudação amigável
  const firstName = userProfile.name.trim().split(' ')[0] || 'por aqui'

  return (
    <>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-28 select-none">

        {/* CABEÇALHO DO USUÁRIO ESTILO APP NATIVO */}
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* FOTO DE PERFIL DO GOOGLE */}
              {userProfile.avatarUrl ? (
                <img
                  src={userProfile.avatarUrl}
                  alt={userProfile.name}
                  referrerPolicy="no-referrer"
                  className="h-11 w-11 rounded-full object-cover border-2 border-emerald-500/30 shadow-sm"
                />
              ) : (
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-sm">
                  {firstName[0]?.toUpperCase() || 'U'}
                </div>
              )}

              {/* SAUDAÇÃO PERSONALIZADA */}
              <div className="flex flex-col">
                <span className="text-[11px] font-medium text-slate-400">
                  Que bom ter você por aqui,
                </span>
                <h1 className="text-lg font-bold tracking-tight text-white">
                  Olá, {firstName} 👋
                </h1>
              </div>
            </div>

            {/* BOTÃO DE LOGOUT DISCRETO */}
            <button
              onClick={() => logout()}
              title="Sair da conta"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 active:scale-95 hover:text-rose-400 transition-all"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          {/* SELETOR DE MÊS ESTILO SEGMENTED CONTROL */}
          <div className="flex items-center justify-center w-full rounded-2xl bg-slate-900/60 p-1 border border-slate-800/80 backdrop-blur-md">
            <MonthSelector currentDate={currentDate} onChangeDate={setCurrentDate} />
          </div>

          {/* AÇÕES RÁPIDAS */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="[&>button]:w-full [&>button]:h-11 [&>button]:rounded-xl [&>button]:active:scale-[0.98] [&>button]:transition-transform">
              <CreateBillModal />
            </div>
            <div className="[&>button]:w-full [&>button]:h-11 [&>button]:rounded-xl [&>button]:active:scale-[0.98] [&>button]:transition-transform">
              <AddInvestmentModal onAddInvestment={handleAddInvestment} />
            </div>
          </div>
        </header>

        <section className="rounded-2xl bg-slate-900/40 p-4 border border-slate-800/80 shadow-sm backdrop-blur-sm">
          <UpcomingPayments
            bills={bills}
            onStatusChange={() => refreshDashboard()}
          />
        </section>

        {/* CONTEÚDO PRINCIPAL */}
        {loading ? (
          <SkeletonCards />
        ) : (
          <div className="flex flex-col gap-5">
            <section className="rounded-2xl bg-slate-900/40 p-4 border border-slate-800/80 shadow-sm backdrop-blur-sm">
              <SummaryBar bills={bills} />
            </section>

            <section className="rounded-2xl bg-slate-900/40 p-4 border border-slate-800/80 shadow-sm backdrop-blur-sm">
              <PortfolioTimeline
                dividends={mockDividends}
                bills={bills.map((b) => ({
                  id: b.id || String(Math.random()),
                  title: b.title || b.description || 'Conta a pagar',
                  type: 'BILL',
                  amount: Number(b.amount || 0),
                  dueDate: b.due_date || b.dueDate || new Date().toISOString().split('T')[0],
                  category: b.category,
                  status: b.status || 'PENDING',
                }))}
              />
            </section>

            <section className="rounded-2xl bg-slate-900/40 p-4 border border-slate-800/80 shadow-sm backdrop-blur-sm">
              <FinancialGoalsSection goals={goals} onRefresh={() => refreshDashboard()} />
            </section>



            <section className="rounded-2xl bg-slate-900/40 p-4 border border-slate-800/80 shadow-sm backdrop-blur-sm">
              <PortfolioOverview investments={mappedInvestments} />
            </section>

            <section className="rounded-2xl bg-slate-900/40 p-4 border border-slate-800/80 shadow-sm backdrop-blur-sm">
              <PortfolioCharts
                allocationData={realAllocationData}
                cashFlowData={realCashFlowData}
              />
            </section>

            <section className="rounded-2xl bg-slate-900/40 p-4 border border-slate-800/80 shadow-sm backdrop-blur-sm">
              <RebalanceWidget assets={fiiAssetsForRebalance} />
            </section>
          </div>
        )}
      </main>
    </>
  )
}