'use client'

import { useId, useMemo, useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Coins,
  Plane,
  Plus,
  Shield,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react'
import { addFundsToGoal, deleteGoal, getGoals, type Goal } from '@/app/actions/finance'
import { SkeletonCards } from '@/components/page-skeleton'
import { useQuickAdd } from '@/components/quick-add-provider'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field } from '@/components/ui/field'
import { ConfirmDialog, Modal } from '@/components/ui/modal'
import { MoneyInput } from '@/components/ui/money-input'
import { useToast } from '@/components/ui/toast'
import { todayInBrazil } from '@/lib/finance-insights'
import { formatBRL, formatBRLCompact, formatPercent, plural } from '@/lib/format'
import { GOAL_CATEGORIES, normalizeGoalCategory, type GoalCategoryId } from '@/lib/goal-categories'
import { refreshGamification } from '@/components/gamification-data'

const SAVE_FAILED = 'Não foi possível salvar. Verifique a conexão e tente de novo.'
const DELETE_FAILED = 'Não foi possível excluir a meta. Verifique a conexão e tente de novo.'

const CATEGORY_COLORS: Record<GoalCategoryId, string> = {
  emergency: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  travel: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  home: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  vehicle: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  investment: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  other: 'text-slate-400 bg-slate-800/60 border-slate-700/60',
}

const QUICK_AMOUNTS = [50, 100, 200, 500]

type FilterTab = 'all' | 'active' | 'completed'

function amountsOf(goal: Goal) {
  const current = Number(goal.current_amount || 0)
  const target = Number(goal.target_amount || 0)
  return { current, target, isDone: target > 0 && current >= target }
}

// Arredonda para baixo: 99,6% não pode aparecer como 100% com a meta ainda em aberto.
function displayPercent(current: number, target: number, digits: number) {
  if (target <= 0) return 0
  const factor = 10 ** digits
  return Math.min(100, Math.floor((current / target) * 100 * factor) / factor)
}

