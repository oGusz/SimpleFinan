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
} from 'recharts'
import { BarChart3, Minus, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { CATEGORY_COLORS, type AssetCategory } from '@/lib/asset-classification'
import { cashFlowTrend, lastMonths, todayInBrazil } from '@/lib/finance-insights'
import { formatBRL, formatBRLCompact, formatPercent, plural } from '@/lib/format'

export interface AssetAllocationItem {
  category: string
  amount: number
}

export interface MonthlyCashFlowItem {
  month: string
  year: number
  monthNum: number
  income: number
  expense: number
}

interface PortfolioChartsProps {
  allocationData?: AssetAllocationItem[]
  cashFlowData?: MonthlyCashFlowItem[]
  mode: 'manual' | 'open_finance'
}

const DEFAULT_COLOR = '#64748b'
const AXIS_COLOR = '#94a3b8'
// Com o emerald-500 ao lado do vermelho, as barras se confundem para quem não distingue verde e vermelho.
const INCOME_COLOR = '#06a5a0'
const EXPENSE_COLOR = '#f43f5e'
const CARD_CLASS = 'flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4'

const TREND = {
  up: { text: 'em alta', icon: TrendingUp },
  down: { text: 'em queda', icon: TrendingDown },
  stable: { text: 'estável', icon: Minus },
} as const

/** O rótulo sai dos meses realmente exibidos: no início do extrato, pode haver menos de seis. */
export function cashFlowPeriodLabel(months: { month: string; year: number }[]) {
  if (months.length === 0) return ''
  const first = months[0]
  const last = months[months.length - 1]
  if (first.year !== last.year) return `${first.month}/${first.year} a ${last.month}/${last.year}`
  if (months.length === 1) return `${first.month} de ${first.year}`
  return `${first.month} a ${last.month} de ${last.year}`
}

interface AllocationTooltipProps {
  active?: boolean
  payload?: readonly { payload?: { category: string; amount: number; percentage: number; color: string } }[]
}

function AllocationTooltip({ active, payload }: AllocationTooltipProps) {
  const data = payload?.[0]?.payload
  if (!active || !data) return null

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs shadow-xl">
      <p className="flex items-center gap-2 font-semibold text-white">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: data.color }} aria-hidden="true" />
        {data.category}
      </p>
      <p className="mt-1 text-slate-300">{formatBRL(data.amount)}</p>
      <p className="mt-0.5 text-slate-400">{formatPercent(data.percentage)} do patrimônio</p>
    </div>
  )
}

interface CashFlowTooltipProps {
  active?: boolean
  label?: string | number
  payload?: readonly { dataKey?: unknown; value?: unknown }[]
  manual: boolean
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-4 text-slate-300">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        {label}
      </span>
      <span className="font-semibold text-slate-100">{value}</span>
    </p>
  )
}

function CashFlowTooltip({ active, label, payload, manual }: CashFlowTooltipProps) {
  if (!active || !payload?.length) return null

  const valueOf = (key: string) => Number(payload.find((item) => item.dataKey === key)?.value ?? 0)
  const income = valueOf('income')
  const expense = valueOf('expense')

  return (
    <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs shadow-xl">
      <p className="border-b border-slate-800 pb-1 font-bold text-white">{label}</p>
      {manual ? (
        <TooltipRow color={EXPENSE_COLOR} label="Contas" value={formatBRL(expense)} />
      ) : (
        <>
          <TooltipRow color={INCOME_COLOR} label="Entradas" value={formatBRL(income)} />
          <TooltipRow color={EXPENSE_COLOR} label="Saídas" value={formatBRL(expense)} />
          <p className="flex items-center justify-between gap-4 border-t border-slate-800 pt-1 font-bold text-slate-100">
            <span>Saldo líquido</span>
            <span>{formatBRL(income - expense)}</span>
          </p>
        </>
      )}
    </div>
  )
}

