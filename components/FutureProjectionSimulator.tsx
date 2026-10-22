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
  Zap,
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
    const monthlyRate = Math.pow(1 + dividendGrowthRate / 100, 1 / 12) - 1

    let currentQuantities: Record<string, number> = {}
    portfolioBase.processedAssets.forEach((a) => {
      currentQuantities[a.ticker] = a.quantity || 0
    })

    let accumulatedOutofPocket = portfolioBase.totalValue
    let totalDividendsReceivedInPeriod = 0
    let snowballMonth: number | null = null

    const monthlyTimeline = []

    monthlyTimeline.push({
      monthName: 'Início',
      Patrimônio: Math.round(portfolioBase.totalValue),
      Aportado: Math.round(portfolioBase.totalValue),
      RendaMensal: Math.round(portfolioBase.monthlyDividends),
    })

    for (let month = 1; month <= totalMonths; month++) {
      const growthFactor = Math.pow(1 + monthlyRate, month)

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
      const availableCash = monthlyContribution + (reinvestDividends ? currentMonthDividend : 0)

      portfolioBase.processedAssets.forEach((a) => {
        const currentPrice = a.price * growthFactor
        if (currentPrice > 0) {
          const allocationForThisAsset = availableCash * a.shareOfPortfolio
          const newSharesBought = allocationForThisAsset / currentPrice
          currentQuantities[a.ticker] = (currentQuantities[a.ticker] || 0) + newSharesBought
        }
      })

      accumulatedOutofPocket += monthlyContribution

      let currentPortfolioMarketValue = 0
      portfolioBase.processedAssets.forEach((a) => {
        const qty = currentQuantities[a.ticker] || 0
        const currentPrice = a.price * growthFactor
        currentPortfolioMarketValue += qty * currentPrice
      })

      if (month === 1 || month % (years > 3 ? 6 : 1) === 0 || month === totalMonths) {
        monthlyTimeline.push({
          monthName: `M${month}`,
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
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 text-center text-xs text-slate-500 flex flex-col items-center gap-2 backdrop-blur-sm">
        <BarChart3 className="h-8 w-8 text-slate-600 animate-pulse" />
        <p className="font-semibold text-slate-300">Nenhum ativo cadastrado</p>
        <p className="text-slate-500">Adicione ativos à carteira para projetar o crescimento dos rendimentos.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 sm:p-5 shadow-sm backdrop-blur-sm space-y-4 select-none w-full max-w-full overflow-hidden"
    >
      {/* 1. CABEÇALHO COM AÇÕES RÁPIDAS */}
      <div className="flex flex-col gap-3 pb-3 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white tracking-tight truncate">
              Simulador de Projeção
            </h3>
            <p className="text-[11px] text-slate-400 truncate">
              Compra mensal com seus {assets.length} ativos atuais
            </p>
          </div>
        </div>

        {/* Chaves de configuração rápidas (Segmented mobile) */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setAllocationStrategy((s) => (s === 'proportional' ? 'equal' : 'proportional'))}
            className="flex items-center justify-center gap-1.5 h-9 px-2 rounded-xl border border-slate-800 bg-slate-950/80 text-[11px] font-semibold text-slate-300 active:scale-95 transition-all truncate"
          >
            <PieChart className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{allocationStrategy === 'proportional' ? 'Proporcional' : 'Igualitário'}</span>
          </button>

          <button
            type="button"
            onClick={() => setReinvestDividends(!reinvestDividends)}
            className={`flex items-center justify-center gap-1.5 h-9 px-2 rounded-xl border text-[11px] font-semibold active:scale-95 transition-all truncate ${
              reinvestDividends
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-950/80 border-slate-800 text-slate-400'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${reinvestDividends ? 'animate-spin-slow' : ''}`} />
            <span className="truncate">{reinvestDividends ? 'Reinvestir: ON' : 'Reinvestir: OFF'}</span>
          </button>
        </div>
      </div>

      {/* 2. CONTROLES DO SIMULADOR (INSET GROUPED) */}
      <div className="flex flex-col gap-3.5 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800/80">
        {/* Aporte Mensal */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Aporte Mensal</span>
            <div className="flex items-center bg-slate-900 border border-slate-800 px-2 py-1 rounded-lg">
              <span className="text-xs text-slate-500 mr-1">R$</span>
              <input
                type="number"
                inputMode="numeric"
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(Math.max(0, Number(e.target.value)))}
                className="w-20 bg-transparent text-right font-bold text-emerald-400 outline-none text-xs"
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
            className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Horizonte em Pílulas (Touch-Friendly) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Prazo</span>
            <span className="text-emerald-400 font-bold">{years} {years === 1 ? 'Ano' : 'Anos'}</span>
          </div>
          <div className="grid grid-cols-6 gap-1">
            {[1, 3, 5, 10, 15, 20].map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYears(y)}
                className={`py-1.5 text-xs font-bold rounded-lg border active:scale-95 transition-all text-center ${
                  years === y
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-sm'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {y}a
              </button>
            ))}
          </div>
        </div>

        {/* Reajuste Anual */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Settings2 className="h-3.5 w-3.5 text-slate-500" /> Reajuste de Dividendos
            </span>
            <div className="flex items-center bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-lg text-xs">
              <input
                type="number"
                step="0.5"
                value={dividendGrowthRate}
                onChange={(e) => setDividendGrowthRate(Number(e.target.value))}
                className="w-10 bg-transparent text-right font-bold text-emerald-400 outline-none"
              />
              <span className="text-[11px] text-slate-500 ml-0.5">% a.a.</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="12"
            step="0.5"
            value={dividendGrowthRate}
            onChange={(e) => setDividendGrowthRate(Number(e.target.value))}
            className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      {/* 3. MÉTRICAS EM GRADE 2x2 (COMPACTO NO IPHONE) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-1 sm:gap-3">
        <div className="bg-slate-950/70 border border-slate-800/80 p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Patrimônio Futuro</span>
          <p className="text-base sm:text-lg font-bold text-emerald-400 mt-1 truncate">
            R$ {simulation.finalMarketValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </p>
          <span className="text-[9px] sm:text-[10px] text-slate-500 truncate mt-0.5">
            Bolso: R$ {simulation.totalInvestedOutofPocket.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Total em Dividendos</span>
          <p className="text-base sm:text-lg font-bold text-teal-300 mt-1 truncate">
            + R$ {simulation.totalDividendsReceivedInPeriod.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </p>
          <span className="text-[9px] sm:text-[10px] text-slate-500 truncate mt-0.5">
            {reinvestDividends ? '100% reinvestidos' : 'Sem reinvestimento'}
          </span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 p-3 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Renda Mensal ({years}a)</span>
          <p className="text-base sm:text-lg font-bold text-amber-400 mt-1 truncate">
            ~ R$ {simulation.finalEstimatedMonthlyDividend.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </p>
          <span className="text-[9px] sm:text-[10px] text-slate-500 truncate mt-0.5">
            renda mensal estimada
          </span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800/80 p-3 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Bola de Neve</span>
            <Zap className="h-3 w-3 text-sky-400" />
          </div>
          {simulation.snowballMonth ? (
            <>
              <p className="text-base sm:text-lg font-bold text-sky-400 mt-1 truncate">
                {simulation.snowballMonth}º mês
              </p>
              <span className="text-[9px] sm:text-[10px] text-slate-500 truncate mt-0.5">
                Renda passiva &gt; Aporte
              </span>
            </>
          ) : (
            <>
              <p className="text-base sm:text-lg font-bold text-slate-300 mt-1 truncate">
                {(portfolioBase.averageMonthlyYieldPercent * 100).toFixed(2)}%
              </p>
              <span className="text-[9px] sm:text-[10px] text-slate-500 truncate mt-0.5">
                Yield médio mensal
              </span>
            </>
          )}
        </div>
      </div>

      {/* 4. GRÁFICO DE CRESCIMENTO */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider px-1">
          <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
          <span>Curva Patrimonial</span>
        </div>

        <div className="h-56 sm:h-64 w-full bg-slate-950/70 border border-slate-800/80 rounded-2xl p-2.5">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={simulation.monthlyTimeline} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
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
              <XAxis dataKey="monthName" stroke="#64748b" fontSize={9} tickLine={false} />
              <YAxis
                stroke="#64748b"
                fontSize={9}
                tickLine={false}
                tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#020617',
                  borderColor: '#1e293b',
                  borderRadius: '12px',
                  fontSize: '11px',
                  color: '#fff',
                }}
                formatter={(val) => [`R$ ${Number(val ?? 0).toLocaleString('pt-BR')}`, '']}
              />
              <Legend verticalAlign="top" height={30} formatter={(val) => <span className="text-[11px] text-slate-300">{val}</span>} />
              <Area type="monotone" dataKey="Patrimônio" stroke="#10b981" fillOpacity={1} fill="url(#colorPatrimonio)" strokeWidth={2} />
              <Area type="monotone" dataKey="Aportado" stroke="#3b82f6" fillOpacity={1} fill="url(#colorAportado)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 5. CARDS DE COTAS PROJETADAS POR ATIVO */}
      <div className="space-y-2.5 pt-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider px-1">
          <Flame className="h-3.5 w-3.5 text-amber-400" />
          <span>Rendimento Projetado por Fundo</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {portfolioBase.processedAssets.map((asset) => {
            const initialQty = asset.quantity || 0
            const projectedQty = simulation.finalQuantities[asset.ticker] || initialQty
            const addedQty = projectedQty - initialQty
            const projectedAssetMonthlyDiv = projectedQty * (asset.unitDividend * simulation.finalGrowth)

            return (
              <div
                key={asset.ticker}
                className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 flex flex-col justify-between gap-2.5"
              >
                <div className="flex justify-between items-start">
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-white font-mono">{asset.ticker}</span>
                    <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{asset.name}</p>
                  </div>
                  <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
                    +{Math.round(addedQty)} cotas
                  </span>
                </div>

                <div className="bg-slate-900/60 rounded-xl p-2 flex justify-between items-center text-xs border border-slate-800/50">
                  <span className="text-[11px] text-slate-400">Renda Mensal</span>
                  <span className="font-bold text-amber-400">
                    R$ {projectedAssetMonthlyDiv.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}/mês
                  </span>
                </div>

                <div className="flex justify-between items-center border-t border-slate-800/80 pt-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Atual</span>
                    <span className="font-semibold text-slate-300">{initialQty}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-600" />
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">Projetado</span>
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