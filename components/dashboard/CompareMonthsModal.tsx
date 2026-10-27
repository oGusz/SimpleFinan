'use client'

import { useState } from 'react'
import { getMonthlySummary } from '@/app/actions/finance'
import { ArrowUpRight, ArrowDownRight, GitCompare, X } from 'lucide-react'

export function CompareMonthsModal() {
    const [isOpen, setIsOpen] = useState(false)
    const currentDate = new Date()
    const [m1, setM1] = useState({ month: currentDate.getMonth() || 12, year: currentDate.getMonth() === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear() })
    const [m2, setM2] = useState({ month: currentDate.getMonth() + 1, year: currentDate.getFullYear() })
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(false)

    const handleCompare = async () => {
        setLoading(true)
        const [res1, res2] = await Promise.all([
            getMonthlySummary(m1.month, m1.year),
            getMonthlySummary(m2.month, m2.year),
        ])

        const total1 = res1?.total || 0
        const total2 = res2?.total || 0
        const diff = total2 - total1
        const diffPercent = total1 > 0 ? ((diff / total1) * 100).toFixed(1) : '0'

        setData({ res1, res2, total1, total2, diff, diffPercent })
        setLoading(false)
    }

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
            >
                <GitCompare className="h-3.5 w-3.5" />
                Comparar Períodos
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl text-slate-100">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                            <h3 className="text-base font-semibold">Comparar Balanço Mensal</h3>
                            <button onClick={() => setIsOpen(false)} className="cursor-pointer text-slate-400 hover:text-white">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Mês Base A</label>
                                <input
                                    type="month"
                                    value={`${m1.year}-${String(m1.month).padStart(2, '0')}`}
                                    onChange={(e) => {
                                        const [y, m] = e.target.value.split('-')
                                        setM1({ year: Number(y), month: Number(m) })
                                    }}
                                    className="w-full rounded bg-slate-950 border border-slate-800 p-2 text-xs"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-400 mb-1">Mês Comparado B</label>
                                <input
                                    type="month"
                                    value={`${m2.year}-${String(m2.month).padStart(2, '0')}`}
                                    onChange={(e) => {
                                        const [y, m] = e.target.value.split('-')
                                        setM2({ year: Number(y), month: Number(m) })
                                    }}
                                    className="w-full rounded bg-slate-950 border border-slate-800 p-2 text-xs"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleCompare}
                            disabled={loading}
                            className="mt-4 w-full cursor-pointer rounded bg-emerald-600 py-2 text-xs font-medium hover:bg-emerald-500 transition-colors"
                        >
                            {loading ? 'Calculando...' : 'Gerar Comparativo'}
                        </button>

                        {data && (
                            <div className="mt-6 space-y-4 pt-4 border-t border-slate-800">
                                <div className="grid grid-cols-2 gap-4 text-center">
                                    <div className="rounded bg-slate-950 p-3">
                                        <p className="text-[10px] text-slate-400 uppercase">Mês A</p>
                                        <p className="text-sm font-semibold mt-1">
                                            R$ {data.total1.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                    <div className="rounded bg-slate-950 p-3">
                                        <p className="text-[10px] text-slate-400 uppercase">Mês B</p>
                                        <p className="text-sm font-semibold mt-1">
                                            R$ {data.total2.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between rounded bg-slate-950/60 p-3 border border-slate-800">
                                    <span className="text-xs text-slate-400">Variação de despesas:</span>
                                    <div className={`flex items-center gap-1 text-xs font-medium ${data.diff > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {data.diff > 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                                        {data.diffPercent}% (R$ {Math.abs(data.diff).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
