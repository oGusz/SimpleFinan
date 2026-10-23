'use client'

import { useState } from 'react'
import { createBill } from '@/app/actions/bills'
import { Plus, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function CreateBillModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const formData = new FormData(event.currentTarget)
    const res = await createBill(formData)

    setLoading(false)

    if (res?.success) {
      setIsOpen(false)
    } else {
      setErrorMsg(res?.error || 'Erro ao cadastrar boleto.')
    }
  }

  return (
    <>
      {/* Botão Animado */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => setIsOpen(true)}
        className="group flex cursor-pointer justify-center items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-md transition-colors hover:bg-emerald-500 active:scale-95"
      >
        <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
        <span>Novo Boleto / Conta</span>
      </motion.button>

      {/* Modal com Entrada e Saída Suaves */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop com Fade */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />

            {/* Conteúdo com Scale + Fade */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-slate-100 z-10"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <h3 className="text-lg font-semibold">Cadastrar Nova Conta</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="cursor-pointer rounded p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                {errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded bg-red-500/10 p-3 text-xs text-red-400 border border-red-500/20"
                  >
                    {errorMsg}
                  </motion.div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Descrição / Título
                  </label>
                  <input
                    type="text"
                    name="title"
                    required
                    placeholder="Ex: Fatura Cartão C6, Aluguel..."
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Valor (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      name="amount"
                      required
                      placeholder="0,00"
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Vencimento
                    </label>
                    <input
                      type="date"
                      name="due_date"
                      required
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Categoria
                  </label>
                  <select
                    name="category"
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none transition-colors"
                  >
                    <option value="Moradia">Moradia</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Serviços">Serviços / Assinaturas</option>
                    <option value="Alimentação">Alimentação</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="is_recurring"
                    name="is_recurring"
                    className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-0"
                  />
                  <label htmlFor="is_recurring" className="text-xs text-slate-300">
                    Conta recorrente (mensal)
                  </label>
                </div>

                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    disabled={loading}
                    className="cursor-pointer rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Salvando...' : 'Cadastrar'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}