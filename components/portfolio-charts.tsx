'use client'

import { useMemo, useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'
import {
  PieChart as PieChartIcon,
  BarChart3,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
} from 'lucide-react'

// Tipos de dados
export interface AssetAllocationItem {
  category: 'Papel' | 'Tijolo' | 'Fiagro' | 'Ações' | 'Tesouro Direto' | string
  amount: number
}

export interface MonthlyCashFlowItem {
  month: string
  income: number
  expense: number
}

interface PortfolioChartsProps {
  allocationData?: AssetAllocationItem[]
  cashFlowData?: MonthlyCashFlowItem[]
}

// Cores temáticas para cada tipo de ativo
const CATEGORY_COLORS: Record<string, string> = {
  Papel: '#3b82f6', // blue-500
  Tijolo: '#10b981', // emerald-500
  Fiagro: '#8b5cf6', // violet-500
  Ações: '#f59e0b', // amber-500
  'Tesouro Direto': '#06b6d4', // cyan-500
}

const DEFAULT_COLOR = '#64748b' // slate-500

// Mock de dados padrão para fallback/demonstração
const DEFAULT_ALLOCATION: AssetAllocationItem[] = [
  { category: 'Papel', amount: 45000 },
  { category: 'Tijolo', amount: 65000 },
  { category: 'Fiagro', amount: 20000 },
  { category: 'Ações', amount: 35000 },
  { category: 'Tesouro Direto', amount: 25000 },
]

const DEFAULT_CASHFLOW: MonthlyCashFlowItem[] = [
  { month: 'Mai', income: 1200, expense: 800 },
  { month: 'Jun', income: 1350, expense: 950 },
  { month: 'Jul', income: 1100, expense: 700 },
  { month: 'Ago', income: 1600, expense: 1100 },
  { month: 'Set', income: 1450, expense: 850 },
  { month: 'Out', income: 1800, expense: 900 },
]

export function PortfolioCharts({
  allocationData = DEFAULT_ALLOCATION,
  cashFlowData = DEFAULT_CASHFLOW,
}: PortfolioChartsProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  // Cálculo de totais
  const totalPatrimony = useMemo(() => {
    return allocationData.reduce((acc, curr) => acc + curr.amount, 0)
  }, [allocationData])

  const formattedAllocation = useMemo(() => {
    return allocationData.map((item) => ({
      ...item,
      percentage: totalPatrimony > 0 ? (item.amount / totalPatrimony) * 100 : 0,
      color: CATEGORY_COLORS[item.category] || DEFAULT_COLOR,
    }))
  }, [allocationData, totalPatrimony])

  // Custom Tooltip para o gráfico de Donut
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 shadow-xl text-xs">
          <p className="font-semibold text-white flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: data.color }}
            />
            {data.category}
          </p>
          <p className="mt-1 text-slate-300">
            {data.amount.toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })}
          </p>
          <p className="text-[10px] font-medium text-slate-400 mt-0.5">
            {data.percentage.toFixed(1)}% do patrimônio
          </p>
        </div>
      )
    }
    return null
  }

  // Custom Tooltip para o gráfico de Fluxo de Caixa
  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const income = payload.find((p: any) => p.dataKey === 'income')?.value || 0
      const expense = payload.find((p: any) => p.dataKey === 'expense')?.value || 0
      const net = income - expense

      return (
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 shadow-xl text-xs space-y-1.5">
          <p className="font-bold text-white border-b border-slate-800 pb-1">{label}</p>
          <p className="text-emerald-400 flex items-center justify-between gap-4">
            <span>Proventos:</span>
            <span className="font-semibold">
              {income.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </p>
          <p className="text-rose-400 flex items-center justify-between gap-4">
            <span>Contas:</span>
            <span className="font-semibold">
              {expense.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </p>
          <p
            className={`flex items-center justify-between gap-4 pt-1 border-t border-slate-800 font-bold ${
              net >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            <span>Saldo Liquido:</span>
            <span>
              {net.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <section className="space-y-6 my-8">
      {/* Título da Seção */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <PieChartIcon className="h-5 w-5 text-indigo-400" />
            Visão Geral e Fluxo de Caixa
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Divisão patrimonial consolidada e evolução de entradas x saídas.
          </p>
        </div>
      </div>

      {/* Container Principal dos Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        
        {/* Gráfico 1: Alocação de Ativos (Donut Chart) */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/50 p-5 flex flex-col justify-between w-auto">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Wallet className="h-4 w-4 text-emerald-400" />
              Alocação Patrimonial
            </h3>
            <span className="text-xs font-medium text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              Total: {totalPatrimony.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </div>

          <div className="relative h-64 my-2 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={formattedAllocation}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={4}
                  dataKey="amount"
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                >
                  {formattedAllocation.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke="#020617"
                      strokeWidth={2}
                      className="transition-all duration-300 hover:opacity-80"
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>

            {/* Texto Central do Donut Chart */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none w-auto">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                {activeIndex !== null ? formattedAllocation[activeIndex].category : 'Categorias'}
              </span>
              <span className="text-sm font-bold text-white mt-0.5">
                {activeIndex !== null
                  ? `${formattedAllocation[activeIndex].percentage.toFixed(1)}%`
                  : `${formattedAllocation.length} Ativos`}
              </span>
            </div>
          </div>

          {/* Legenda Customizada em Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3 border-t border-slate-800/80 text-xs">
            {formattedAllocation.map((item, idx) => (
              <div
                key={item.category}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseLeave={() => setActiveIndex(null)}
                className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-colors ${
                  activeIndex === idx ? 'bg-slate-800/80' : 'hover:bg-slate-800/40'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-slate-300 font-medium truncate leading-tight">
                    {item.category}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {item.percentage.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gráfico 2: Fluxo de Caixa (Barras de Proventos vs Contas) */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900/50 p-5 flex flex-col justify-between w-auto">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-indigo-400" />
                Fluxo de Caixa Mensal
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Comparativo entre Proventos Recebidos vs. Contas Fixas
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <ArrowUpRight className="h-3.5 w-3.5" /> Entradas
              </span>
              <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                <ArrowDownRight className="h-3.5 w-3.5" /> Saídas
              </span>
            </div>
          </div>

          <div className="h-72 my-2 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={cashFlowData}
                margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
                barGap={6}
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
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `R$${val}`}
                />
                <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
                <Bar
                  dataKey="income"
                  name="Proventos"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="expense"
                  name="Contas"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Dica do Rodapé do Fluxo */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              Média mensal de sobra líquida em alta
            </span>
            <span className="text-[11px] font-mono text-slate-400">Últimos 6 meses</span>
          </div>
        </div>

      </div>
    </section>
  )
}