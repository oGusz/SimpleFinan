'use client'

import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Asset } from './PortfolioManager'
import { TrendingUp } from 'lucide-react'
import { motion } from 'framer-motion'

interface DividendProjectionChartProps {
  assets: Asset[]
}

export function DividendProjectionChart({ assets }: DividendProjectionChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const monthlyBaseIncome = useMemo(() => {
    return assets.reduce((acc, item) => {
      const dividend =
        item.lastDividend ??
        item.price * ((item.dividendYield || 10) / 100 / 12)
      return acc + item.quantity * dividend
    }, 0)
  }, [assets])

  const totalInvested = useMemo(() => {
    return assets.reduce((acc, item) => acc + item.quantity * item.price, 0)
  }, [assets])

  const averageMonthlyYield = useMemo(() => {
    if (totalInvested === 0) return 0.008
    return monthlyBaseIncome / totalInvested
  }, [monthlyBaseIncome, totalInvested])

  const projectionData = useMemo(() => {
    const months = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ]
    let currentInvested = totalInvested

    return months.map((month) => {
      const projectedMonthly = currentInvested * averageMonthlyYield
      currentInvested += projectedMonthly

      return {
        month,
        proventoMensal: Number(projectedMonthly.toFixed(2)),
      }
    })
  }, [totalInvested, averageMonthlyYield])

  if (assets.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl space-y-3"
    >
      {/* CABEÇALHO */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-none">
              Projeção de Dividendos (12 Meses)
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Efeito bola de neve reinvestindo proventos
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] uppercase font-semibold text-slate-400 block">
            Renda Estimada / Mês
          </span>
          <span className="text-sm font-extrabold text-emerald-400">
            R$ {monthlyBaseIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* ÁREA DO GRÁFICO */}
      <div className="h-48 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={projectionData}
            margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
            onMouseMove={(state) => {
              if (state && state.activeTooltipIndex !== undefined) {
                const tooltipIndex = Number(state.activeTooltipIndex)
                setActiveIndex(Number.isNaN(tooltipIndex) ? null : tooltipIndex)
              }
            }}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="month"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `R$${val}`}
            />

            {/* Tooltip ajustado (sem background cinza no hover e com texto visível) */}
            <Tooltip
              cursor={false}
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#334155',
                borderRadius: '8px',
                fontSize: '11px',
                color: '#f8fafc',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
              }}
              itemStyle={{
                color: '#34d399',
              }}
              labelStyle={{
                color: '#94a3b8',
                fontWeight: 'bold',
                marginBottom: '2px',
              }}
              formatter={(value: any) => [`R$ ${Number(value).toFixed(2)}`, 'Provento']}
            />

            {/* Renderiza as barras e altera a cor no hover */}
            <Bar
              dataKey="proventoMensal"
              radius={[4, 4, 0, 0]}
              isAnimationActive={true}
              animationDuration={1200}
              animationEasing="ease-out"
            >
              {projectionData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === activeIndex ? '#34d399' : '#10b981'}
                  className="transition-colors duration-200 cursor-pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  )
}