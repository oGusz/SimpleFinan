'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target,
  Plus,
  Calendar,
  Trash2,
  Coins,
  CheckCircle2,
  X,
  Sparkles,
  Shield,
  Plane,
  Home,
  Car,
  TrendingUp,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { getGoals, createGoal, deleteGoal, addFundsToGoal } from '@/app/actions/finance'
import { BottomNav } from '@/components/bottom-nav'

export interface Goal {
  id: string
  title: string
  target_amount: number
  current_amount: number
  deadline?: string
  category?: 'emergency' | 'travel' | 'home' | 'vehicle' | 'investment' | 'other'
}

const CATEGORY_MAP: Record<string, { label: string; icon: any; color: string }> = {
  emergency: { label: 'Reserva', icon: Shield, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  travel: { label: 'Viagem', icon: Plane, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  home: { label: 'Imóvel', icon: Home, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  vehicle: { label: 'Veículo', icon: Car, color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  investment: { label: 'Investimento', icon: TrendingUp, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  other: { label: 'Objetivo', icon: Target, color: 'text-slate-400 bg-slate-800/60 border-slate-700/60' },
}

export default function MetasPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'completed'>('all')

  // Modais
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [fundsModalTarget, setFundsModalTarget] = useState<Goal | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)

  const loadGoals = async () => {
    try {
      setLoading(true)
      const data = await getGoals()
      setGoals((data || []) as unknown as Goal[])
    } catch (err) {
      console.error('Erro ao carregar metas:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGoals()
  }, [])

  // Métricas do Topo
  const metrics = useMemo(() => {
    const totalTarget = goals.reduce((acc, g) => acc + Number(g.target_amount || 0), 0)
    const totalCurrent = goals.reduce((acc, g) => acc + Number(g.current_amount || 0), 0)
    const overallProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0
    const completedCount = goals.filter((g) => Number(g.current_amount) >= Number(g.target_amount)).length
    const remainingToSave = Math.max(0, totalTarget - totalCurrent)

    return { totalTarget, totalCurrent, overallProgress, completedCount, remainingToSave }
  }, [goals])

  // Filtragem da lista
  const filteredGoals = useMemo(() => {
    return goals.filter((goal) => {
      const isDone = Number(goal.current_amount) >= Number(goal.target_amount)
      if (filterTab === 'active') return !isDone
      if (filterTab === 'completed') return isDone
      return true
    })
  }, [goals, filterTab])

  // Cálculo de ritmo mensal necessário
  const calculatePace = (goal: Goal) => {
    const current = Number(goal.current_amount || 0)
    const target = Number(goal.target_amount || 0)
    if (current >= target || !goal.deadline) return null

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [y, m, d] = goal.deadline.split('T')[0].split('-').map(Number)
    const deadlineDate = new Date(y, m - 1, d)

    const diffMs = deadlineDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays <= 0) return { expired: true, text: 'Prazo encerrado' }

    const diffMonths = Math.max(1, diffDays / 30.4)
    const remainingAmount = target - current
    const monthlyNeeded = remainingAmount / diffMonths

    return {
      expired: false,
      diffDays,
      monthlyNeeded: Math.ceil(monthlyNeeded),
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-4 select-none pb-28">
      
      {/* 1. CABEÇALHO */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Target className="h-5 w-5 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-tight">
              Metas
            </h1>
            <p className="text-xs text-slate-400">
              {goals.length} objetivo{goals.length === 1 ? '' : 's'} monitorado{goals.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsNewModalOpen(true)}
          className="flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-bold bg-emerald-500 text-slate-950 active:scale-95 transition-transform shadow-sm shadow-emerald-950/40"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span>Nova Meta</span>
        </button>
      </div>

      {/* 2. CARD RESUMO GERAL ESTILO APPLE FITNESS / CARTEIRA */}
      <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-950/70 backdrop-blur-md flex flex-col gap-3 shadow-sm">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium">Progresso Global</span>
          <span className="text-emerald-400 font-bold font-mono text-sm">
            {metrics.overallProgress.toFixed(1)}%
          </span>
        </div>

        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-emerald-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, metrics.overallProgress)}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-900 text-xs">
          <div>
            <span className="text-[10px] text-slate-500 block">Guardado</span>
            <span className="font-bold text-white font-mono text-[13px]">
              R$ {metrics.totalCurrent.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 block">Falta</span>
            <span className="font-semibold text-slate-300 font-mono text-[13px]">
              R$ {metrics.remainingToSave.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-500 block">Concluídas</span>
            <span className="font-bold text-emerald-400 font-mono text-[13px]">
              {metrics.completedCount} de {goals.length}
            </span>
          </div>
        </div>
      </div>

      {/* 3. SEGMENTED CONTROL (ABAS DE FILTRO) */}
      <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-950 border border-slate-800/80 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setFilterTab('all')}
          className={`py-1.5 rounded-lg transition-all ${
            filterTab === 'all'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Todas ({goals.length})
        </button>

        <button
          type="button"
          onClick={() => setFilterTab('active')}
          className={`py-1.5 rounded-lg transition-all ${
            filterTab === 'active'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Em curso ({goals.length - metrics.completedCount})
        </button>

        <button
          type="button"
          onClick={() => setFilterTab('completed')}
          className={`py-1.5 rounded-lg transition-all ${
            filterTab === 'completed'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Feitas ({metrics.completedCount})
        </button>
      </div>

      {/* 4. LISTA DE CARDS DAS METAS */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
          </div>
        ) : filteredGoals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl border border-slate-800/80 bg-slate-950/40">
            <Target className="h-8 w-8 text-slate-600 mb-2 stroke-[1.5]" />
            <p className="text-xs font-semibold text-slate-300">Nenhuma meta encontrada</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Crie uma meta para começar a poupar com direção.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filteredGoals.map((goal) => {
              const current = Number(goal.current_amount || 0)
              const target = Number(goal.target_amount || 1)
              const percent = Math.min(100, (current / target) * 100)
              const isCompleted = current >= target
              const cat = CATEGORY_MAP[goal.category || 'other'] || CATEGORY_MAP.other
              const CategoryIcon = cat.icon
              const pace = calculatePace(goal)

              return (
                <motion.div
                  key={goal.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className={`p-4 rounded-2xl border transition-all flex flex-col gap-3 ${
                    isCompleted
                      ? 'bg-slate-950/70 border-emerald-500/30'
                      : 'bg-slate-950/80 border-slate-800/80 shadow-sm'
                  }`}
                >
                  {/* Linha 1: Categoria, Título e Ação de Excluir */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-2 rounded-xl border shrink-0 ${cat.color}`}>
                        <CategoryIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white text-sm truncate">
                            {goal.title}
                          </span>
                          {isCompleted && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 block">
                          {cat.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        {percent.toFixed(0)}%
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(goal)}
                        className="text-slate-500 hover:text-rose-400 active:scale-90 p-1.5 rounded-lg active:bg-rose-500/10 transition-all"
                        aria-label="Excluir meta"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Linha 2: Barra de Progresso com Glow Suave */}
                  <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCompleted
                          ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Linha 3: Valores Financeiros */}
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Alcançado</span>
                      <span className="font-bold text-white font-mono">
                        R$ {current.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block">Alvo Total</span>
                      <span className="font-semibold text-slate-300 font-mono">
                        R$ {target.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Linha 4: Ritmo / Prazo + Botão de Movimentar */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] truncate pr-2">
                      {isCompleted ? (
                        <span className="text-emerald-400 font-medium flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5" /> Meta conquistada!
                        </span>
                      ) : pace?.expired ? (
                        <span className="text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" /> Prazo final esgotado
                        </span>
                      ) : pace ? (
                        <span className="text-slate-400 flex items-center gap-1 truncate">
                          <Clock className="h-3 w-3 text-slate-500 shrink-0" />
                          <strong className="text-slate-200 font-mono">
                            ~R$ {(pace.monthlyNeeded ?? 0).toLocaleString('pt-BR')}/mês
                          </strong>
                          <span className="text-slate-500">({pace.diffDays} dias)</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">Sem data limite definida</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setFundsModalTarget(goal)}
                      className="flex items-center gap-1 h-7 px-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 active:scale-95 font-semibold text-xs active:border-emerald-500/50 transition-all shrink-0"
                    >
                      <Coins className="h-3 w-3 text-emerald-400" />
                      <span>Movimentar</span>
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      {/* MODAL: NOVA META */}
      <NewGoalModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreated={() => {
          setIsNewModalOpen(false)
          loadGoals()
        }}
      />

      {/* MODAL: APORTE / RESGATE DE FUNDOS */}
      {fundsModalTarget && (
        <FundsGoalModal
          goal={fundsModalTarget}
          onClose={() => setFundsModalTarget(null)}
          onSuccess={() => {
            setFundsModalTarget(null)
            loadGoals()
          }}
        />
      )}

      {/* MODAL: EXCLUSÃO */}
      {deleteTarget && (
        <DeleteGoalModal
          goal={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSuccess={() => {
            setDeleteTarget(null)
            loadGoals()
          }}
        />
      )}

      {/* Barra de Navegação Fixa */}
      <BottomNav />
    </div>
  )
}

// ---------------- SUBCOMPONENTES / MODAIS ----------------

function NewGoalModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [currentAmount, setCurrentAmount] = useState('')
  const [deadline, setDeadline] = useState('')
  const [category, setCategory] = useState<string>('other')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !targetAmount) return

    try {
      setIsSubmitting(true)
      await createGoal({
        title,
        target_amount: Number(targetAmount),
        current_amount: Number(currentAmount || 0),
        deadline: deadline || undefined,
        category,
      })
      onCreated()
    } catch (err) {
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-3.5 select-none"
      >
        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
          <h3 className="text-base font-bold text-white">Criar Nova Meta</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1 font-medium">Nome do Objetivo</label>
            <input
              type="text"
              placeholder="Ex: Reserva, Viagem à Europa..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-medium">Categoria</label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.entries(CATEGORY_MAP).map(([key, item]) => {
                const Icon = item.icon
                const isSelected = category === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCategory(key)}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-[11px] font-semibold active:scale-95 transition-all ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 block mb-1 font-medium">Valor Alvo (R$)</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="10000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 px-3 text-emerald-400 font-bold outline-none focus:border-emerald-500 font-mono"
                required
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1 font-medium">Já Poupei (R$)</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-400 block mb-1 font-medium">Prazo Estimado (opcional)</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 active:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 active:scale-95 transition-transform shadow-sm"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar Meta'}
          </button>
        </div>
      </form>
    </div>
  )
}

function FundsGoalModal({
  goal,
  onClose,
  onSuccess,
}: {
  goal: Goal
  onClose: () => void
  onSuccess: () => void
}) {
  const [val, setVal] = useState('')
  const [mode, setMode] = useState<'add' | 'withdraw'>('add')
  const [loading, setLoading] = useState(false)

  const handleAction = async (amount: number) => {
    if (amount <= 0) return
    try {
      setLoading(true)
      const finalAmount = mode === 'add' ? amount : -amount
      await addFundsToGoal(goal.id, finalAmount)
      onSuccess()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-white">Movimentar Valor</h3>
            <p className="text-[11px] text-slate-400">{goal.title}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chave de Seleção: Aporte ou Resgate */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('add')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
              mode === 'add'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400'
            }`}
          >
            <ArrowDownLeft className="h-3.5 w-3.5" />
            <span>Aportar (+)</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('withdraw')}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
              mode === 'withdraw'
                ? 'bg-rose-500 text-white font-bold shadow-sm'
                : 'text-slate-400'
            }`}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>Retirar (-)</span>
          </button>
        </div>

        {/* Campo de Valor */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
          <span className="text-xs font-semibold text-slate-500 mr-2">R$</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="w-full bg-transparent font-bold text-sm text-emerald-400 outline-none font-mono"
          />
        </div>

        {/* Atalhos Rápidos */}
        <div className="grid grid-cols-4 gap-1.5">
          {[50, 100, 200, 500].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => handleAction(v)}
              className="py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 active:scale-95 transition-transform"
            >
              {mode === 'add' ? `+${v}` : `-${v}`}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-slate-400 active:bg-slate-800 rounded-xl"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading || Number(val) <= 0}
            onClick={() => handleAction(Number(val))}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold active:scale-95 transition-transform disabled:opacity-50 ${
              mode === 'add' ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
            }`}
          >
            {loading ? 'Processando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteGoalModal({
  goal,
  onClose,
  onSuccess,
}: {
  goal: Goal
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    try {
      setLoading(true)
      await deleteGoal(goal.id)
      onSuccess()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Excluir meta</h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Deseja remover <span className="font-semibold text-rose-400">"{goal.title}"</span>? O histórico de aportes vinculado será excluído permanentemente.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300 active:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleDelete}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-500 text-white active:scale-95 transition-transform"
          >
            {loading ? 'Excluindo...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}