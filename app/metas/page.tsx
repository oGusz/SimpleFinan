'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target,
  Plus,
  TrendingUp,
  Calendar,
  AlertTriangle,
  Loader2,
  Trash2,
  Coins,
  CheckCircle2,
  X,
  Sparkles,
} from 'lucide-react'
import { getGoals, createGoal, deleteGoal, addFundsToGoal } from '@/app/actions/finance'

export interface Goal {
  id: string
  title: string
  target_amount: number
  current_amount: number
  deadline?: string
  category?: string
}

export default function MetasPage() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)

  // Modais
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [aporteTarget, setAporteTarget] = useState<Goal | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)

  // Carregamento dos dados
  const loadGoals = async () => {
    try {
      setLoading(true)
      const data = await getGoals()
      setGoals(data)
    } catch (err) {
      console.error('Erro ao carregar metas:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGoals()
  }, [])

  // Métricas agregadas do topo
  const metrics = useMemo(() => {
    const totalTarget = goals.reduce((acc, g) => acc + Number(g.target_amount || 0), 0)
    const totalCurrent = goals.reduce((acc, g) => acc + Number(g.current_amount || 0), 0)
    const overallProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0
    const completedGoals = goals.filter((g) => Number(g.current_amount) >= Number(g.target_amount)).length

    return { totalTarget, totalCurrent, overallProgress, completedGoals }
  }, [goals])

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 space-y-5 select-none pb-24">
      
      {/* 1. CABEÇALHO COM TÍTULO E BOTÃO NOVA META */}
      <div className="flex flex-col gap-3 w-full pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                Metas Financeiras
              </h1>
              <p className="text-xs text-slate-400">
                {goals.length} objetivo{goals.length === 1 ? '' : 's'} cadastrado{goals.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-bold bg-emerald-500 text-slate-950 active:scale-95 transition-all shadow-sm shadow-emerald-950/40"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Nova Meta</span>
          </button>
        </div>

        {/* 2. CARD RESUMO GERAL (PATRIMÔNIO ALOCADO VS METAS) */}
        <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 backdrop-blur-sm flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Progresso Total</span>
            <span className="text-emerald-400 font-bold font-mono">
              {metrics.overallProgress.toFixed(1)}%
            </span>
          </div>

          {/* Barra de Progresso Global */}
          <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, metrics.overallProgress)}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>

          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-900">
            <div>
              <span className="text-[10px] text-slate-500 block">Acumulado</span>
              <span className="font-bold text-white font-mono">
                R$ {metrics.totalCurrent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-500 block">Objetivo Total</span>
              <span className="font-bold text-slate-300 font-mono">
                R$ {metrics.totalTarget.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. LISTAGEM DE METAS EM CARDS VERTICAIS */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center rounded-2xl border border-slate-800/80 bg-slate-950/40">
            <Target className="h-8 w-8 text-slate-600 mb-2 stroke-[1.5]" />
            <p className="text-xs font-semibold text-slate-300">Nenhuma meta criada</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Defina um objetivo para acompanhar suas economias e aportes.
            </p>
          </div>
        ) : (
          goals.map((goal) => {
            const current = Number(goal.current_amount || 0)
            const target = Number(goal.target_amount || 1)
            const percent = Math.min(100, (current / target) * 100)
            const isCompleted = current >= target

            return (
              <motion.div
                key={goal.id}
                layout
                className={`p-4 rounded-2xl border transition-all flex flex-col gap-3.5 ${
                  isCompleted
                    ? 'bg-slate-950/60 border-emerald-500/30'
                    : 'bg-slate-950/80 border-slate-800/80'
                }`}
              >
                {/* Linha 1: Título, Status e Exclusão */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    ) : (
                      <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
                    )}
                    <span className="font-bold text-white text-sm">
                      {goal.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {percent.toFixed(0)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(goal)}
                      className="text-slate-500 hover:text-rose-400 active:scale-90 p-1 transition-all"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Linha 2: Barra de Progresso com Cor Dinâmica */}
                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isCompleted ? 'bg-emerald-400 shadow-sm shadow-emerald-400/30' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                {/* Linha 3: Valores Numéricos */}
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Guardado</span>
                    <span className="font-bold text-white font-mono">
                      R$ {current.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">Meta Final</span>
                    <span className="font-semibold text-slate-300 font-mono">
                      R$ {target.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Linha 4: Prazo e Botão de Aporte Rápido */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <Calendar className="h-3.5 w-3.5 text-slate-500" />
                    <span>
                      {goal.deadline
                        ? `Prazo: ${new Date(goal.deadline).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`
                        : 'Sem prazo'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAporteTarget(goal)}
                    className="flex items-center gap-1 h-7 px-3 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 active:scale-95 font-semibold text-xs transition-transform"
                  >
                    <Coins className="h-3 w-3" />
                    <span>Aportar</span>
                  </button>
                </div>
              </motion.div>
            )
          })
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

      {/* MODAL: APORTE RÁPIDO */}
      {aporteTarget && (
        <AporteGoalModal
          goal={aporteTarget}
          onClose={() => setAporteTarget(null)}
          onSuccess={() => {
            setAporteTarget(null)
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
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Nova Meta</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Título da Meta</label>
            <input
              type="text"
              placeholder="Ex: Viagem Japão, Reserva..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-slate-400 block mb-1">Valor Alvo (R$)</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="10000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white outline-none focus:border-emerald-500 font-mono"
                required
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Já Guardado (R$)</label>
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
            <label className="text-slate-400 block mb-1">Prazo (opcional)</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full h-9 rounded-xl bg-slate-950 border border-slate-800 px-3 text-white outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
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
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 active:scale-95 transition-all shadow-sm"
          >
            {isSubmitting ? 'Salvando...' : 'Criar Meta'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AporteGoalModal({
  goal,
  onClose,
  onSuccess,
}: {
  goal: Goal
  onClose: () => void
  onSuccess: () => void
}) {
  const [val, setVal] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAporte = async (amount: number) => {
    if (amount <= 0) return
    try {
      setLoading(true)
      await addFundsToGoal(goal.id, amount)
      onSuccess()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Aportar em Meta</h3>
            <p className="text-xs text-slate-400">{goal.title}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
          <span className="text-xs font-semibold text-slate-500 mr-2">R$</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="w-full bg-transparent font-bold text-sm text-emerald-400 outline-none"
          />
        </div>

        {/* Atalhos Rápidos */}
        <div className="grid grid-cols-4 gap-1.5">
          {[50, 100, 200, 500].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => handleAporte(v)}
              className="py-1.5 rounded-lg border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 active:scale-95 transition-transform"
            >
              +{v}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-slate-400"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={loading || Number(val) <= 0}
            onClick={() => handleAporte(Number(val))}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Confirmando...' : 'Confirmar Aporte'}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Excluir meta</h3>
            <p className="text-xs text-slate-400 mt-1">
              Deseja remover a meta <span className="font-semibold text-rose-400">"{goal.title}"</span>? Os dados acumulados serão apagados.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleDelete}
            className="px-4 py-1.5 rounded-xl text-xs font-bold bg-rose-500 text-white active:scale-95"
          >
            {loading ? 'Excluindo...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}