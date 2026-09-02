'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { updateBill } from '@/app/actions/finance'

interface Bill {
  id: string
  title: string
  amount: number
  due_date: string
}

interface EditBillModalProps {
  bill: Bill
  onSuccess?: () => void
}

export function EditBillModal({ bill, onSuccess }: EditBillModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [amount, setAmount] = useState(bill.amount)
  const initialDate = bill.due_date ? bill.due_date.split('T')[0] : ''
  const [dueDate, setDueDate] = useState(initialDate)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      await updateBill(bill.id, {
        amount: Number(amount),
        dueDate,
      })
      setIsOpen(false)
      if (onSuccess) onSuccess()
    } catch (error) {
      console.error('Erro ao editar conta:', error)
      alert('Falha ao atualizar a conta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Botão com animação de clique (active:scale-95) */}
      <button
        onClick={() => setIsOpen(true)}
        className="cursor-pointer rounded p-1.5 text-muted-foreground hover:bg-slate-800 hover:text-foreground active:scale-90 transition-all duration-150"
        title="Editar conta"
      >
        <Pencil className="h-4 w-4" />
      </button>

      {/* Modal Suave com Framer Motion */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop com Fade In/Out */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Conteúdo do Modal com Zoom In/Out */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl z-10"
            >
              <h3 className="text-lg font-medium text-foreground mb-4">
                Editar Conta: {bill.title}
              </h3>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Valor (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    Data de Vencimento
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                  />
                </div>

                <div className="flex justify-end gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="cursor-pointer rounded px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary active:scale-95 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="cursor-pointer rounded bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {loading ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}