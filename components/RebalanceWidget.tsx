'use client'

import { useState, useMemo } from 'react'
import {
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  PieChart,
  Filter,
  Coins,
  Sliders,
  ArrowRight,
} from 'lucide-react'
import { motion } from 'framer-motion'

export interface FIIAsset {
  ticker: string
  name: string
  quantity: number
  price: number
  pvp?: number
  dividendYield?: number
  targetPercent?: number
  sector?: string
}

export interface RebalanceRecommendation {
  ticker: string
  name: string
  price: number
  pvp?: number
  dividendYield?: number
  currentQuantity: number
  currentPercent: number
  targetPercent: number
  suggestedQuantityToBuy: number
  suggestedInvestment: number
  newPercentAfterAporte: number
  pvpAlert?: string
  additionalMonthlyIncome?: number
}

export type StrategyType = 'DEFICIT' | 'YIELD' | 'PVP_DISCOUNT'

const STRATEGIES: Record<StrategyType, { name: string; description: string }> = {
  DEFICIT: {
    name: 'Rebalanceamento por Meta',
    description: 'Prioriza ativos que estão mais abaixo da porcentagem alvo ideal.',
  },
  YIELD: {
    name: 'Foco em Dividend Yield',
    description: 'Prioriza ativos com maior retorno de proventos (DY) para maximizar renda.',
  },
  PVP_DISCOUNT: {
    name: 'Foco em Desconto (Menor P/VP)',
    description: 'Prioriza os ativos mais descontados em relação ao seu valor patrimonial.',
  },
}

function calculateRebalance(
  assets: FIIAsset[],
  aporteTotal: number,
  strategy: StrategyType
): RebalanceRecommendation[] {
  const portfolioTotalValue = assets.reduce((acc, a) => acc + (a.quantity || 0) * (a.price || 0), 0)
  const nextTotalValue = portfolioTotalValue + aporteTotal
  const defaultTarget = Number((100 / (assets.length || 1)).toFixed(2))

  const scoredAssets = assets.map((asset) => {
    const currentValue = (asset.quantity || 0) * (asset.price || 0)
    const currentPercent = portfolioTotalValue > 0 ? (currentValue / portfolioTotalValue) * 100 : 0
    const targetPercent = asset.targetPercent ?? defaultTarget

    let score = 0

    if (strategy === 'DEFICIT') {
      const targetValueInNextPortfolio = (targetPercent / 100) * nextTotalValue
      score = Math.max(0, targetValueInNextPortfolio - currentValue)
    } else if (strategy === 'YIELD') {
      score = asset.dividendYield || 0
    } else if (strategy === 'PVP_DISCOUNT') {
      const pvp = asset.pvp || 1
      score = pvp > 0 ? 1 / pvp : 0
    }

    return {
      asset,
      currentValue,
      currentPercent,
      targetPercent,
      score,
    }
  })

  const totalScore = scoredAssets.reduce((acc, d) => acc + d.score, 0)
  let remainingAporte = aporteTotal

  const rawAllocations = scoredAssets.map((item) => {
    let allocatedCash = 0
    if (totalScore > 0 && item.score > 0) {
      allocatedCash = Math.min(remainingAporte, (item.score / totalScore) * aporteTotal)
    }

    const price = item.asset.price || 1
    const qtyToBuy = Math.floor(allocatedCash / price)
    const actualInvestment = qtyToBuy * price

    return {
      ...item,
      qtyToBuy,
      actualInvestment,
    }
  })

  return rawAllocations.map((item) => {
    const finalQty = item.asset.quantity + item.qtyToBuy
    const finalValue = finalQty * item.asset.price
    const newPercent = nextTotalValue > 0 ? (finalValue / nextTotalValue) * 100 : 0

    let pvpAlert: string | undefined = undefined
    if (item.asset.pvp && item.asset.pvp > 1.12) {
      pvpAlert = `P/VP ${item.asset.pvp.toFixed(2)} (ágio)`
    } else if (item.asset.pvp && item.asset.pvp < 0.88) {
      pvpAlert = `P/VP ${item.asset.pvp.toFixed(2)} (desconto)`
    }

    const dyMonthly = (item.asset.dividendYield || 10) / 100 / 12
    const additionalMonthlyIncome = item.actualInvestment * dyMonthly

    return {
      ticker: item.asset.ticker,
      name: item.asset.name,
      price: item.asset.price,
      pvp: item.asset.pvp,
      dividendYield: item.asset.dividendYield,
      currentQuantity: item.asset.quantity,
      currentPercent: item.currentPercent,
      targetPercent: item.targetPercent,
      suggestedQuantityToBuy: item.qtyToBuy,
      suggestedInvestment: item.actualInvestment,
      newPercentAfterAporte: newPercent,
      pvpAlert,
      additionalMonthlyIncome,
    }
  })
}