function AllocationCard({ data }: { data: AssetAllocationItem[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const total = useMemo(() => data.reduce((sum, item) => sum + item.amount, 0), [data])
  const items = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        percentage: total > 0 ? (item.amount / total) * 100 : 0,
        color: CATEGORY_COLORS[item.category as AssetCategory] ?? DEFAULT_COLOR,
      })),
    [data, total],
  )

  const active = activeIndex === null ? undefined : items[activeIndex]
  const toggle = (index: number) => setActiveIndex((current) => (current === index ? null : index))

  return (
    <section className={CARD_CLASS} aria-labelledby="alocacao-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="alocacao-titulo" className="flex items-center gap-2 text-sm font-semibold text-white">
          <Wallet className="size-4 text-emerald-400" aria-hidden="true" />
          Alocação por categoria
        </h2>
        <span className="text-xs text-slate-400">Total: {formatBRL(total)}</span>
      </div>

      <div className="relative h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={90}
              paddingAngle={items.length > 1 ? 2 : 0}
              dataKey="amount"
              nameKey="category"
              isAnimationActive={false}
              onClick={(_, index) => toggle(index)}
            >
              {items.map((item, index) => (
                <Cell
                  key={item.category}
                  fill={item.color}
                  stroke="#020617"
                  strokeWidth={2}
                  opacity={active && activeIndex !== index ? 0.35 : 1}
                />
              ))}
            </Pie>
            <Tooltip content={<AllocationTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-20 text-center">
          {active ? (
            <>
              <span className="text-xs text-slate-400">{active.category}</span>
              <span className="mt-0.5 text-sm font-bold text-white">{formatPercent(active.percentage)}</span>
            </>
          ) : (
            <span className="text-sm font-bold text-white">{plural(items.length, 'categoria', 'categorias')}</span>
          )}
        </div>
      </div>

      {/* Botões, e não hover: no celular é o toque que destaca a categoria. */}
      <ul className="grid grid-cols-1 gap-1 border-t border-slate-800/80 pt-3 sm:grid-cols-2">
        {items.map((item, index) => (
          <li key={item.category}>
            <button
              type="button"
              aria-pressed={activeIndex === index}
              onClick={() => toggle(index)}
              className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors ${
                activeIndex === index ? 'bg-slate-800' : 'hover:bg-slate-800/50'
              }`}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-medium text-slate-200">{item.category}</span>
              <span className="shrink-0 text-slate-400">{formatBRL(item.amount)}</span>
              <span className="w-12 shrink-0 text-right text-slate-300">{formatPercent(item.percentage)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CashFlowCard({ history, mode }: { history: MonthlyCashFlowItem[]; mode: 'manual' | 'open_finance' }) {
  const manual = mode === 'manual'
  const today = todayInBrazil()

  // O histórico completo fica para a tendência; o gráfico mostra só os meses até o atual.
  const months = useMemo(() => lastMonths(history, today, 6), [history, today])
  const twoYears = months.length > 0 && months[0].year !== months[months.length - 1].year
  const chartData = useMemo(
    () =>
      months.map((item) => ({
        ...item,
        label: twoYears ? `${item.month}/${String(item.year).slice(2)}` : item.month,
      })),
    [months, twoYears],
  )

  // Sem cadastro de renda, o modo manual não tem sobra para avaliar.
  const trend = manual ? null : cashFlowTrend(history, today)
  const TrendIcon = trend ? TREND[trend].icon : null
  const title = manual ? 'Contas por mês' : 'Entradas e saídas por mês'
  const period = cashFlowPeriodLabel(months)

  return (
    <section className={CARD_CLASS} aria-labelledby="fluxo-titulo">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="fluxo-titulo" className="flex items-center gap-2 text-sm font-semibold text-white">
            <BarChart3 className="size-4 text-emerald-400" aria-hidden="true" />
            {title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">{period}</p>
        </div>

        {!manual && (
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: INCOME_COLOR }} aria-hidden="true" />
              Entradas
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: EXPENSE_COLOR }} aria-hidden="true" />
              Saídas
            </span>
          </div>
        )}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="label" stroke={AXIS_COLOR} fontSize={12} tickLine={false} axisLine={false} />
            <YAxis
              stroke={AXIS_COLOR}
              fontSize={12}
              width={68}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatBRLCompact(value)}
            />
            <Tooltip content={<CashFlowTooltip manual={manual} />} cursor={{ fill: 'rgba(255, 255, 255, 0.03)' }} />
            {!manual && (
              <Bar
                dataKey="income"
                name="Entradas"
                fill={INCOME_COLOR}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
            )}
            <Bar
              dataKey="expense"
              name={manual ? 'Contas' : 'Saídas'}
              fill={EXPENSE_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* A dica do gráfico depende de toque ou mouse: os valores também ficam legíveis por leitor de tela. */}
      <table className="sr-only">
        <caption>{`${title}: ${period}`}</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            {!manual && <th scope="col">Entradas</th>}
            <th scope="col">{manual ? 'Contas' : 'Saídas'}</th>
            {!manual && <th scope="col">Saldo líquido</th>}
          </tr>
        </thead>
        <tbody>
          {months.map((item) => (
            <tr key={`${item.year}-${item.monthNum}`}>
              <th scope="row">{`${item.month}/${item.year}`}</th>
              {!manual && <td>{formatBRL(item.income)}</td>}
              <td>{formatBRL(item.expense)}</td>
              {!manual && <td>{formatBRL(item.income - item.expense)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {trend && TrendIcon && (
        <p className="flex items-start gap-1.5 border-t border-slate-800/80 pt-3 text-xs text-slate-300">
          <TrendIcon className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          Sobra média dos últimos 3 meses fechados {TREND[trend].text}, comparada à dos 3 anteriores.
        </p>
      )}
    </section>
  )
}

/** A página decide quando montar este componente, para não baixar o recharts em conta sem dados. */
export function PortfolioCharts({ allocationData = [], cashFlowData = [], mode }: PortfolioChartsProps) {
  const today = todayInBrazil()
  const hasCashFlow = lastMonths(cashFlowData, today, 6).length > 0

  return (
    <div className="flex flex-col gap-4">
      {allocationData.length > 0 && <AllocationCard data={allocationData} />}
      {hasCashFlow && <CashFlowCard history={cashFlowData} mode={mode} />}
    </div>
  )
}
