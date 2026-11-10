'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Calendar, CheckCircle2, PlusCircle, Target, Trash2, X } from 'lucide-react'
import { addFundsToGoal, deleteGoal, type Goal } from '@/app/actions/finance'
import { useQuickAdd } from '@/components/quick-add-provider'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/modal'
import { MoneyInput } from '@/components/ui/money-input'
import { useToast } from '@/components/ui/toast'
import { todayInBrazil } from '@/lib/finance-insights'
import { formatBRL, formatDate, formatPercent, plural } from '@/lib/format'
import { GOAL_CATEGORIES, normalizeGoalCategory } from '@/lib/goal-categories'
import { refreshGamification } from '@/components/gamification-data'

const SAVE_FAILED = 'Não foi possível salvar. Verifique a conexão e tente de novo.'
const DELETE_FAILED = 'Não foi possível excluir a meta. Verifique a conexão e tente de novo.'

interface FinancialGoalsSectionProps {
  goals: Goal[]
  onRefresh?: () => void
  /** Mostra só a meta mais próxima e o link para /metas. */
  compact?: boolean
}

function amountsOf(goal: Goal) {
  const current = Number(goal.current_amount || 0)
  const target = Number(goal.target_amount || 0)
  return { current, target, isCompleted: target > 0 && current >= target }
}

// Arredonda para baixo: 99,96% não pode aparecer como 100,0% com a meta ainda em aberto.
function progressOf(current: number, target: number) {
  if (target <= 0) return 0
  return Math.min(100, Math.floor((current / target) * 1000) / 10)
}

/** A do prazo mais curto ainda válido; sem prazo, a que tem mais progresso. */
function pickNearestGoal(goals: Goal[], today: string): Goal | null {
  const pending = goals.filter((goal) => !amountsOf(goal).isCompleted)
  if (pending.length === 0) return goals[0] ?? null

  const withDeadline = pending
    .filter((goal) => goal.deadline && goal.deadline.slice(0, 10) >= today)
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
  if (withDeadline.length > 0) return withDeadline[0]

  const progress = (goal: Goal) => {
    const { current, target } = amountsOf(goal)
    return target > 0 ? current / target : 0
  }
  return pending.reduce((best, goal) => (progress(goal) > progress(best) ? goal : best))
}

