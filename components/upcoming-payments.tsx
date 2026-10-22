'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Check,
  Calendar,
  AlertCircle,
  Clock,
  CalendarCheck,
  Trash2,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { EditBillModal } from '@/components/bills/EditBillModal'
import { toggleBillStatus, deleteBill } from '@/app/actions/finance'

interface UpcomingPaymentsProps {
  bills: any[]
  onStatusChange?: () => void
}

export function UpcomingPayments({ bills = [], onStatusChange }: UpcomingPaymentsProps) {
  const [billToDelete, setBillToDelete] = useState<{ id: string; title: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleToggle = async (id: string, isCurrentlyPaid: boolean) => {
    try {
      await toggleBillStatus(id, !isCurrentlyPaid)
      if (onStatusChange) onStatusChange()
    } catch (error) {
      console.error('Erro ao alterar status:', error)
    }
  }

  const handleDelete = async () => {
    if (!billToDelete) return

    try {
      setIsDeleting(true)
      setDeleteError(null)
      await deleteBill(billToDelete.id)
      if (onStatusChange) onStatusChange()
      setBillToDelete(null)
    } catch (error: any) {
      console.error('Erro ao excluir conta:', error)
      setDeleteError(error?.message || 'Falha ao excluir conta. Tente novamente.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Identifica a urgência da data de vencimento
  const getDueBadge = (dueDateStr: string, isPaid: boolean) => {
    if (isPaid) return null
    if (!dueDateStr) return null

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [year, month, day] = dueDateStr.split('T')[0].split('-').map(Number)
    const dueDate = new Date(year, month - 1, day)
    dueDate.setHours(0, 0, 0, 0)

    const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
      return {
        label: 'Atrasado',
        className: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        icon: AlertCircle,
      }
    }
    if (diffDays === 0) {
      return {
        label: 'Vence Hoje',
        className: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        icon: Clock,
      }
    }
    if (diffDays === 1) {
      return {
        label: 'Amanhã',
        className: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
        icon: Clock,
      }
    }
    return null
  }

  const pendingCount = useMemo(() => {
    return bills.filter((b) => b.status !== 'paid').length
  }, [bills])

  return (
    <>
      <div className="flex flex-col gap-3 w-full select-none">
        
        {/* CABEÇALHO DA SEÇÃO */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-tight">
              Próximos Vencimentos
            </h3>
          </div>

          <span className="text-[11px] font-medium text-slate-400 bg-slate-900 px-2.5 py-0.5 rounded-full border border-slate-800">
            {pendingCount === 0 ? 'Tudo pago' : `${pendingCount} pendente(s)`}
          </span>
        </div>

        {/* LISTA DE CONTAS */}
        <div className="flex flex-col gap-2">
          {bills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl border border-slate-800/80 bg-slate-950/40">
              <Calendar className="h-6 w-6 text-slate-600 mb-2" />
              <p className="text-xs font-medium text-slate-300">Nenhuma conta agendada</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Cadastre suas despesas mensais para acompanhamento.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {bills.map((bill) => {
                const isPaid = bill.status === 'paid'
                const badge = getDueBadge(bill.due_date, isPaid)
                const formattedDate = new Date(bill.due_date).toLocaleDateString('pt-BR', {
                  timeZone: 'UTC',
                  day: '2-digit',
                  month: 'short',
                })

                return (
                  <motion.div
                    key={bill.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                      isPaid
                        ? 'bg-slate-950/40 border-slate-800/50 opacity-60'
                        : 'bg-slate-950/80 border-slate-800/90 shadow-sm'
                    }`}
                  >
                    {/* CHECKBOX CIRCULAR E DADOS */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => handleToggle(bill.id, isPaid)}
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
                          isPaid
                            ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20'
                            : 'border-2 border-slate-700 bg-slate-900/50 hover:border-emerald-500'
                        }`}
                        aria-label={isPaid ? 'Marcar como pendente' : 'Marcar como pago'}
                      >
                        {isPaid && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </button>

                      <div
                        onClick={() => handleToggle(bill.id, isPaid)}
                        className="flex flex-col min-w-0 cursor-pointer active:opacity-75 transition-opacity"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-sm font-semibold truncate ${
                              isPaid ? 'line-through text-slate-500' : 'text-white'
                            }`}
                          >
                            {bill.title || bill.description || 'Conta'}
                          </span>

                          {badge && (
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${badge.className}`}
                            >
                              <badge.icon className="h-2.5 w-2.5" />
                              {badge.label}
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-slate-400 capitalize">
                          Vencimento: {formattedDate}
                        </span>
                      </div>
                    </div>

                    {/* VALOR E AÇÕES (EDITAR E EXCLUIR) */}
                    <div className="flex items-center gap-2 shrink-0 pl-3">
                      <span
                        className={`text-sm font-bold font-mono ${
                          isPaid ? 'line-through text-slate-500' : 'text-slate-200'
                        }`}
                      >
                        R$ {Number(bill.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>

                      {/* Divisor vertical */}
                      <div className="h-4 w-[1px] bg-slate-800/80 mx-1" />

                      {/* Modal de Edição */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <EditBillModal bill={bill} onSuccess={onStatusChange} />
                      </div>

                      {/* Botão de Excluir */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteError(null)
                          setBillToDelete({
                            id: bill.id,
                            title: bill.title || bill.description || 'esta conta',
                          })
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:text-rose-400 active:text-rose-400 active:bg-rose-500/10 active:scale-90 transition-all"
                        aria-label="Excluir conta"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {billToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Excluir conta
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Deseja excluir permanentemente <span className="font-semibold text-rose-400">"{billToDelete.title}"</span>? Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setBillToDelete(null)}
                disabled={isDeleting}
                className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-xs font-semibold text-slate-300 active:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-xs font-bold text-white active:bg-rose-600 disabled:opacity-50 transition-colors shadow-sm shadow-rose-950/40"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Confirmar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}