function dayNumber(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

// Ritmo mensal necessário para chegar ao alvo dentro do prazo.
function calculatePace(goal: Goal, today: string) {
  const { current, target, isDone } = amountsOf(goal)
  if (isDone || !goal.deadline) return null

  const daysLeft = dayNumber(goal.deadline.slice(0, 10)) - dayNumber(today)
  if (daysLeft < 0) return { expired: true as const }

  const monthsLeft = Math.max(1, daysLeft / 30.4)
  return {
    expired: false as const,
    daysLeft,
    monthlyNeeded: Math.ceil((target - current) / monthsLeft),
  }
}

export default function MetasPage() {
  // Ao voltar para esta tela, o cache aparece na hora e os dados atualizam em segundo plano.
  const { data: goals, error, isValidating, mutate: loadGoals } = useSWR('goals', () => getGoals())
  const { open: openQuickAdd } = useQuickAdd()
  const { toast } = useToast()

  const [filterTab, setFilterTab] = useState<FilterTab>('all')

  const [fundsTarget, setFundsTarget] = useState<Goal | null>(null)
  const [fundsOpen, setFundsOpen] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const metrics = useMemo(() => {
    const list = goals ?? []
    let totalTarget = 0
    let totalCurrent = 0
    let totalCounted = 0
    let remainingToSave = 0
    let completedCount = 0
    for (const goal of list) {
      const { current, target, isDone } = amountsOf(goal)
      totalTarget += target
      totalCurrent += current
      // O excedente de uma meta não pode contar como progresso de outra.
      totalCounted += Math.min(current, target)
      remainingToSave += Math.max(0, target - current)
      if (isDone) completedCount += 1
    }
    return {
      totalCurrent,
      remainingToSave,
      completedCount,
      overallProgress: displayPercent(totalCounted, totalTarget, 1),
    }
  }, [goals])

  const filteredGoals = useMemo(() => {
    return (goals ?? []).filter((goal) => {
      const { isDone } = amountsOf(goal)
      if (filterTab === 'active') return !isDone
      if (filterTab === 'completed') return isDone
      return true
    })
  }, [goals, filterTab])

  const goalCount = goals?.length ?? 0
  const today = todayInBrazil()

  const requestDelete = (goal: Goal) => {
    setDeleteTarget(goal)
    setDeleteError(null)
    setDeleteOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const result = await deleteGoal(deleteTarget.id)
      if (!result.success) {
        setDeleteError(result.error)
        return
      }
      setDeleteOpen(false)
      toast({ message: 'Meta excluída.', kind: 'success' })
      void loadGoals()
    } catch {
      setDeleteError(DELETE_FAILED)
    } finally {
      setDeleting(false)
    }
  }

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: `Todas (${goalCount})` },
    { id: 'active', label: `Em curso (${goalCount - metrics.completedCount})` },
    { id: 'completed', label: `Feitas (${metrics.completedCount})` },
  ]

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6 pb-28">
      <div className="flex items-center justify-between gap-2 pb-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <Target className="h-5 w-5 stroke-[2.2]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl leading-tight font-bold tracking-tight text-white">Metas</h1>
            {goalCount > 0 && <p className="text-xs text-slate-400">{plural(goalCount, 'objetivo', 'objetivos')}</p>}
          </div>
        </div>

        {/* Sem metas, a ação fica só no estado vazio, para não haver dois botões iguais. */}
        {goalCount > 0 && (
          <button
            type="button"
            onClick={() => openQuickAdd('goal')}
            className="flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-emerald-500 px-4 text-sm font-bold text-slate-950 shadow-sm shadow-emerald-950/40 transition-transform active:scale-95"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
            Nova Meta
          </button>
        )}
      </div>

      {goals === undefined ? (
        error ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-center">
            <p role="alert" className="text-sm text-rose-200">
              Não foi possível carregar.
            </p>
            <Button variant="secondary" disabled={isValidating} aria-busy={isValidating} onClick={() => void loadGoals()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <SkeletonCards />
        )
      ) : goals.length === 0 ? (
        <div className="flex flex-col gap-3">
          <EmptyState
            icon={Target}
            title="Qual é seu próximo objetivo?"
            description="Defina um valor, escolha um prazo se quiser e acompanhe quanto já guardou."
            actionLabel="Criar meta"
            onAction={() => openQuickAdd('goal')}
          />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-sm text-slate-400">Ou comece por:</span>
            <button
              type="button"
              onClick={() => openQuickAdd('goal', { category: 'emergency' })}
              aria-label="Criar meta de reserva"
              className="flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-slate-700 px-4 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              <Shield className="h-4 w-4 text-amber-400" aria-hidden="true" />
              Reserva
            </button>
            <button
              type="button"
              onClick={() => openQuickAdd('goal', { category: 'travel' })}
              aria-label="Criar meta de viagem"
              className="flex h-11 cursor-pointer items-center gap-1.5 rounded-full border border-slate-700 px-4 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              <Plane className="h-4 w-4 text-sky-400" aria-hidden="true" />
              Viagem
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Falhou só a atualização: o último valor conhecido continua à vista, com o aviso. */}
          {error && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2">
              <p role="alert" className="min-w-0 flex-1 basis-40 text-sm text-amber-200">
                Mostrando dados salvos; não foi possível atualizar.
              </p>
              <Button variant="secondary" disabled={isValidating} aria-busy={isValidating} onClick={() => void loadGoals()}>
                Tentar novamente
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-sm backdrop-blur-md">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-400">Progresso geral</span>
              <span className="font-mono text-sm font-bold text-emerald-400">
                {formatPercent(metrics.overallProgress)}
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900">
              <motion.div
                className="h-full rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${metrics.overallProgress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>

            <div className="grid grid-cols-1 gap-2 border-t border-slate-900 pt-2 min-[360px]:grid-cols-3">
              <div className="min-w-0">
                <span className="block text-xs text-slate-400">Guardado</span>
                <span className="font-mono text-sm font-bold break-words text-white">
                  {formatBRL(metrics.totalCurrent)}
                </span>
              </div>
              <div className="min-w-0">
                <span className="block text-xs text-slate-400">Falta</span>
                <span className="font-mono text-sm font-semibold break-words text-slate-300">
                  {formatBRL(metrics.remainingToSave)}
                </span>
              </div>
              <div className="min-w-0 min-[360px]:text-right">
                <span className="block text-xs text-slate-400">Concluídas</span>
                <span className="font-mono text-sm font-bold text-emerald-400">
                  {metrics.completedCount} de {goals.length}
                </span>
              </div>
            </div>
          </div>

          <div
            role="group"
            aria-label="Filtrar metas"
            className="grid grid-cols-3 rounded-xl border border-slate-800/80 bg-slate-950 p-1 text-xs font-semibold"
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={filterTab === tab.id}
                onClick={() => setFilterTab(tab.id)}
                className={`h-11 cursor-pointer rounded-lg transition-all ${
                  filterTab === tab.id ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {filteredGoals.length === 0 ? (
              filterTab === 'completed' ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Nenhuma meta concluída ainda"
                  description="Quando uma meta chegar ao valor alvo, ela aparece aqui."
                />
              ) : (
                <EmptyState
                  icon={Sparkles}
                  title="Nenhuma meta em curso"
                  description="Todas as suas metas foram concluídas."
                />
              )
            ) : (
              <AnimatePresence initial={false}>
                {filteredGoals.map((goal) => {
                  const { current, target, isDone } = amountsOf(goal)
                  const percent = isDone ? 100 : displayPercent(current, target, 0)
                  const categoryId = normalizeGoalCategory(goal.category)
                  const category = GOAL_CATEGORIES.find((item) => item.id === categoryId) ?? GOAL_CATEGORIES[5]
                  const CategoryIcon = category.icon
                  const pace = calculatePace(goal, today)
                  const contribution = Number(goal.monthly_contribution || 0)

                  return (
                    <motion.div
                      key={goal.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className={`flex flex-col gap-3 rounded-2xl border p-4 transition-all ${
                        isDone ? 'border-emerald-500/30 bg-slate-950/70' : 'border-slate-800/80 bg-slate-950/80 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className={`shrink-0 rounded-xl border p-2 ${CATEGORY_COLORS[categoryId]}`}>
                            <CategoryIcon className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="min-w-0 text-sm font-bold break-words text-white">{goal.title}</span>
                              {isDone && (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                              )}
                            </div>
                            <span className="block text-xs text-slate-400">{category.label}</span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-bold text-emerald-400">
                            {formatPercent(percent, { digits: 0 })}
                          </span>
                          <button
                            type="button"
                            onClick={() => requestDelete(goal)}
                            className="-mr-2 flex size-11 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-all hover:text-rose-400 active:scale-90 active:bg-rose-500/10"
                            aria-label={`Excluir meta ${goal.title}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isDone ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                        <div>
                          <span className="block text-xs text-slate-400">Alcançado</span>
                          <span className="font-mono font-bold text-white">{formatBRL(current)}</span>
                        </div>
                        <div className="text-right">
                          <span className="block text-xs text-slate-400">Alvo</span>
                          <span className="font-mono font-semibold text-slate-300">{formatBRL(target)}</span>
                        </div>
                      </div>

                      {/* Sem truncar: em 320 px o ritmo quebra a linha e, se precisar, o botão desce. */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-900 pt-2 text-xs">
                        <div className="min-w-0 flex-1 basis-32 text-slate-400">
                          {isDone ? (
                            <span className="flex items-center gap-1 font-medium text-emerald-400">
                              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Meta conquistada!
                            </span>
                          ) : pace?.expired ? (
                            <span className="flex items-center gap-1 text-rose-400">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Prazo encerrado
                            </span>
                          ) : pace ? (
                            <span className="flex items-start gap-1">
                              <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="min-w-0">
                                <strong className="block font-mono break-words text-slate-200">
                                  ~{formatBRL(pace.monthlyNeeded)}/mês
                                </strong>
                                {pace.daysLeft === 0
                                  ? 'O prazo termina hoje'
                                  : plural(pace.daysLeft, 'dia restante', 'dias restantes')}
                              </span>
                            </span>
                          ) : contribution > 0 ? (
                            <span>Aporte previsto: {formatBRL(contribution)}/mês</span>
                          ) : (
                            <span>Sem prazo definido</span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setFundsTarget(goal)
                            setFundsOpen(true)
                          }}
                          aria-label={`Movimentar ${goal.title}`}
                          className="flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 text-xs font-semibold text-slate-200 transition-all active:scale-95 active:border-emerald-500/50"
                        >
                          <Coins className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                          Movimentar
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            )}
          </div>
        </>
      )}

      {fundsTarget && (
        <FundsGoalModal
          key={fundsTarget.id}
          goal={fundsTarget}
          open={fundsOpen}
          onOpenChange={setFundsOpen}
          onClosed={() => setFundsTarget(null)}
          onSuccess={() => void loadGoals()}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Excluir ${deleteTarget?.title ?? 'meta'}?`}
        description="A meta e o valor registrado nela serão removidos. Seu dinheiro real não é afetado."
        confirmLabel="Excluir meta"
        destructive
        loading={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </main>
  )
}

function FundsGoalModal({
  goal,
  open,
  onOpenChange,
  onClosed,
  onSuccess,
}: {
  goal: Goal
  open: boolean
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  onSuccess: () => void
}) {
  const { toast } = useToast()
  const formId = useId()

  const [amount, setAmount] = useState<number | null>(null)
  const [mode, setMode] = useState<'add' | 'withdraw'>('add')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const handleOpenChange = (next: boolean) => {
    // Fechar no meio do envio esconderia o resultado.
    if (loading && !next) return
    onOpenChange(next)
  }

  const changeAmount = (value: number | null) => {
    setAmount(value)
    setFormError(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (loading || amount == null || amount <= 0) return

    setLoading(true)
    setFormError(null)
    try {
      const result = await addFundsToGoal(goal.id, mode === 'add' ? amount : -amount)
      if (!result.success) {
        setFormError(result.error)
        return
      }
      onOpenChange(false)
      toast({ message: mode === 'add' ? 'Valor adicionado à meta.' : 'Valor retirado da meta.', kind: 'success' })
      if (mode === 'add') refreshGamification()
      onSuccess()
    } catch {
      setFormError(SAVE_FAILED)
    } finally {
      setLoading(false)
    }
  }

  const modes = [
    { id: 'add' as const, label: 'Adicionar', icon: ArrowDownLeft, activeClass: 'bg-emerald-500 font-bold text-slate-950 shadow-sm' },
    { id: 'withdraw' as const, label: 'Retirar', icon: ArrowUpRight, activeClass: 'bg-rose-700 font-bold text-white shadow-sm' },
  ]

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      onClosed={onClosed}
      title={`Movimentar ${goal.title}`}
      description={`Guardado até agora: ${formatBRL(Number(goal.current_amount || 0))}`}
      footer={
        <>
          <Button variant="secondary" className="flex-1" disabled={loading} onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={loading || amount == null}
            aria-busy={loading}
            className={`flex-1 ${mode === 'withdraw' ? 'bg-rose-700 text-white hover:bg-rose-600' : ''}`}
          >
            {mode === 'add' ? 'Adicionar' : 'Retirar'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div
          role="group"
          aria-label="Tipo de movimentação"
          className="grid grid-cols-2 rounded-xl border border-slate-800 bg-slate-950 p-1 text-sm font-semibold"
        >
          {modes.map(({ id, label, icon: Icon, activeClass }) => (
            <button
              key={id}
              type="button"
              disabled={loading}
              aria-pressed={mode === id}
              onClick={() => {
                setMode(id)
                setFormError(null)
              }}
              className={`flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg transition-all disabled:opacity-60 ${
                mode === id ? activeClass : 'text-slate-400'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <Field label={mode === 'add' ? 'Valor a adicionar' : 'Valor a retirar'}>
          {({ id, describedBy }) => (
            <MoneyInput
              id={id}
              value={amount}
              disabled={loading}
              aria-describedby={describedBy}
              onValueChange={changeAmount}
            />
          )}
        </Field>

        {/* Os atalhos só preenchem o campo: um toque por engano não pode alterar o valor guardado. */}
        <div role="group" aria-label="Valores sugeridos" className="grid grid-cols-4 gap-1.5">
          {QUICK_AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={loading}
              aria-pressed={amount === value}
              onClick={() => changeAmount(value)}
              className={`h-11 cursor-pointer rounded-lg border text-xs font-bold transition-transform active:scale-95 disabled:opacity-60 ${
                amount === value
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-800 bg-slate-950 text-slate-300'
              }`}
            >
              {formatBRLCompact(value)}
            </button>
          ))}
        </div>

        {formError && (
          <p role="alert" className="text-sm text-rose-400">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  )
}
