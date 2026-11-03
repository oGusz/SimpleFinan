'use client'

import { useState } from 'react'
import { Target, Calendar, PlusCircle, Trash2, CheckCircle2 } from 'lucide-react'
import { Goal, addFundsToGoal, deleteGoal } from '@/app/actions/finance'
import { CreateGoalModal } from './CreateGoalModal'

interface FinancialGoalsSectionProps {
  goals: Goal[]
  onRefresh?: () => void
}

export function FinancialGoalsSection({ goals, onRefresh }: FinancialGoalsSectionProps) {
  const [quickAddId, setQuickAddId] = useState<string | null>(null)
  const [quickAmount, setQuickAmount] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)

  const handleAddContribution = async (goalId: string) => {
    if (!quickAmount || parseFloat(quickAmount) <= 0) return
    setLoading(true)
    try {
      await addFundsToGoal(goalId, parseFloat(quickAmount))
      setQuickAddId(null)
      setQuickAmount('')
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error(err)
      alert('Erro ao realizar aporte.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (goalId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta meta?')) return
    try {
      await deleteGoal(goalId)
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error(err)
    }
  }

  // Estatísticas gerais
  const totalTarget = goals.reduce((acc, g) => acc + Number(g.target_amount || 0), 0)
  const totalCurrent = goals.reduce((acc, g) => acc + Number(g.current_amount || 0), 0)
  const overallPercentage = totalTarget > 0 ? Math.min(100, (totalCurrent / totalTarget) * 100) : 0

  return (
    // A tela inicial já envolve esta seção em um cartão: outra borda e margem só tirariam espaço.
    <div className="flex min-w-0 flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 border-b border-slate-800/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Target className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-100">Metas Financeiras</h2>
            <p className="text-xs text-slate-400">
              Acompanhamento de objetivos e tempo estimado com base nos aportes
            </p>
          </div>
        </div>

        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col items-start">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">
              Progresso Total ({overallPercentage.toFixed(1)}%)
            </span>
            <span className="text-xs font-semibold text-emerald-400 break-words">
              {formatCurrency(totalCurrent)} / {formatCurrency(totalTarget)}
            </span>
          </div>

          <div className="shrink-0">
            <CreateGoalModal onSuccess={onRefresh} />
          </div>
        </div>
      </div>

      {/* Lista de Cards de Metas */}
      {goals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 border border-dashed border-slate-800 rounded-lg text-slate-500 text-xs gap-2">
          <Target className="h-8 w-8 text-slate-600 stroke-1" />
          <p>Nenhuma meta cadastrada ainda.</p>
        </div>
      ) : (
        // Uma coluna em qualquer tela: a largura da tela inicial é limitada, mesmo no computador.
        <div className="grid grid-cols-1 gap-3">
          {goals.map((goal) => {
            const current = Number(goal.current_amount || 0)
            const target = Number(goal.target_amount || 1)
            const remaining = Math.max(0, target - current)
            const percentage = Math.min(100, (current / target) * 100)
            const isCompleted = current >= target

            // Cálculo dos meses faltantes
            const contribution = Number(goal.monthly_contribution || 0)
            let monthsLeftText = 'Sem aporte definido'
            if (isCompleted) {
              monthsLeftText = 'Meta alcançada!'
            } else if (contribution > 0) {
              const months = Math.ceil(remaining / contribution)
              monthsLeftText = `~${months} ${months === 1 ? 'mês' : 'meses'} restantes`
            }

            return (
              <div
                key={goal.id}
                className="relative flex min-w-0 flex-col justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700"
              >
                <div>
                  {/* Topo do Card: Categoria e Ações */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="rounded-md bg-slate-800/80 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                      {goal.category || 'Geral'}
                    </span>
                    <button
                      onClick={() => handleDelete(goal.id)}
                      className="-m-2 flex h-9 w-9 shrink-0 items-center justify-center text-slate-500 hover:text-rose-400 transition-colors"
                      title="Excluir meta"
                      aria-label={`Excluir meta ${goal.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Título e Valores */}
                  <h3 className="text-sm font-medium text-slate-200 mb-1 flex items-center gap-1.5 min-w-0">
                    <span className="min-w-0 break-words">{goal.title}</span>
                    {isCompleted && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
                  </h3>

                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 mt-3 mb-1">
                    <span className="text-xs font-semibold text-emerald-400">
                      {formatCurrency(current)}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      meta: {formatCurrency(target)}
                    </span>
                  </div>

                  {/* Barra de Progresso com Tailwind */}
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden mb-2">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${isCompleted ? 'bg-emerald-400' : 'bg-emerald-500'
                        }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap justify-between items-center gap-x-3 text-[11px] text-slate-400 mb-3">
                    <span>Falta: {formatCurrency(remaining)}</span>
                    <span className="font-semibold text-slate-300">{percentage.toFixed(1)}%</span>
                  </div>
                </div>

                {/* Rodapé do Card: Estimativa e Botão de Aporte Rápido */}
                <div className="border-t border-slate-800/60 pt-3 mt-2 flex flex-col gap-2 text-[11px] text-slate-400">
                  <div className="flex flex-wrap items-center justify-between gap-x-3">
                    <span className="flex items-center gap-1 text-slate-500">
                      <Calendar className="h-3 w-3" />
                      Estimativa:
                    </span>
                    <span className="font-medium text-slate-300">{monthsLeftText}</span>
                  </div>

                  {/* Input de Aporte Rápido */}
                  {quickAddId === goal.id ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      {/* text-base evita o zoom automático do iPhone ao tocar no campo. */}
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="R$ Valor"
                        aria-label="Valor do aporte"
                        value={quickAmount}
                        onChange={(e) => setQuickAmount(e.target.value)}
                        className="h-10 min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 text-base text-slate-200 select-text focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={() => handleAddContribution(goal.id)}
                        disabled={loading}
                        className="h-10 shrink-0 rounded bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        OK
                      </button>
                      <button
                        onClick={() => setQuickAddId(null)}
                        aria-label="Cancelar aporte"
                        className="h-10 w-10 shrink-0 rounded bg-slate-800 text-xs text-slate-400 hover:text-slate-200"
                      >
                        X
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setQuickAddId(goal.id)}
                      className="mt-1 flex h-10 items-center justify-center gap-1 rounded bg-slate-800/60 text-slate-300 hover:bg-slate-800 hover:text-emerald-400 transition-colors"
                    >
                      <PlusCircle className="h-3 w-3" />
                      <span>Adicionar Aporte</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}