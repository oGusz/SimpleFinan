'use client'

import { useState, useMemo } from 'react'
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  PieChart,
  Filter,
  Coins,
  Sliders,
  DollarSign,
  Percent
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

// Lógica dinâmica de distribuição por estratégia
function calculateRebalance(
  assets: FIIAsset[],
  aporteTotal: number,
  strategy: StrategyType
): RebalanceRecommendation[] {
  const portfolioTotalValue = assets.reduce((acc, a) => acc + (a.quantity || 0) * (a.price || 0), 0)
  const nextTotalValue = portfolioTotalValue + aporteTotal
  const defaultTarget = Number((100 / (assets.length || 1)).toFixed(2))

  // 1. Calcula o peso/score de cada ativo baseado na estratégia escolhida
  const scoredAssets = assets.map((asset) => {
    const currentValue = (asset.quantity || 0) * (asset.price || 0)
    const currentPercent = portfolioTotalValue > 0 ? (currentValue / portfolioTotalValue) * 100 : 0
    const targetPercent = asset.targetPercent ?? defaultTarget

    let score = 0

    if (strategy === 'DEFICIT') {
      const targetValueInNextPortfolio = (targetPercent / 100) * nextTotalValue
      score = Math.max(0, targetValueInNextPortfolio - currentValue)
    } else if (strategy === 'YIELD') {
      // Prioriza maiores Dividend Yields
      score = asset.dividendYield || 0
    } else if (strategy === 'PVP_DISCOUNT') {
      // Quanto menor o P/VP, maior a pontuação (inverso do P/VP)
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

  // 2. Distribuição proporcional baseada no score do ativo
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

  // 3. Monta lista final
  return rawAllocations.map((item) => {
    const finalQty = item.asset.quantity + item.qtyToBuy
    const finalValue = finalQty * item.asset.price
    const newPercent = nextTotalValue > 0 ? (finalValue / nextTotalValue) * 100 : 0

    let pvpAlert: string | undefined = undefined
    if (item.asset.pvp && item.asset.pvp > 1.12) {
      pvpAlert = `P/VP de ${item.asset.pvp.toFixed(2)} está acima de 1.12 (ágio alto)`
    } else if (item.asset.pvp && item.asset.pvp < 0.88) {
      pvpAlert = `P/VP de ${item.asset.pvp.toFixed(2)} (desconto atrativo)`
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
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 md:p-6 shadow-2xl space-y-6"
    >
      {/* HEADER & CONTROLE DE APORTE */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <RefreshCw className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Sugestão de Rebalanceamento Inteligente
            </h3>
          </div>
          <p className="text-xs text-slate-400 pl-1">
            Calcula a compra ideal de cotas inteiras sem vendas, adaptando-se à estratégia selecionada.
          </p>
        </div>

        {/* Bloco do Aporte */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium pl-1 flex items-center gap-1">
              <Coins className="h-4 w-4 text-emerald-400" /> Aporte Novo:
            </span>
            <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1">
              <span className="text-xs font-semibold text-slate-500 mr-1">R$</span>
              <input
                type="number"
                value={aporte}
                onChange={(e) => setAporte(Math.max(0, Number(e.target.value)))}
                className="w-24 bg-transparent font-bold text-sm text-emerald-400 outline-none"
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Atalhos Rápidos */}
          <div className="flex items-center gap-1 border-t sm:border-t-0 sm:border-l border-slate-800 pt-2 sm:pt-0 sm:pl-3">
            {[500, 1000, 2000, 5000].map((val) => (
              <button
                key={val}
                onClick={() => setAporte(val)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  aporte === val
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                +{(val / 1000).toFixed(val < 1000 ? 1 : 0)}k
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* GRID DE RESUMO & IMPACTO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total a Investir */}
        <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-medium">Total Alocado em Cotas</span>
          <p className="text-lg font-bold text-emerald-400 mt-0.5">
            R$ {totalSugerido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-500 block">
            {((totalSugerido / (aporte || 1)) * 100).toFixed(0)}% do aporte utilizado
          </span>
        </div>

        {/* Sobra do Aporte */}
        <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-medium">Troco / Caixa Residual</span>
          <p className="text-lg font-bold text-slate-300 mt-0.5">
            R$ {sobraAporte.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-500 block">
            Acumulado em caixa para próximo aporte
          </span>
        </div>

        {/* Nova Renda Passiva Estimada */}
        <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
            <span>Renda Nova Gerada</span>
            <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
          </span>
          <p className="text-lg font-bold text-amber-400 mt-0.5">
            + R$ {newMonthlyIncomeEstimate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="text-xs font-normal text-slate-400">/mês</span>
          </p>
          <span className="text-[10px] text-slate-500 block truncate">
            Projeção imediata de dividendo mensal
          </span>
        </div>

        {/* Estratégia Aplicada Selecionável */}
        <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 flex flex-col justify-between">
          <div>
            <span className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
              <span>Estratégia Aplicada</span>
              <Sliders className="h-3.5 w-3.5 text-teal-400" />
            </span>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as StrategyType)}
              className="mt-1 w-full bg-slate-900 border border-slate-700 text-teal-300 font-semibold text-xs rounded-lg p-1.5 focus:outline-none focus:border-teal-500 cursor-pointer"
            >
              {Object.entries(STRATEGIES).map(([key, item]) => (
                <option key={key} value={key} className="bg-slate-900 text-white">
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <span className="text-[10px] text-slate-500 block mt-1 truncate" title={STRATEGIES[strategy].description}>
            {STRATEGIES[strategy].description}
          </span>
        </div>
      </div>

      {/* CONTROLES DA TABELA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Detalhamento de Ordens de Compra
          </span>
        </div>

        <button
          onClick={() => setOnlyRecommendations(!onlyRecommendations)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
            onlyRecommendations
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          {onlyRecommendations ? 'Exibindo apenas recomendações' : 'Exibir todos os ativos'}
        </button>
      </div>

      {/* TABELA DE RECOMENDAÇÕES REESTRUTURADA */}
      <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/50">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Ativo / P/VP</th>
              <th className="py-3 px-4 min-w-[160px]">Alocação (Atual → Meta)</th>
              <th className="py-3 px-4 text-center">Ação Sugerida</th>
              <th className="py-3 px-4 text-right">Valor da Ordem</th>
              <th className="py-3 px-4 text-right">Nova Renda/mês</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {filteredRecommendations.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  Nenhum ativo necessita de aporte com este valor atual.
                </td>
              </tr>
            ) : (
              filteredRecommendations.map((rec) => {
                const hasBuyOrder = rec.suggestedQuantityToBuy > 0

                return (
                  <tr
                    key={rec.ticker}
                    className={`transition-colors ${
                      hasBuyOrder ? 'hover:bg-emerald-950/10' : 'hover:bg-slate-800/20 opacity-70'
                    }`}
                  >
                    {/* Ticker / Nome / P/VP */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-sm">{rec.ticker}</span>

                        {/* Tag de Alerta/PVP */}
                        {rec.pvpAlert && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                              rec.pvp && rec.pvp > 1.12
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                            title={rec.pvpAlert}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            P/VP {rec.pvp?.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate max-w-[160px]">{rec.name}</p>
                    </td>

                    {/* Barra de Progresso de Alocação */}
                    <td className="py-3 px-4">
                      <div className="flex justify-between text-[11px] font-mono mb-1">
                        <span className="text-slate-400">{rec.currentPercent.toFixed(1)}%</span>
                        <span className="text-slate-500">
                          Meta: {Number(rec.targetPercent).toFixed(2)}%
                        </span>
                      </div>

                      {/* Visual Bar */}
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          className="bg-sky-500 transition-all duration-300"
                          style={{ width: `${Math.min(100, rec.currentPercent)}%` }}
                          title={`Atual: ${rec.currentPercent.toFixed(1)}%`}
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
                            title={`Aporte projeta +${(rec.newPercentAfterAporte - rec.currentPercent).toFixed(1)}%`}
                          />
                        )}
                      </div>
                    </td>

                    {/* Quantidade a comprar */}
                    <td className="py-3 px-4 text-center">
                      {hasBuyOrder ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-lg text-xs font-bold">
                          Comprar {rec.suggestedQuantityToBuy} cotas
                        </span>
                      ) : (
                        <span className="text-slate-500 font-mono text-xs">Aguardar</span>
                      )}
                    </td>

                    {/* Valor do Aporte */}
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {hasBuyOrder ? (
                        <span className="text-white">
                          R$ {rec.suggestedInvestment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-600">R$ 0,00</span>
                      )}
                    </td>

                    {/* Nova Renda Passiva Gerada */}
                    <td className="py-3 px-4 text-right font-mono">
                      {hasBuyOrder ? (
                        <span className="text-amber-400 font-medium">
                          + R$ {rec.additionalMonthlyIncome?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}