function GoalItem({
  goal,
  onChanged,
  onRequestDelete,
}: {
  goal: Goal
  onChanged: () => void
  /** Sem esta prop a lixeira não aparece: a versão compacta não exclui. */
  onRequestDelete?: (goal: Goal) => void
}) {
  const { toast } = useToast()
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const { current, target, isCompleted } = amountsOf(goal)
  const remaining = Math.max(0, target - current)
  const percentage = isCompleted ? 100 : progressOf(current, target)
  const categoryId = normalizeGoalCategory(goal.category)
  const category = GOAL_CATEGORIES.find((item) => item.id === categoryId)

  const contribution = Number(goal.monthly_contribution || 0)
  let estimate = 'Sem aporte previsto'
  if (isCompleted) {
    estimate = 'Meta alcançada!'
  } else if (contribution > 0) {
    const months = Math.ceil(remaining / contribution)
    estimate = `~${plural(months, 'mês restante', 'meses restantes')}`
  }

  const handleAdd = async () => {
    if (loading || amount == null || amount <= 0) return
    setLoading(true)
    try {
      const result = await addFundsToGoal(goal.id, amount)
      if (!result.success) {
        toast({ message: result.error, kind: 'error' })
        return
      }
      setAdding(false)
      setAmount(null)
      toast({ message: 'Aporte registrado.', kind: 'success' })
      refreshGamification()
      onChanged()
    } catch {
      toast({ message: SAVE_FAILED, kind: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-200">
            <span className="min-w-0 break-words">{goal.title}</span>
            {isCompleted && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />}
          </h3>
          <span className="text-xs text-slate-400">{category?.label}</span>
        </div>
        {onRequestDelete && (
          <button
            type="button"
            onClick={() => onRequestDelete(goal)}
            className="-mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-rose-400"
            aria-label={`Excluir meta ${goal.title}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm font-semibold text-emerald-400">{formatBRL(current)}</span>
        <span className="text-xs text-slate-400">meta: {formatBRL(target)}</span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isCompleted ? 'bg-emerald-400' : 'bg-emerald-500'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-slate-400">
        <span>Falta: {formatBRL(remaining)}</span>
        <span className="font-semibold text-slate-300">{formatPercent(percentage)}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" aria-hidden="true" />
          {goal.deadline ? `Prazo: ${formatDate(goal.deadline.slice(0, 10), { withYear: true })}` : 'Estimativa:'}
        </span>
        <span className="font-medium text-slate-300">{estimate}</span>
      </div>

      {!isCompleted &&
        (adding ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="min-w-32 flex-1">
              <MoneyInput
                aria-label={`Valor do aporte em ${goal.title}`}
                value={amount}
                disabled={loading}
                onValueChange={setAmount}
              />
            </div>
            <Button
              onClick={handleAdd}
              disabled={loading || amount == null}
              aria-busy={loading}
              aria-label={`Confirmar aporte em ${goal.title}`}
            >
              OK
            </Button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setAmount(null)
              }}
              disabled={loading}
              aria-label={`Cancelar aporte em ${goal.title}`}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label={`Adicionar aporte em ${goal.title}`}
            className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-slate-800/60 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-emerald-400"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Adicionar aporte
          </button>
        ))}
    </div>
  )
}

export function FinancialGoalsSection({ goals, onRefresh, compact = false }: FinancialGoalsSectionProps) {
  const { toast } = useToast()
  const { open: openQuickAdd, notifyDataChanged } = useQuickAdd()

  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const refresh = onRefresh ?? notifyDataChanged

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const result = await deleteGoal(deleteTarget.id)
      setDeleteOpen(false)
      if (!result.success) {
        toast({ message: result.error, kind: 'error' })
        return
      }
      toast({ message: 'Meta excluída.', kind: 'success' })
      refresh()
    } catch {
      setDeleteOpen(false)
      toast({ message: DELETE_FAILED, kind: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  if (goals.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="Nenhuma meta ainda"
        description="Defina um objetivo e acompanhe quanto já guardou."
        actionLabel="Criar meta"
        onAction={() => openQuickAdd('goal')}
      />
    )
  }

  if (compact) {
    const nearest = pickNearestGoal(goals, todayInBrazil())
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-100">Meta mais próxima</h2>
          <Link
            href="/metas"
            className="-mr-2 inline-flex h-11 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-emerald-400 hover:text-emerald-300"
          >
            Ver metas
          </Link>
        </div>
        {nearest && <GoalItem key={nearest.id} goal={nearest} onChanged={refresh} />}
      </div>
    )
  }

  const totalTarget = goals.reduce((acc, goal) => acc + amountsOf(goal).target, 0)
  const totalCurrent = goals.reduce((acc, goal) => acc + amountsOf(goal).current, 0)
  // O excedente de uma meta não pode contar como progresso de outra.
  const totalCounted = goals.reduce((acc, goal) => {
    const { current, target } = amountsOf(goal)
    return acc + Math.min(current, target)
  }, 0)

  return (
    // A tela inicial já envolve esta seção em um cartão: outra borda e margem só tirariam espaço.
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-3 border-b border-slate-800/60 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <Target className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="min-w-0 text-base font-semibold text-slate-100">Metas financeiras</h2>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col items-start">
            <span className="text-xs font-medium text-slate-400">
              Progresso total: {formatPercent(progressOf(totalCounted, totalTarget))}
            </span>
            <span className="break-words text-sm font-semibold text-emerald-400">
              {formatBRL(totalCurrent)} de {formatBRL(totalTarget)}
            </span>
          </div>

          <Button variant="secondary" onClick={() => openQuickAdd('goal')}>
            Nova meta
          </Button>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-slate-800/60">
        {goals.map((goal) => (
          <GoalItem
            key={goal.id}
            goal={goal}
            onChanged={refresh}
            onRequestDelete={(target) => {
              setDeleteTarget(target)
              setDeleteOpen(true)
            }}
          />
        ))}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Excluir ${deleteTarget?.title ?? 'meta'}?`}
        description="A meta e o valor registrado nela serão removidos. Seu dinheiro real não é afetado."
        confirmLabel="Excluir meta"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}
