'use client'

import { useState } from 'react'
import { Plus, Target } from 'lucide-react'
import { createGoal } from '@/app/actions/finance'

interface CreateGoalModalProps {
  onSuccess?: () => void
}

export function CreateGoalModal({ onSuccess }: CreateGoalModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const [title, setTitle] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [currentAmount, setCurrentAmount] = useState('')
  const [monthlyContribution, setMonthlyContribution] = useState('')
  const [category, setCategory] = useState('Reserva')
  const [deadline, setDeadline] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title || !targetAmount) return

    setLoading(true)
    try {
      await createGoal({
        title,
        target_amount: parseFloat(targetAmount),
        current_amount: currentAmount ? parseFloat(currentAmount) : 0,
        monthly_contribution: monthlyContribution ? parseFloat(monthlyContribution) : 0,
        category,
        deadline: deadline || undefined,
      })

      setTitle('')
      setTargetAmount('')
      setCurrentAmount('')
      setMonthlyContribution('')
      setDeadline('')
      setIsOpen(false)
      if (onSuccess) onSuccess()
    } catch (err) {
      console.error(err)
      alert('Erro ao criar meta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
      >
        <Plus className="h-4 w-4" />
        <span>Nova Meta</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-4 mb-4">
              <Target className="h-5 w-5 text-emerald-400" />
              <h2 className="text-base font-semibold text-slate-100">Criar Nova Meta</h2>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Título da Meta</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Reserva de Emergência, Viagem Japão"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Valor Alvo (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="10000.00"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Já Guardado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={currentAmount}
                    onChange={(e) => setCurrentAmount(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Aporte Mensal Previsto</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="500.00"
                    value={monthlyContribution}
                    onChange={(e) => setMonthlyContribution(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Categoria</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Reserva">Reserva</option>
                    <option value="Investimento">Aporte Anual / Inv.</option>
                    <option value="Viagem">Viagem</option>
                    <option value="Bens">Aquisição / Bens</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Data Limite (Opcional)</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800 mt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg px-4 py-2 text-slate-400 hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-white font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Criar Meta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}