interface RebalanceWidgetProps {
  assets: FIIAsset[]
}

export function RebalanceWidget({ assets }: RebalanceWidgetProps) {
  const [aporte, setAporte] = useState<number>(1000)
  const [strategy, setStrategy] = useState<StrategyType>('DEFICIT')
  const [onlyRecommendations, setOnlyRecommendations] = useState<boolean>(false)

  const recommendations = useMemo(() => {
    return calculateRebalance(assets, aporte, strategy)
  }, [assets, aporte, strategy])

  const totalSugerido = useMemo(() => {
    return recommendations.reduce((acc, item) => acc + item.suggestedInvestment, 0)
  }, [recommendations])

  const newMonthlyIncomeEstimate = useMemo(() => {
    return recommendations.reduce((acc, item) => acc + (item.additionalMonthlyIncome || 0), 0)
  }, [recommendations])

  const sobraAporte = Math.max(0, aporte - totalSugerido)

  const filteredRecommendations = useMemo(() => {
    if (onlyRecommendations) {
      return recommendations.filter((r) => r.suggestedQuantityToBuy > 0)
    }
    return recommendations
  }, [recommendations, onlyRecommendations])

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4 sm:p-5 shadow-sm backdrop-blur-sm space-y-4 select-none w-full max-w-full overflow-hidden"
    >
      {/* 1. CABEÇALHO COM TÍTULO E SUBTÍTULO */}
      <div className="flex flex-col gap-1 pb-3 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <RefreshCw className="h-4 w-4" />
          </div>
          <h3 className="text-base font-bold text-white tracking-tight">
            Rebalanceamento Inteligente
          </h3>
        </div>
        <p className="text-[11px] text-slate-400">
          Sugestão de compra de cotas inteiras sem necessidade de venda.
        </p>
      </div>

      {/* 2. BLOCO DE DEFINIÇÃO DO APORTE (DESIGN ADAPTÁVEL) */}
      <div className="flex flex-col gap-2.5 bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs text-slate-400 font-medium flex items-center gap-1.5 shrink-0">
            <Coins className="h-4 w-4 text-emerald-400" />
            <span>Valor do Aporte:</span>
          </label>

          <div className="flex items-center bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-xl">
            <span className="text-xs font-semibold text-slate-500 mr-1.5">R$</span>
            <input
              type="number"
              inputMode="numeric"
              value={aporte || ''}
              onChange={(e) => setAporte(Math.max(0, Number(e.target.value)))}
              className="w-20 bg-transparent text-right font-bold text-xs text-emerald-400 outline-none"
              placeholder="0"
            />
          </div>
        </div>

        {/* Atalhos de Valor */}
        <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-slate-900">
          {[500, 1000, 2000, 5000].map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => setAporte(val)}
              className={`py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-all ${
                aporte === val
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 active:bg-slate-800'
              }`}
            >
              +{(val / 1000).toFixed(val < 1000 ? 1 : 0)}k
            </button>
          ))}
        </div>
      </div>

      {/* 3. RESUMO DO APORTE (GRADE 2x2 COMPACTA) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-1 sm:gap-3">
        <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Total Alocado</span>
          <p className="text-base sm:text-lg font-bold text-emerald-400 mt-1 truncate">
            R$ {totalSugerido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[9px] sm:text-[10px] text-slate-500 truncate mt-0.5">
            {((totalSugerido / (aporte || 1)) * 100).toFixed(0)}% utilizado
          </span>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 flex flex-col justify-between">
          <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Caixa Residual</span>
          <p className="text-base sm:text-lg font-bold text-slate-300 mt-1 truncate">
            R$ {sobraAporte.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[9px] sm:text-[10px] text-slate-500 truncate mt-0.5">
            troco restante
          </span>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Nova Renda</span>
            <TrendingUp className="h-3 w-3 text-amber-400" />
          </div>
          <p className="text-base sm:text-lg font-bold text-amber-400 mt-1 truncate">
            + R$ {newMonthlyIncomeEstimate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[9px] sm:text-[10px] text-slate-500 truncate mt-0.5">
            dividendo mensal extra
          </span>
        </div>

        <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">Estratégia</span>
            <Sliders className="h-3 w-3 text-teal-400" />
          </div>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as StrategyType)}
            className="mt-1 w-full bg-slate-900 border border-slate-800 text-teal-300 font-semibold text-xs rounded-lg p-1 outline-none"
          >
            {Object.entries(STRATEGIES).map(([key, item]) => (
              <option key={key} value={key} className="bg-slate-950 text-white">
                {item.name}
              </option>
            ))}
          </select>
          <span className="text-[9px] text-slate-500 truncate mt-0.5" title={STRATEGIES[strategy].description}>
            {STRATEGIES[strategy].description}
          </span>
        </div>
      </div>

      {/* 4. BARRA DE FILTRO */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider px-1">
          <PieChart className="h-3.5 w-3.5 text-emerald-400" />
          <span>Ordens Sugeridas</span>
        </div>

        <button
          type="button"
          onClick={() => setOnlyRecommendations(!onlyRecommendations)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold border active:scale-95 transition-all ${
            onlyRecommendations
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Filter className="h-3 w-3" />
          <span>{onlyRecommendations ? 'Apenas compras' : 'Todos'}</span>
        </button>
      </div>

      {/* 5. LISTA DE ORDENS VERTICAL (CARDS AO INVÉS DE TABELA) */}
      <div className="flex flex-col gap-2.5">
        {filteredRecommendations.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 rounded-2xl border border-slate-800/80 bg-slate-950/40">
            Nenhum ativo necessita de aporte com este valor.
          </div>
        ) : (
          filteredRecommendations.map((rec) => {
            const hasBuyOrder = rec.suggestedQuantityToBuy > 0

            return (
              <div
                key={rec.ticker}
                className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-2.5 ${
                  hasBuyOrder
                    ? 'bg-slate-950/70 border-emerald-500/30 shadow-sm'
                    : 'bg-slate-950/40 border-slate-800/60 opacity-60'
                }`}
              >
                {/* Linha 1: Identificação + Ordem Sugerida */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono text-sm text-white">
                      {rec.ticker}
                    </span>

                    {rec.pvpAlert && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                          rec.pvp && rec.pvp > 1.12
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        P/VP {rec.pvp?.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Badge de Ação */}
                  {hasBuyOrder ? (
                    <span className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 rounded-full text-xs font-bold">
                      +{rec.suggestedQuantityToBuy} cotas
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500 font-medium">
                      Aguardar
                    </span>
                  )}
                </div>

                {/* Linha 2: Barra de Alocação (Atual vs Projetada vs Meta) */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <span>Atual: {rec.currentPercent.toFixed(1)}%</span>
                      {hasBuyOrder && (
                        <>
                          <ArrowRight className="h-2.5 w-2.5 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">{rec.newPercentAfterAporte.toFixed(1)}%</span>
                        </>
                      )}
                    </span>
                    <span className="text-slate-500">
                      Meta: {Number(rec.targetPercent).toFixed(1)}%
                    </span>
                  </div>

                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden flex">
                    <div
                      className="bg-sky-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, rec.currentPercent)}%` }}
                    />
                    {hasBuyOrder && (
                      <div
                        className="bg-emerald-400 transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100 - rec.currentPercent,
                            rec.newPercentAfterAporte - rec.currentPercent
                          )}%`,
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Linha 3: Valores Financeiros Empilhados */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Total da Ordem</span>
                    <span className="font-bold text-white">
                      R$ {rec.suggestedInvestment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">Rendimento Estimado</span>
                    <span className={hasBuyOrder ? 'font-bold text-amber-400' : 'text-slate-500'}>
                      {hasBuyOrder
                        ? `+ R$ ${rec.additionalMonthlyIncome?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </motion.div>
  )
}