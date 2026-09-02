'use client'

import { useState, useMemo } from 'react'
import {
  TrendingUp,
  RefreshCw,
  Flame,
  ChevronRight,
  BarChart3,
  Settings2,
  PieChart,
  Zap
} from 'lucide-react'
import { motion } from 'framer-motion'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Asset } from './PortfolioManager'

interface FutureProjectionSimulatorProps {
  assets: Asset[]
}

type AllocationStrategy = 'proportional' | 'equal'

export function FutureProjectionSimulator({ assets }: FutureProjectionSimulatorProps) {
  const [monthlyContribution, setMonthlyContribution] = useState<number>(840)
  const [years, setYears] = useState<number>(1)
  const [dividendGrowthRate, setDividendGrowthRate] = useState<number>(3.5)
  const [reinvestDividends, setReinvestDividends] = useState<boolean>(true)
  const [allocationStrategy, setAllocationStrategy] = useState<AllocationStrategy>('proportional')

  const portfolioBase = useMemo(() => {
    let totalValue = 0
    let monthlyDividends = 0

    const assetDetails = assets.map((asset) => {
      const val = (asset.quantity || 0) * (asset.price || 0)
      const div = asset.lastDividend ?? ((asset.price || 0) * ((asset.dividendYield || 0) / 100 / 12))
      const totalAssetDiv = (asset.quantity || 0) * div

      totalValue += val
      monthlyDividends += totalAssetDiv

      return {
        ...asset,
        value: val,
        unitDividend: div,
        shareOfPortfolio: 0,
      }
    })

    const processedAssets = assetDetails.map((a) => {
      let weight = 0
      if (allocationStrategy === 'proportional') {
        weight = totalValue > 0 ? a.value / totalValue : 1 / (assets.length || 1)
      } else {
        weight = 1 / (assets.length || 1)
      }

      return {
        ...a,
        shareOfPortfolio: weight,
      }
    })

    const averageMonthlyYieldPercent = totalValue > 0 ? (monthlyDividends / totalValue) : 0.008

    return {
      totalValue,
      monthlyDividends,
      averageMonthlyYieldPercent,
      processedAssets,
    }
  }, [assets, allocationStrategy])

  const simulation = useMemo(() => {
    const totalMonths = years * 12
    // Taxa de crescimento mensal equivalente ao % a.a.
    const monthlyRate = Math.pow(1 + dividendGrowthRate / 100, 1 / 12) - 1

    // Copia as quantidades iniciais de cotas
    let currentQuantities: Record<string, number> = {}
    portfolioBase.processedAssets.forEach((a) => {
      currentQuantities[a.ticker] = a.quantity || 0
    })

    let accumulatedOutofPocket = portfolioBase.totalValue
    let totalDividendsReceivedInPeriod = 0
    let snowballMonth: number | null = null

    const monthlyTimeline = []

    // Ponto de partida (Mês 0)
    monthlyTimeline.push({
      monthName: 'Início',
      Patrimônio: Math.round(portfolioBase.totalValue),
      Aportado: Math.round(portfolioBase.totalValue),
      RendaMensal: Math.round(portfolioBase.monthlyDividends),
    })

    for (let month = 1; month <= totalMonths; month++) {
      // Fator de crescimento acumulado no mês atual (ex: inflação/reajuste)
      const growthFactor = Math.pow(1 + monthlyRate, month)

      // 1. Calcula dividendos recebidos no mês das cotas acumuladas até o mês anterior
      let currentMonthDividend = 0
      portfolioBase.processedAssets.forEach((a) => {
        const adjustedDiv = a.unitDividend * growthFactor
        const qty = currentQuantities[a.ticker] || 0
        currentMonthDividend += qty * adjustedDiv
      })

      if (!snowballMonth && currentMonthDividend >= monthlyContribution && monthlyContribution > 0) {
        snowballMonth = month
      }

      totalDividendsReceivedInPeriod += currentMonthDividend

      // 2. Total de caixa para comprar novas cotas este mês
      const availableCash = monthlyContribution + (reinvestDividends ? currentMonthDividend : 0)

      // 3. Compra de novas cotas
      portfolioBase.processedAssets.forEach((a) => {
        const currentPrice = a.price * growthFactor
        if (currentPrice > 0) {
          const allocationForThisAsset = availableCash * a.shareOfPortfolio
          const newSharesBought = allocationForThisAsset / currentPrice
          currentQuantities[a.ticker] = (currentQuantities[a.ticker] || 0) + newSharesBought
        }
      })

      accumulatedOutofPocket += monthlyContribution

      // 4. Patrimônio total ao final do mês
      let currentPortfolioMarketValue = 0
      portfolioBase.processedAssets.forEach((a) => {
        const qty = currentQuantities[a.ticker] || 0
        const currentPrice = a.price * growthFactor
        currentPortfolioMarketValue += qty * currentPrice
      })

      // Grava no histórico do gráfico
      if (month === 1 || month % (years > 3 ? 6 : 1) === 0 || month === totalMonths) {
        monthlyTimeline.push({
          monthName: `Mês ${month}`,
          Patrimônio: Math.round(currentPortfolioMarketValue),
          Aportado: Math.round(accumulatedOutofPocket),
          RendaMensal: Math.round(currentMonthDividend),
        })
      }
    }

    const finalGrowth = Math.pow(1 + monthlyRate, totalMonths)
    let finalMarketValue = 0
    let finalEstimatedMonthlyDividend = 0

    portfolioBase.processedAssets.forEach((a) => {
      const finalQty = currentQuantities[a.ticker] || 0
      const adjustedPrice = a.price * finalGrowth
      const adjustedDiv = a.unitDividend * finalGrowth

      finalMarketValue += finalQty * adjustedPrice
      finalEstimatedMonthlyDividend += finalQty * adjustedDiv
    })

    return {
      finalMarketValue,
      totalInvestedOutofPocket: accumulatedOutofPocket,
      totalDividendsReceivedInPeriod,
      finalEstimatedMonthlyDividend,
      monthlyTimeline,
      finalQuantities: currentQuantities,
      snowballMonth,
      finalGrowth,
    }
  }, [portfolioBase, years, monthlyContribution, dividendGrowthRate, reinvestDividends])

  if (assets.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
        <BarChart3 className="h-8 w-8 text-slate-600 animate-pulse" />
        <p className="font-medium text-slate-400">Nenhum ativo encontrado</p>
        <p className="text-slate-500">Adicione ativos à sua carteira para habilitar a simulação detalhada por fundos.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-4 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Simulador Detalhado por Fundos
            </h3>
            <p className="text-xs text-slate-400">
              Projeção com compra mensal de cotas dos seus {assets.length} ativos atuais
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAllocationStrategy(s => s === 'proportional' ? 'equal' : 'proportional')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-300 hover:text-white hover:border-slate-700 transition-all cursor-pointer"
            title="Estratégia de distribuição dos novos aportes"
          >
            <PieChart className="h-3.5 w-3.5 text-slate-400" />
            <span>Aporte: {allocationStrategy === 'proportional' ? 'Proporcional' : 'Igualitário'}</span>
          </button>

          <button
            onClick={() => setReinvestDividends(!reinvestDividends)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
              reinvestDividends
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reinvestDividends ? 'animate-spin-slow' : ''}`} />
            {reinvestDividends ? 'Reinvestimento Ativado' : 'Apenas Aportes'}
          </button>
        </div>
      </div>

      {/* Controles do Simulador */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800/80">
        {/* Aporte Mensal */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Aporte Mensal</span>
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md">
              <span className="text-xs text-slate-500">R$</span>
              <input
                type="number"
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(Math.max(0, Number(e.target.value)))}
                className="w-16 bg-transparent text-right font-bold text-emerald-400 outline-none text-xs"
              />
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="10000"
            step="100"
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(Number(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer"
          />
        </div>

        {/* Horizonte de Tempo */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Horizonte</span>
            <span className="text-emerald-400 font-bold">{years} {years === 1 ? 'Ano' : 'Anos'}</span>
          </div>
          <div className="flex gap-1.5">
            {[1, 3, 5, 10, 15, 20].map((y) => (
              <button
                key={y}
                onClick={() => setYears(y)}
                className={`flex-1 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  years === y
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm shadow-emerald-500/20'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
                }`}
              >
                {y}a
              </button>
            ))}
          </div>
        </div>

        {/* Growth/Inflação */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Settings2 className="h-3.5 w-3.5 text-slate-500" /> Reajuste de Dividendos
            </span>
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md">
              <input
                type="number"
                step="0.5"
                value={dividendGrowthRate}
                onChange={(e) => setDividendGrowthRate(Number(e.target.value))}
                className="w-10 bg-transparent text-right font-bold text-emerald-400 outline-none text-xs"
              />
              <span className="text-xs text-slate-500">% a.a.</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="12"
            step="0.5"
            value={dividendGrowthRate}
            onChange={(e) => setDividendGrowthRate(Number(e.target.value))}
            className="w-full accent-emerald-500 cursor-pointer"
          />
        </div>
      </div>

      {/* Grid de Métricas Futuras */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium">Patrimônio Futuro</span>
          <p className="text-lg font-bold text-emerald-400 mt-0.5">
            R$ {simulation.finalMarketValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </p>
          <span className="text-[10px] text-slate-500 block truncate">
            Investido do bolso: R$ {simulation.totalInvestedOutofPocket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </span>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium">Total em Dividendos</span>
          <p className="text-lg font-bold text-teal-300 mt-0.5">
            + R$ {simulation.totalDividendsReceivedInPeriod.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </p>
          <span className="text-[10px] text-slate-500 block truncate">
            {reinvestDividends ? '100% Reinvestidos na compra de cotas' : 'Acumulados / Gastos fora'}
          </span>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium">Renda Mensal ({years} {years === 1 ? 'ano' : 'anos'})</span>
          <p className="text-lg font-bold text-amber-400 mt-0.5">
            ~ R$ {simulation.finalEstimatedMonthlyDividend.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/mês
          </p>
          <span className="text-[10px] text-slate-500 block truncate">
            Passivo recorrente gerado na carteira
          </span>
        </div>

        {/* Efeito Bola de Neve */}
        <div className="bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Efeito Bola de Neve</span>
            <Zap className="h-3.5 w-3.5 text-amber-400" />
          </span>
          {simulation.snowballMonth ? (
            <>
              <p className="text-lg font-bold text-sky-400 mt-0.5">
                {simulation.snowballMonth}º mês
              </p>
              <span className="text-[10px] text-slate-500 block truncate">
                Renda passiva &gt; Aporte do bolso
              </span>
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-slate-400 mt-0.5">
                {(portfolioBase.averageMonthlyYieldPercent * 100).toFixed(2)}% <span className="text-xs font-normal text-slate-500">/mês</span>
              </p>
              <span className="text-[10px] text-slate-500 block truncate">
                Yield médio mensal projetado
              </span>
            </>
          )}
        </div>
      </div>

      {/* Gráfico de Crescimento */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <BarChart3 className="h-4 w-4 text-emerald-400" />
            <span>Curva de Crescimento Patrimonial vs Aportes</span>
          </div>
        </div>

        <div className="h-64 w-full bg-slate-950/50 border border-slate-800/80 rounded-xl p-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={simulation.monthlyTimeline}>
              <defs>
                <linearGradient id="colorPatrimonio" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAportado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="monthName" stroke="#64748b" fontSize={10} tickLine={false} />
              <YAxis
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#fff',
                }}
                formatter={(val) => [`R$ ${Number(val ?? 0).toLocaleString('pt-BR')}`, '']}
              />
              <Legend verticalAlign="top" height={36} formatter={(val) => <span className="text-xs text-slate-300">{val}</span>} />
              <Area type="monotone" dataKey="Patrimônio" stroke="#10b981" fillOpacity={1} fill="url(#colorPatrimonio)" strokeWidth={2} />
              <Area type="monotone" dataKey="Aportado" stroke="#3b82f6" fillOpacity={1} fill="url(#colorAportado)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quantidade de Cotas por Ativo */}
      <div className="pt-2 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Flame className="h-4 w-4 text-amber-400" />
            <span>Projeção de Cotas & Renda por Ativo ({years} {years === 1 ? 'Ano' : 'Anos'})</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {portfolioBase.processedAssets.map((asset) => {
            const initialQty = asset.quantity || 0
            const projectedQty = simulation.finalQuantities[asset.ticker] || initialQty
            const addedQty = projectedQty - initialQty

            const projectedAssetMonthlyDiv = projectedQty * (asset.unitDividend * simulation.finalGrowth)

            return (
              <div
                key={asset.ticker}
                className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 hover:border-slate-700 transition-colors flex flex-col justify-between space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-sm font-bold text-white font-mono">{asset.ticker}</span>
                    <p className="text-[10px] text-slate-400 truncate max-w-[140px]">{asset.name}</p>
                  </div>
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-medium">
                    +{Math.round(addedQty)} cotas
                  </span>
                </div>

                <div className="bg-slate-900/60 rounded-lg p-2 flex justify-between items-center text-xs">
                  <span className="text-[11px] text-slate-400">Renda Passiva Futura</span>
                  <span className="font-bold text-amber-400">
                    R$ {projectedAssetMonthlyDiv.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/mês
                  </span>
                </div>

                <div className="flex justify-between items-end border-t border-slate-800/80 pt-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Cotas Atuais</span>
                    <span className="font-semibold text-slate-300">{initialQty}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-600 mb-0.5" />
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">Cotas Projetadas</span>
                    <span className="font-bold text-emerald-400">{Math.round(projectedQty)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}