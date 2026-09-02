'use client'

import { useMemo, useState } from 'react'
import { PieChart as PieIcon } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { Asset } from './PortfolioManager'
import { motion } from 'framer-motion'

interface CategoryAllocationChartProps {
    assets: Asset[]
}

const CATEGORY_COLORS: Record<string, string> = {
    Tijolo: '#10b981',      // Emerald 500
    Papel: '#3b82f6',       // Blue 500
    Agronegócio: '#f59e0b', // Amber 500
    FOF: '#8b5cf6',         // Violet 500
    Outros: '#64748b',      // Slate 500
}

const CATEGORY_HOVER_COLORS: Record<string, string> = {
    Tijolo: '#34d399',
    Papel: '#60a5fa',
    Agronegócio: '#fbbf24',
    FOF: '#a78bfa',
    Outros: '#94a3b8',
}

function getAssetCategory(asset: Asset): string {
    const ticker = asset.ticker.toUpperCase().trim()

    const tickerMap: Record<string, string> = {
        RURA11: 'Agronegócio', VGIA11: 'Agronegócio', KNCA11: 'Agronegócio', FGAA11: 'Agronegócio', SNAG11: 'Agronegócio', EGAF11: 'Agronegócio',
        KFOF11: 'FOF', BCFF11: 'FOF', HFOF11: 'FOF', XPSF11: 'FOF', RBRF11: 'FOF', OUJP11: 'FOF',
        MXRF11: 'Papel', KNCR11: 'Papel', CPTS11: 'Papel', RECR11: 'Papel', HGCR11: 'Papel', KNSC11: 'Papel', IRDM11: 'Papel',
        HGLG11: 'Tijolo', XPLG11: 'Tijolo', VISC11: 'Tijolo', BTLG11: 'Tijolo', KNRI11: 'Tijolo', XPML11: 'Tijolo', HGRU11: 'Tijolo', PVBI11: 'Tijolo',
    }

    if (tickerMap[ticker]) return tickerMap[ticker]

    if (ticker.includes('AGRO') || ticker.includes('RURA') || ticker.includes('VGIA')) return 'Agronegócio'
    if (ticker.includes('FOF') || ticker.includes('FF')) return 'FOF'
    if (ticker.includes('CRI') || ticker.includes('RECR')) return 'Papel'

    return 'Tijolo'
}

/* Tooltip Customizado que exibe a lista dos tickers da categoria */
const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload
        return (
            <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-2 max-w-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-4">
                    <span className="font-bold text-white text-sm">{data.name}</span>
                    <span className="text-emerald-400 font-semibold">{data.percentage}%</span>
                </div>
                <p className="text-slate-300 font-medium">
                    R$ {data.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <div className="pt-1">
                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">
                        Fundos nesta categoria:
                    </p>
                    <div className="flex flex-wrap gap-1">
                        {data.tickers.map((ticker: string) => (
                            <span
                                key={ticker}
                                className="bg-slate-800 text-slate-200 border border-slate-700/80 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                            >
                                {ticker}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        )
    }
    return null
}

export function CategoryAllocationChart({ assets }: CategoryAllocationChartProps) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null)

    const allocationData = useMemo(() => {
        const categories: Record<string, { value: number; tickers: string[] }> = {
            Tijolo: { value: 0, tickers: [] },
            Papel: { value: 0, tickers: [] },
            Agronegócio: { value: 0, tickers: [] },
            FOF: { value: 0, tickers: [] },
        }

        let totalPortfolioValue = 0

        assets.forEach((asset) => {
            const value = asset.quantity * asset.price
            totalPortfolioValue += value

            const category = getAssetCategory(asset)
            const targetCategory = categories[category] ? category : 'Tijolo'

            categories[targetCategory].value += value
            if (!categories[targetCategory].tickers.includes(asset.ticker)) {
                categories[targetCategory].tickers.push(asset.ticker)
            }
        })

        if (totalPortfolioValue === 0) return []

        return Object.entries(categories)
            .filter(([_, data]) => data.value > 0)
            .map(([name, data]) => ({
                name,
                value: Number(data.value.toFixed(2)),
                tickers: data.tickers,
                percentage: Number(((data.value / totalPortfolioValue) * 100).toFixed(1)),
            }))
    }, [assets])

    if (assets.length === 0 || allocationData.length === 0) return null

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl space-y-3"
        >
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
                        <PieIcon className="h-4 w-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white leading-none">
                            Alocação por Categoria
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            Passe o mouse na fatia para ver os fundos pertencentes
                        </p>
                    </div>
                </div>
            </div>

            <div className="h-56 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Tooltip content={<CustomTooltip />} cursor={false} />
                        <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => (
                                <span className="text-xs text-slate-300 font-medium px-1">
                                    {value}
                                </span>
                            )}
                        />
                        <Pie
                            data={allocationData}
                            cx="50%"
                            cy="45%"
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={4}
                            dataKey="value"
                            isAnimationActive={true}
                            animationDuration={1000}
                            onMouseEnter={(_, index) => setActiveIndex(index)}
                            onMouseLeave={() => setActiveIndex(null)}
                        >
                            {allocationData.map((entry, index) => {
                                const isHovered = index === activeIndex
                                const baseColor = CATEGORY_COLORS[entry.name] || CATEGORY_COLORS.Outros
                                const hoverColor = CATEGORY_HOVER_COLORS[entry.name] || CATEGORY_HOVER_COLORS.Outros

                                return (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={isHovered ? hoverColor : baseColor}
                                        stroke="#0f172a"
                                        strokeWidth={2}
                                        className="transition-colors duration-200 cursor-pointer outline-none"
                                    />
                                )
                            })}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    )
}