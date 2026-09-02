'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Wallet } from 'lucide-react'

import { PortfolioOverview } from '@/components/portfolio-overview'
import { SummaryBar } from '@/components/summary-bar'
import { UpcomingPayments } from '@/components/upcoming-payments'
import { CreateBillModal } from '@/components/bills/CreateBillModal'
import { AddInvestmentModal } from '@/components/AddInvestmentModal'
import { RebalanceWidget } from '@/components/RebalanceWidget'
import { PortfolioTimeline, DividendEvent } from '@/components/portfolio-timeline'
import {
  PortfolioCharts,
  AssetAllocationItem,
  MonthlyCashFlowItem,
} from '@/components/portfolio-charts'

import {
  getBillsByMonth,
  getHistoricalCashFlow,
  getGoals,
  Goal,
} from '@/app/actions/finance'
import { usePortfolio } from '@/context/PortfolioContext'
import { FinancialGoalsSection } from '@/components/goals/FinancialGoalsSection'
import { MonthSelector } from '@/components/month-selector' // 👈 Importação do componente

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

export default function Page() {
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [bills, setBills] = useState<any[]>([])
  const [historicalCashFlow, setHistoricalCashFlow] = useState<MonthlyCashFlowItem[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  const { assets, addAsset } = usePortfolio()

  const loadGoals = async () => {
    const goalsData = await getGoals()
    setGoals(goalsData || [])
  }

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        const month = currentDate.getMonth() + 1
        const year = currentDate.getFullYear()

        const [billsData, history, goalsData] = await Promise.all([
          getBillsByMonth(month, year),
          getHistoricalCashFlow(),
          getGoals(),
        ])

        setBills(billsData || [])
        setHistoricalCashFlow(
          history.map((h) => ({
            month: h.month,
            expense: h.expense,
            income: h.income,
          }))
        )
        setGoals(goalsData || [])
      } catch (error) {
        console.error('Erro ao buscar dados:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [currentDate])

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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8 sm:py-16">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/60 pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            Painel financeiro
          </h1>
          <p className="text-xs text-muted-foreground">
            Visão consolidada de contas, metas e investimentos
          </p>
        </div>

        {/* NAVEGAÇÃO DE MÊS E AÇÕES */}
        <div className="flex flex- flex-wrap items-center gap-5 justify-between w-full">
          <div>
            <MonthSelector currentDate={currentDate} onChangeDate={setCurrentDate} />
          </div>

          <div className="flex flex- flex-wrap items-center gap-3  ">
            <Link
              href="/carteira"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600/10 px-3.5 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-600 hover:text-white border border-emerald-500/20 transition-all cursor-pointer"
            >
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Minha Carteira</span>
            </Link>
            <AddInvestmentModal onAddInvestment={handleAddInvestment} />
            <CreateBillModal />
          </div>
        </div>
      </header>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500 animate-pulse">
          Carregando informações do mês...
        </div>
      ) : (
        <>
          <SummaryBar bills={bills} />

          <section className="pt-2">
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

          <FinancialGoalsSection goals={goals} onRefresh={loadGoals} />

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.55fr_1fr]">
            <UpcomingPayments
              bills={bills}
              onStatusChange={() => {
                const month = currentDate.getMonth() + 1
                const year = currentDate.getFullYear()
                getBillsByMonth(month, year).then(setBills)
              }}
            />

            <PortfolioOverview investments={mappedInvestments} />
          </div>

          <PortfolioCharts
            allocationData={realAllocationData}
            cashFlowData={realCashFlowData}
          />

          <section className="pt-4">
            <RebalanceWidget assets={fiiAssetsForRebalance} />
          </section>
        </>
      )}
    </main>
  )
}